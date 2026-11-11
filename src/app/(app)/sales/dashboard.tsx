"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SalesData, SalesRow } from "@/lib/sales-data";
import type { SyncStatus } from "@/lib/wb-sync";
import { Icon } from "@/components/icons";
import { refreshSales } from "./actions";

// ───── Форматирование ─────
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (v: number) => nf.format(Math.round(v)).replace("-", "−");
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const parseDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const sum = (a: number[], from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i]; return s; };

type Unit = "qty" | "rub";
type View = "both" | "orders" | "sales";
type Settings = {
  unit: Unit; view: View; details: boolean;
  fbs: boolean; fbo: boolean; toClient: boolean; fromClient: boolean;
  warnOrders: number; warnSales: number;
};
const DEFAULTS: Settings = { unit: "qty", view: "both", details: false, fbs: true, fbo: true, toClient: false, fromClient: false, warnOrders: 25, warnSales: 20 };
const STORE = "sellcore.sales.v1";

// Показатели одного блока (заказы или продажи) по артикулу.
type Block = { q: number[]; s: number[]; avg: number; daysLeft: number | null; q7: number; dq7: number; s7: number; ds7: number };
type Calc = SalesRow & { stock: number; o: Block; s: Block };

function block(q: number[], s: number[], stock: number): Block {
  const n = q.length - 1; // последний день — сегодня, он неполный и в средние не входит
  const avg = sum(q, 0, n) / n;
  const q7 = sum(q, n - 7, n), s7 = sum(s, n - 7, n);
  return {
    q, s, avg,
    daysLeft: stock <= 0 ? 0 : avg <= 0 ? null : stock / avg,
    q7, dq7: q7 - sum(q, n - 14, n - 7), s7, ds7: s7 - sum(s, n - 14, n - 7),
  };
}

// Порог тепловой карты: 90-й процентиль, чтобы один всплеск не «гасил» остальные ячейки.
function p90(values: number[]): number {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : 1;
}
function heat(v: number, max: number): React.CSSProperties | undefined {
  if (v <= 0) return undefined;
  const pct = Math.round(10 + 62 * Math.min(1, v / max));
  return { background: `color-mix(in srgb, var(--accent) ${pct}%, var(--card))`, color: pct > 48 ? "var(--on-accent)" : undefined };
}

function Delta({ v }: { v: number }) {
  if (!v) return <span className="muted">0</span>;
  return <span className={v > 0 ? "sd-up" : "sd-down"}>{v > 0 ? "▲" : "▼"} {int(Math.abs(v))}</span>;
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 4, h = 22;
  return (
    <svg width={values.length * w} height={h} className="sd-spark" aria-hidden="true">
      {values.map((v, i) => {
        const bh = v > 0 ? Math.max(2, (v / max) * h) : 0;
        return <rect key={i} x={i * w} y={h - bh} width={w - 1} height={bh} rx={1} opacity={i === values.length - 1 ? 0.4 : 1} />;
      })}
    </svg>
  );
}

// Сводка блока: три цифры и график по дням. Наведение на столбик показывает значение дня.
function Summary({ title, sumLabel, days, qty, rub, unit, inStock, total, soon, warn, onWarn }: {
  title: string; sumLabel: string; days: string[]; qty: number[]; rub: number[]; unit: Unit;
  inStock: number; total: number; soon: number; warn: number; onWarn: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = unit === "qty" ? qty : rub;
  const max = Math.max(1, ...values);
  const q = sum(qty), r = sum(rub);
  const d = hover === null ? null : parseDay(days[hover]);
  return (
    <div className="card sd-sum">
      <div className="sd-sum-head">
        <h2>{title}</h2>
        <span className="muted">
          {d && hover !== null
            ? <><b>{WD[d.getUTCDay()]}, {d.getUTCDate()} {MONTHS[d.getUTCMonth()]}</b>{hover === days.length - 1 ? " (сегодня)" : ""} — {int(qty[hover])} шт · {int(rub[hover])} ₽</>
            : `${days.length} день, ${unit === "qty" ? "шт" : "₽"}`}
        </span>
      </div>
      <div className="sd-sum-body">
        <div className="sd-stats">
          <div><div className="sd-stat-v num">{int(q)}</div><div className="muted">шт</div></div>
          <div><div className="sd-stat-v num">{int(r)}</div><div className="muted">{sumLabel}, ₽</div></div>
          <div><div className="sd-stat-v num">{q > 0 ? int(r / q) : "—"}</div><div className="muted">ср. чек, ₽</div></div>
        </div>
        <div className="sd-bars" onMouseLeave={() => setHover(null)}>
          {values.map((v, i) => {
            const dd = parseDay(days[i]);
            const weekend = dd.getUTCDay() === 0 || dd.getUTCDay() === 6;
            return (
              <div key={i} className={`sd-bar-col${hover === i ? " on" : ""}`} onMouseEnter={() => setHover(i)}>
                <div className="sd-bar-box"><div className={`sd-bar${i === values.length - 1 ? " today" : ""}`} style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} /></div>
                <div className={`sd-bar-lbl${weekend ? " we" : ""}`}>{dd.getUTCDate()}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sd-sum-foot">
        <span>В наличии <b className="num">{inStock}</b> из {total}</span>
        <span className={soon > 0 ? "sd-soon" : ""}>Скоро закончатся: <b className="num">{soon}</b></span>
        <label className="muted">запас меньше
          <input className="input sd-warn" type="number" min={1} max={365} value={warn} onChange={(e) => onWarn(Math.max(1, Number(e.target.value) || 1))} /> дн
        </label>
      </div>
    </div>
  );
}

type SortKey = "article" | "stock" | "price" | "buyout" | `${"o" | "s"}_${"avg" | "days" | "q7" | "dq7" | "s7" | "ds7"}`;
function sortValue(r: Calc, key: SortKey): number | string | null {
  if (key === "article") return r.vendorCode.toLowerCase();
  if (key === "stock") return r.stock;
  if (key === "price") return r.price;
  if (key === "buyout") return r.buyout;
  const b = key[0] === "o" ? r.o : r.s;
  const f = key.slice(2);
  return f === "avg" ? b.avg : f === "days" ? b.daysLeft : f === "q7" ? b.q7 : f === "dq7" ? b.dq7 : f === "s7" ? b.s7 : b.ds7;
}

export function SalesDashboard({ cabinetId, data, status }: { cabinetId: string; data: SalesData; status: SyncStatus }) {
  const router = useRouter();
  const [st, setSt] = useState<Settings>(DEFAULTS);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [subject, setSubject] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "o_s7", dir: -1 });
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Настройки вида запоминаются в браузере.
  useEffect(() => {
    try { const saved = localStorage.getItem(STORE); if (saved) setSt({ ...DEFAULTS, ...JSON.parse(saved) }); } catch {}
  }, []);
  const set = (patch: Partial<Settings>) => setSt((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
    return next;
  });

  // Пока идёт загрузка из WB — раз в 4 секунды проверяем, не готово ли.
  useEffect(() => {
    if (!status.running) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [status.running, router]);

  const { days } = data;
  const n = days.length;
  const brands = useMemo(() => [...new Set(data.rows.map((r) => r.brand).filter(Boolean))].sort(), [data.rows]);
  const subjects = useMemo(() => [...new Set(data.rows.map((r) => r.subject).filter(Boolean))].sort(), [data.rows]);
  const noFbs = data.rows.length > 0 && data.rows.every((r) => r.fbs === null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Calc[] = data.rows
      .filter((r) => (!brand || r.brand === brand) && (!subject || r.subject === subject) && (!q || r.vendorCode.toLowerCase().includes(q) || String(r.nmId).includes(q)))
      .map((r) => {
        const stock = (st.fbs ? r.fbs ?? 0 : 0) + (st.fbo ? r.fbo : 0) + (st.toClient ? Math.round(r.toClient * (1 - (r.buyout ?? 0))) : 0) + (st.fromClient ? r.fromClient : 0);
        return { ...r, stock, o: block(r.oq, r.os, stock), s: block(r.sq, r.ss, stock) };
      });
    list.sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1; // пустые значения всегда внизу
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.vendorCode.localeCompare(b.vendorCode);
    });
    return list;
  }, [data.rows, query, brand, subject, st.fbs, st.fbo, st.toClient, st.fromClient, sort]);

  const totals = useMemo(() => {
    const col = (pick: (r: Calc) => number[]) => days.map((_, i) => rows.reduce((a, r) => a + pick(r)[i], 0));
    return { oq: col((r) => r.o.q), os: col((r) => r.o.s), sq: col((r) => r.s.q), ss: col((r) => r.s.s) };
  }, [rows, days]);

  const unit = st.unit;
  const cell = (b: Block, i: number) => (unit === "qty" ? b.q[i] : b.s[i]);
  const maxO = useMemo(() => p90(rows.flatMap((r) => (unit === "qty" ? r.o.q : r.o.s))), [rows, unit]);
  const maxS = useMemo(() => p90(rows.flatMap((r) => (unit === "qty" ? r.s.q : r.s.s))), [rows, unit]);
  const fmtCell = (v: number) => (v === 0 ? "" : unit === "qty" ? int(v) : nf1.format(v / 1000).replace("-", "−"));
  const fmtTotal = (v: number) => (v === 0 ? "" : unit === "qty" ? int(v) : int(v / 1000));

  const inStock = rows.filter((r) => r.stock > 0).length;
  const soon = (pick: (r: Calc) => Block, warn: number) => rows.filter((r) => { const d = pick(r).daysLeft; return d !== null && d > 0 && d <= warn; }).length;

  const showO = st.view !== "sales", showS = st.view !== "orders";
  const dayHead = days.map((iso, i) => {
    const d = parseDay(iso);
    return { iso, wd: WD[d.getUTCDay()], date: d.getUTCDate(), weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6, today: i === n - 1,
      label: `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
  });

  const Th = ({ k, children, title, className = "" }: { k: SortKey; children: React.ReactNode; title?: string; className?: string }) => (
    <th className={`sd-sortable ${className}`} title={title} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "article" ? 1 : -1 }))}>
      {children}{sort.key === k && <span className="sd-arrow">{sort.dir === 1 ? "↑" : "↓"}</span>}
    </th>
  );

  const dayCells = (r: Calc, b: Block, max: number, edge: string) => dayHead.map((d, i) => {
    const v = cell(b, i);
    return (
      <td key={d.iso} className={`sd-day${i === 0 ? ` ${edge}` : ""}${d.today ? " sd-today" : ""}${v < 0 ? " sd-neg" : ""}`} style={heat(v, max)}
        title={`${r.vendorCode} · ${d.label}${d.today ? " (сегодня)" : ""}: ${int(b.q[i])} шт · ${int(b.s[i])} ₽`}>
        {fmtCell(v)}
      </td>
    );
  });
  const daysLeftCell = (b: Block, warn: number) => {
    const d = b.daysLeft;
    if (d === 0) return <td className="sd-n muted" title="Остатка нет">нет</td>;
    if (d === null) return <td className="sd-n muted" title="За 20 дней не было ни одной штуки — срок не посчитать">—</td>;
    return <td className={`sd-n${d <= warn ? " sd-alert" : ""}`} title={d <= warn ? `Запаса меньше чем на ${warn} дн` : undefined}>{int(d)}</td>;
  };
  const tail = (b: Block, warn: number, withBuyout: boolean, r: Calc) => (
    <>
      <td className="sd-sparkcell"><Spark values={unit === "qty" ? b.q : b.s} /></td>
      <td className="sd-n">{b.avg > 0 ? nf1.format(b.avg) : <span className="muted">0</span>}</td>
      {withBuyout && <td className="sd-n">{r.buyout === null ? <span className="muted">—</span> : `${Math.round(r.buyout * 100)}%`}</td>}
      {daysLeftCell(b, warn)}
      <td className="sd-n">{b.q7 ? int(b.q7) : <span className="muted">0</span>}</td>
      <td className="sd-n"><Delta v={b.dq7} /></td>
      <td className="sd-n">{b.s7 ? int(b.s7) : <span className="muted">0</span>}</td>
      <td className="sd-n"><Delta v={b.ds7} /></td>
    </>
  );
  const tailHead = (p: "o" | "s", withBuyout: boolean) => (
    <>
      <th>Динамика</th>
      <Th k={`${p}_avg`} title="Среднее за 20 полных дней, без сегодня">Ср. в день</Th>
      {withBuyout && <Th k="buyout" title="За 30 полных дней: (выкупы − возвраты) ÷ (выкупы + отказы)">% выкупа</Th>}
      <Th k={`${p}_days`} title="Остаток ÷ среднее в день">Хватит, дн</Th>
      <Th k={`${p}_q7`} title="Последние 7 полных дней, без сегодня">7 дней, шт</Th>
      <Th k={`${p}_dq7`} title="Изменение к предыдущим 7 дням">⇅ шт</Th>
      <Th k={`${p}_s7`} title="Последние 7 полных дней, без сегодня">7 дней, ₽</Th>
      <Th k={`${p}_ds7`} title="Изменение к предыдущим 7 дням">⇅ ₽</Th>
    </>
  );
  const tailCols = (withBuyout: boolean) => (withBuyout ? 8 : 7);

  const refresh = () => startTransition(async () => { const res = await refreshSales(cabinetId); setNote(res.note); router.refresh(); });
  const updated = status.lastFinishedAt
    ? new Date(status.lastFinishedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  const failed = status.steps.filter((s) => s.status === "error");
  const empty = data.rows.length === 0;
  const stockCols = st.details ? 6 : 1;

  return (
    <>
      <div className="sd-toolbar">
        <input className="input sd-search" placeholder="Артикул или номер WB" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input sd-select" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Бренд">
          <option value="">Все бренды</option>{brands.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className="input sd-select" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Категория">
          <option value="">Все категории</option>{subjects.map((b) => <option key={b}>{b}</option>)}
        </select>
        <div className="seg">
          {([["both", "Заказы и продажи"], ["orders", "Заказы"], ["sales", "Продажи"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={st.view === v ? "on" : ""} onClick={() => set({ view: v })}>{l}</button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={unit === "qty" ? "on" : ""} onClick={() => set({ unit: "qty" })}>шт</button>
          <button type="button" className={unit === "rub" ? "on" : ""} onClick={() => set({ unit: "rub" })}>тыс ₽</button>
        </div>
        <span className="spacer" />
        <span className="muted sd-updated">
          {status.running ? `Загружаем данные WB${status.current ? `: ${status.current.toLowerCase()}` : ""}…` : updated ? `Обновлено ${updated} МСК` : "Данные ещё не загружались"}
        </span>
        <button className="btn" type="button" onClick={refresh} disabled={pending || status.running}><Icon name="refresh" />Обновить</button>
      </div>

      {(note || failed.length > 0) && (
        <div className="sd-note">
          {note && <div>{note}</div>}
          {failed.map((f) => <div key={f.kind}><b>{f.label}:</b> не загрузились — {f.message}</div>)}
        </div>
      )}

      {empty ? (
        <div className="card muted">{status.running ? "Первая загрузка из WB занимает 1–2 минуты. Страница обновится сама." : "Данных пока нет. Нажмите «Обновить»."}</div>
      ) : (
        <>
          <div className="sd-sums">
            {showO && <Summary title="Заказы" sumLabel="заказано" days={days} qty={totals.oq} rub={totals.os} unit={unit}
              inStock={inStock} total={rows.length} soon={soon((r) => r.o, st.warnOrders)} warn={st.warnOrders} onWarn={(v) => set({ warnOrders: v })} />}
            {showS && <Summary title="Продажи (выкупы)" sumLabel="продано" days={days} qty={totals.sq} rub={totals.ss} unit={unit}
              inStock={inStock} total={rows.length} soon={soon((r) => r.s, st.warnSales)} warn={st.warnSales} onWarn={(v) => set({ warnSales: v })} />}
          </div>

          <div className="sd-stockbar">
            <span className="muted">В «Остатки» входят:</span>
            <label title={noFbs ? "У токена нет доступа к разделу «Маркетплейс» — остатки FBS не загружаются" : undefined}>
              <input type="checkbox" checked={st.fbs} onChange={(e) => set({ fbs: e.target.checked })} /> FBS{noFbs ? " (нет данных)" : ""}
            </label>
            <label><input type="checkbox" checked={st.fbo} onChange={(e) => set({ fbo: e.target.checked })} /> FBO</label>
            <label title="Считаем только ту часть, что вернётся: в пути × (1 − % выкупа)">
              <input type="checkbox" checked={st.toClient} onChange={(e) => set({ toClient: e.target.checked })} /> к клиенту × (1 − % выкупа)
            </label>
            <label><input type="checkbox" checked={st.fromClient} onChange={(e) => set({ fromClient: e.target.checked })} /> от клиента</label>
            <label className="sd-details"><input type="checkbox" checked={st.details} onChange={(e) => set({ details: e.target.checked })} /> показать детали</label>
          </div>

          <div className="sd-wrap">
            <table className="sd-table">
              <thead>
                <tr className="sd-h1">
                  <th className="sd-stick sd-c1" colSpan={2}>Товар <span className="muted">· {rows.length}</span></th>
                  <th colSpan={stockCols + 3}>Остатки и цена</th>
                  {showO && <th className="sd-edge" colSpan={n + tailCols(true)}>Заказы, {unit === "qty" ? "шт" : "тыс ₽"}</th>}
                  {showS && <th className="sd-edge" colSpan={n + tailCols(false)}>Продажи (выкупы), {unit === "qty" ? "шт" : "тыс ₽"}</th>}
                </tr>
                <tr className="sd-h2">
                  <th className="sd-stick sd-c1">Фото</th>
                  <Th k="article" className="sd-stick sd-c2 sd-left">Артикул</Th>
                  {st.details && <><th title="Дата последнего изменения карточки">Карточка</th><th>FBS</th><th>FBO</th><th>К клиенту</th><th>От клиента</th></>}
                  <Th k="stock" title="Сумма отмеченных галочками остатков">Остатки</Th>
                  <th title="Цена для покупателя: цена без СПП, уменьшенная на СПП из последнего заказа">Цена с СПП</th>
                  <Th k="price" title="Цена со скидкой продавца">Без СПП</Th>
                  <th title="Скидка WB по последнему заказу">СПП</th>
                  {showO && <>{dayHead.map((d, i) => <th key={d.iso} className={`sd-dayh${i === 0 ? " sd-edge" : ""}${d.weekend ? " we" : ""}${d.today ? " sd-today" : ""}`} title={d.today ? `${d.label} — сегодня, день ещё идёт` : d.label}>{d.wd}<br />{d.date}</th>)}{tailHead("o", true)}</>}
                  {showS && <>{dayHead.map((d, i) => <th key={d.iso} className={`sd-dayh${i === 0 ? " sd-edge" : ""}${d.weekend ? " we" : ""}${d.today ? " sd-today" : ""}`} title={d.today ? `${d.label} — сегодня, день ещё идёт` : d.label}>{d.wd}<br />{d.date}</th>)}{tailHead("s", false)}</>}
                </tr>
                <tr className="sd-h3">
                  <th className="sd-stick sd-c1" />
                  <th className="sd-stick sd-c2 sd-left">Итого</th>
                  {st.details && <><th /><th>{int(rows.reduce((a, r) => a + (r.fbs ?? 0), 0))}</th><th>{int(rows.reduce((a, r) => a + r.fbo, 0))}</th><th>{int(rows.reduce((a, r) => a + r.toClient, 0))}</th><th>{int(rows.reduce((a, r) => a + r.fromClient, 0))}</th></>}
                  <th>{int(rows.reduce((a, r) => a + r.stock, 0))}</th><th /><th /><th />
                  {showO && (() => { const t = unit === "qty" ? totals.oq : totals.os, m = Math.max(1, ...t); return <>{t.map((v, i) => <th key={i} className={`sd-day${i === 0 ? " sd-edge" : ""}`} style={heat(v, m)}>{fmtTotal(v)}</th>)}<th colSpan={tailCols(true)} /></>; })()}
                  {showS && (() => { const t = unit === "qty" ? totals.sq : totals.ss, m = Math.max(1, ...t); return <>{t.map((v, i) => <th key={i} className={`sd-day${i === 0 ? " sd-edge" : ""}`} style={heat(v, m)}>{fmtTotal(v)}</th>)}<th colSpan={tailCols(false)} /></>; })()}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.nmId}>
                    <td className="sd-stick sd-c1">
                      {r.photoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="sd-photo" />
                        : <span className="sd-photo sd-nophoto" />}
                    </td>
                    <td className="sd-stick sd-c2 sd-left">
                      <a href={`https://www.wildberries.ru/catalog/${r.nmId}/detail.aspx`} target="_blank" rel="noreferrer" className="sd-art" title="Открыть карточку на WB">{r.vendorCode}</a>
                      <div className="sd-sub">{r.nmId}{r.subject ? ` · ${r.subject}` : ""}</div>
                    </td>
                    {st.details && <>
                      <td className="sd-n muted">{r.cardUpdatedAt ? new Date(r.cardUpdatedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}</td>
                      <td className="sd-n">{r.fbs === null ? <span className="muted">—</span> : int(r.fbs)}</td>
                      <td className="sd-n">{int(r.fbo)}</td>
                      <td className="sd-n">{int(r.toClient)}</td>
                      <td className="sd-n">{int(r.fromClient)}</td>
                    </>}
                    <td className="sd-n sd-strong" title={`FBS ${r.fbs ?? "—"} · FBO ${r.fbo} · к клиенту ${r.toClient} · от клиента ${r.fromClient}`}>{r.stock > 0 ? int(r.stock) : <span className="muted">0</span>}</td>
                    <td className="sd-n">{r.price ? int(r.price * (1 - (r.spp ?? 0) / 100)) : <span className="muted">—</span>}</td>
                    <td className="sd-n">{r.price ? int(r.price) : <span className="muted">—</span>}</td>
                    <td className="sd-n muted">{r.spp === null ? "—" : `${Math.round(r.spp)}%`}</td>
                    {showO && <>{dayCells(r, r.o, maxO, "sd-edge")}{tail(r.o, st.warnOrders, true, r)}</>}
                    {showS && <>{dayCells(r, r.s, maxS, "sd-edge")}{tail(r.s, st.warnSales, false, r)}</>}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>Под фильтры не попал ни один артикул.</div>}
          </div>
          <p className="muted sd-foot">
            Дни считаются по московскому времени, как в кабинете WB. Сегодняшний столбец неполный и в средние не входит. Сумма — цена со скидкой продавца, без СПП. Наведите на ячейку или заголовок, чтобы увидеть подробности.
          </p>
        </>
      )}
    </>
  );
}
