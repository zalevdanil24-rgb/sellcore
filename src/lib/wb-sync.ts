import { syncLog } from "./sync-log";
// Загрузка данных WB в нашу базу для раздела «Продажи».
// Шаги независимы: если один раздел API недоступен, остальные всё равно обновятся,
// а ошибка будет видна на странице.
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db, pool, schema } from "./db";
import { decryptSecret } from "./crypto";
import { WbError, fetchCards, fetchFbsStocks, fetchOrders, fetchPrices, fetchSales, fetchStocks } from "./wb";

export const SYNC_STEPS = [
  { kind: "cards", label: "Карточки" },
  { kind: "prices", label: "Цены" },
  { kind: "orders", label: "Заказы" },
  { kind: "sales", label: "Продажи" },
  { kind: "stocks", label: "Остатки WB" },
  { kind: "fbs", label: "Остатки FBS" },
] as const;
const KINDS = SYNC_STEPS.map((s) => s.kind) as string[];

const STALE_MS = 30 * 60 * 1000; // WB сам обновляет данные раз в 30 минут

const day = (s: string | undefined) => (s && s.length >= 10 && !s.startsWith("0001") ? s.slice(0, 10) : null);
const dedupe = <T,>(rows: T[], key: (r: T) => string) => [...new Map(rows.map((r) => [key(r), r])).values()];

async function step(cabinetId: string, kind: string, run: () => Promise<string>) {
  // Каждый раздел WB — не чаще раза в 30 минут, даже по кнопке: лимиты кабинета общие со всеми сервисами.
  if (!process.env.WB_API_MOCK && (await recentlyOk(cabinetId, kind))) return;
  const [row] = await db.insert(schema.syncRuns).values({ cabinetId, kind, status: "running" }).returning();
  let status = "ok";
  let message: string;
  const t0 = Date.now();
  syncLog(`[sync] ${cabinetId} ${kind} — старт`);
  try {
    message = await run();
  } catch (e) {
    status = "error";
    message = e instanceof WbError ? e.message : e instanceof Error ? e.message.slice(0, 300) : "Неизвестная ошибка";
    if (!(e instanceof WbError)) console.error(`sync ${kind}`, e);
  }
  syncLog(`[sync] ${cabinetId} ${kind} — ${status} за ${Math.round((Date.now() - t0) / 1000)} с: ${message}`);
  await db.update(schema.syncRuns).set({ status, message, finishedAt: new Date() }).where(eq(schema.syncRuns.id, row.id));
}

// С какого момента просить изменения: с последней известной строки или за 90 дней (больше WB не хранит).
async function changedSince(table: "wb_orders" | "wb_sales", cabinetId: string): Promise<string> {
  const { rows } = await pool.query(
    `select to_char(coalesce(max(last_change_at), (now() at time zone 'Europe/Moscow') - interval '90 days'), 'YYYY-MM-DD"T"HH24:MI:SS') as d
     from ${table} where cabinet_id = $1`, [cabinetId]);
  return rows[0].d as string;
}

// WB режет запросы строже, чем пишет в документации, и наказывает долгой блокировкой кабинета.
// Поэтому к каждому разделу обращаемся не чаще раза в 30 минут — даже по кнопке.
const STATISTICS_EVERY_MS = 30 * 60 * 1000;
async function recentlyOk(cabinetId: string, kind: string): Promise<boolean> {
  const last = await db.query.syncRuns.findFirst({
    where: and(eq(schema.syncRuns.cabinetId, cabinetId), eq(schema.syncRuns.kind, kind), eq(schema.syncRuns.status, "ok")),
    orderBy: [desc(schema.syncRuns.startedAt)],
  });
  return !!last && Date.now() - last.startedAt.getTime() < STATISTICS_EVERY_MS;
}

async function syncCabinet(cabinetId: string, token: string) {
  await step(cabinetId, "cards", async () => {
    const cards = dedupe(await fetchCards(token), (c) => String(c.nmID));
    if (cards.length === 0) return "0 карточек";
    await pool.query(
      `insert into wb_products (cabinet_id, nm_id, imt_id, vendor_code, brand, subject, title, photo_url, barcodes, card_updated_at, updated_at)
       select $1, x.nm_id, x.imt_id, x.vendor_code, x.brand, x.subject, x.title, x.photo_url,
              array(select jsonb_array_elements_text(x.barcodes)), x.card_updated_at, now()
       from jsonb_to_recordset($2::jsonb) as x(nm_id bigint, imt_id bigint, vendor_code text, brand text, subject text, title text, photo_url text, barcodes jsonb, card_updated_at timestamptz)
       on conflict (cabinet_id, nm_id) do update set imt_id = excluded.imt_id, vendor_code = excluded.vendor_code, brand = excluded.brand,
         subject = excluded.subject, title = excluded.title, photo_url = excluded.photo_url, barcodes = excluded.barcodes,
         card_updated_at = excluded.card_updated_at, updated_at = now()`,
      [cabinetId, JSON.stringify(cards.map((c) => ({
        nm_id: c.nmID, imt_id: c.imtID ?? null, vendor_code: c.vendorCode ?? "", brand: c.brand ?? "", subject: c.subjectName ?? "",
        title: c.title ?? "", photo_url: c.photos?.[0]?.c246x328 ?? c.photos?.[0]?.tm ?? c.photos?.[0]?.big ?? null,
        barcodes: (c.sizes ?? []).flatMap((s) => s.skus ?? []), card_updated_at: c.updatedAt ?? null,
      })))]);
    // Карточки, которых больше нет в кабинете, убираем.
    await pool.query(`delete from wb_products where cabinet_id = $1 and nm_id <> all($2::bigint[])`, [cabinetId, cards.map((c) => c.nmID)]);
    return `${cards.length} карточек`;
  });

  await step(cabinetId, "prices", async () => {
    const goods = await fetchPrices(token);
    const rows = goods.map((g) => ({
      nm_id: g.nmID,
      price: Math.max(0, ...(g.sizes ?? []).map((s) => s.price ?? 0)) || null,
      discounted: Math.max(0, ...(g.sizes ?? []).map((s) => s.discountedPrice ?? 0)) || null,
    }));
    await pool.query(
      `update wb_products p set price = x.price, discounted_price = x.discounted
       from jsonb_to_recordset($2::jsonb) as x(nm_id bigint, price real, discounted real)
       where p.cabinet_id = $1 and p.nm_id = x.nm_id`, [cabinetId, JSON.stringify(rows)]);
    return `${rows.length} цен`;
  });

  await step(cabinetId, "orders", async () => {
    const rows = dedupe(await fetchOrders(token, await changedSince("wb_orders", cabinetId)), (o) => o.srid).filter((o) => o.srid && day(o.date));
    for (let i = 0; i < rows.length; i += 5000) {
      await pool.query(
        `insert into wb_orders (cabinet_id, srid, day, ordered_at, last_change_at, nm_id, tech_size, warehouse_type, price_with_disc, finished_price, spp, is_cancel, cancel_day)
         select $1, x.srid, x.day, x.ordered_at, x.last_change_at, x.nm_id, x.tech_size, x.warehouse_type, x.price_with_disc, x.finished_price, x.spp, x.is_cancel, x.cancel_day
         from jsonb_to_recordset($2::jsonb) as x(srid text, day date, ordered_at timestamp, last_change_at timestamp, nm_id bigint, tech_size text, warehouse_type text, price_with_disc real, finished_price real, spp real, is_cancel boolean, cancel_day date)
         on conflict (cabinet_id, srid) do update set last_change_at = excluded.last_change_at, price_with_disc = excluded.price_with_disc,
           finished_price = excluded.finished_price, spp = excluded.spp, is_cancel = excluded.is_cancel, cancel_day = excluded.cancel_day`,
        [cabinetId, JSON.stringify(rows.slice(i, i + 5000).map((o) => ({
          srid: o.srid, day: day(o.date), ordered_at: o.date, last_change_at: o.lastChangeDate, nm_id: o.nmId, tech_size: o.techSize ?? "",
          warehouse_type: o.warehouseType ?? "", price_with_disc: o.priceWithDisc ?? 0, finished_price: o.finishedPrice ?? 0, spp: o.spp ?? 0,
          is_cancel: !!o.isCancel, cancel_day: o.isCancel ? day(o.cancelDate) ?? day(o.lastChangeDate) : null,
        })))]);
    }
    return `${rows.length} строк`;
  });

  await step(cabinetId, "sales", async () => {
    const rows = dedupe(await fetchSales(token, await changedSince("wb_sales", cabinetId)), (s) => s.saleID).filter((s) => s.saleID && day(s.date));
    for (let i = 0; i < rows.length; i += 5000) {
      await pool.query(
        `insert into wb_sales (cabinet_id, sale_id, srid, day, sold_at, last_change_at, nm_id, tech_size, price_with_disc, for_pay, is_return)
         select $1, x.sale_id, x.srid, x.day, x.sold_at, x.last_change_at, x.nm_id, x.tech_size, x.price_with_disc, x.for_pay, x.is_return
         from jsonb_to_recordset($2::jsonb) as x(sale_id text, srid text, day date, sold_at timestamp, last_change_at timestamp, nm_id bigint, tech_size text, price_with_disc real, for_pay real, is_return boolean)
         on conflict (cabinet_id, sale_id) do update set last_change_at = excluded.last_change_at, price_with_disc = excluded.price_with_disc, for_pay = excluded.for_pay`,
        [cabinetId, JSON.stringify(rows.slice(i, i + 5000).map((s) => ({
          sale_id: s.saleID, srid: s.srid ?? "", day: day(s.date), sold_at: s.date, last_change_at: s.lastChangeDate, nm_id: s.nmId,
          tech_size: s.techSize ?? "", price_with_disc: Math.abs(s.priceWithDisc ?? 0), for_pay: Math.abs(s.forPay ?? 0),
          // Возврат: номер начинается с R (или сумма отрицательная).
          is_return: s.saleID.startsWith("R") || (s.priceWithDisc ?? 0) < 0,
        })))]);
    }
    return `${rows.length} строк`;
  });

  await step(cabinetId, "stocks", async () => {
    const byNm = new Map<number, { fbo: number; to: number; from: number }>();
    for (const s of await fetchStocks(token)) {
      const a = byNm.get(s.nmId) ?? { fbo: 0, to: 0, from: 0 };
      a.fbo += s.quantity ?? 0; a.to += s.inWayToClient ?? 0; a.from += s.inWayFromClient ?? 0;
      byNm.set(s.nmId, a);
    }
    const rows = [...byNm].map(([nm_id, a]) => ({ nm_id, ...a }));
    await pool.query(
      `insert into wb_stocks (cabinet_id, nm_id, fbo, to_client, from_client, updated_at)
       select $1, x.nm_id, x.fbo, x."to", x."from", now() from jsonb_to_recordset($2::jsonb) as x(nm_id bigint, fbo int, "to" int, "from" int)
       on conflict (cabinet_id, nm_id) do update set fbo = excluded.fbo, to_client = excluded.to_client, from_client = excluded.from_client, updated_at = now()`,
      [cabinetId, JSON.stringify(rows)]);
    // Товара нет в ответе WB — значит, на складах WB его сейчас нет.
    await pool.query(`update wb_stocks set fbo = 0, to_client = 0, from_client = 0, updated_at = now() where cabinet_id = $1 and nm_id <> all($2::bigint[])`,
      [cabinetId, rows.map((r) => r.nm_id)]);
    return `${rows.length} артикулов`;
  });

  await step(cabinetId, "fbs", async () => {
    const products = await db.query.wbProducts.findMany({ where: eq(schema.wbProducts.cabinetId, cabinetId), columns: { nmId: true, barcodes: true } });
    const amounts = await fetchFbsStocks(token, products.flatMap((p) => p.barcodes));
    const rows = products.map((p) => ({ nm_id: p.nmId, fbs: p.barcodes.reduce((sum, b) => sum + (amounts.get(b) ?? 0), 0) }));
    await pool.query(
      `insert into wb_stocks (cabinet_id, nm_id, fbs, updated_at)
       select $1, x.nm_id, x.fbs, now() from jsonb_to_recordset($2::jsonb) as x(nm_id bigint, fbs int)
       on conflict (cabinet_id, nm_id) do update set fbs = excluded.fbs`, [cabinetId, JSON.stringify(rows)]);
    return `${rows.filter((r) => r.fbs > 0).length} артикулов с остатком`;
  });
}

export type SyncStatus = {
  running: boolean;
  current: string | null; // какой шаг загружается сейчас
  lastFinishedAt: string | null; // когда последний раз что-то успешно загрузилось
  steps: { kind: string; label: string; status: string | null; message: string | null; finishedAt: string | null }[];
};

export async function syncStatus(cabinetId: string): Promise<SyncStatus> {
  const runs = await db.query.syncRuns.findMany({
    where: and(eq(schema.syncRuns.cabinetId, cabinetId), inArray(schema.syncRuns.kind, KINDS)),
    orderBy: [desc(schema.syncRuns.startedAt)],
    limit: 60,
  });
  const steps = SYNC_STEPS.map((s) => {
    const last = runs.find((r) => r.kind === s.kind && r.status !== "running");
    return { kind: s.kind, label: s.label, status: last?.status ?? null, message: last?.message ?? null, finishedAt: last?.finishedAt?.toISOString() ?? null };
  });
  // Сайт работает в одном экземпляре, поэтому «идёт загрузка» знаем точно только из памяти процесса.
  const running = inFlight.has(cabinetId);
  const now = running ? runs.find((r) => r.status === "running") : undefined;
  const current = now ? SYNC_STEPS.find((s) => s.kind === now.kind)?.label ?? null : null;
  const ok = runs.filter((r) => r.status === "ok" && r.finishedAt).map((r) => r.finishedAt!.getTime());
  return { running, current, lastFinishedAt: ok.length ? new Date(Math.max(...ok)).toISOString() : null, steps };
}

// Какие кабинеты загружаются прямо сейчас. Храним на globalThis: Next собирает страницу и кнопку
// в разные модули, и обычная переменная у каждого была бы своя.
const g = globalThis as unknown as { wbSyncInFlight?: Set<string> };
const inFlight = (g.wbSyncInFlight ??= new Set<string>());

// Запускает загрузку в фоне и сразу возвращает управление. force = по кнопке «Обновить»;
// без него — только если данные старше 30 минут.
export async function startSync(cabinetId: string, force = false): Promise<"started" | "running" | "fresh" | "no-token"> {
  const cabinet = await db.query.cabinets.findFirst({ where: eq(schema.cabinets.id, cabinetId) });
  if (!cabinet?.apiTokenEnc) return "no-token";
  if (inFlight.has(cabinetId)) return "running";
  // Загрузки, оборванные перезапуском сайта (например, при выкатке), помечаем прерванными.
  await db.update(schema.syncRuns).set({ status: "error", message: "прервано перезапуском сайта", finishedAt: new Date() })
    .where(and(eq(schema.syncRuns.cabinetId, cabinetId), eq(schema.syncRuns.status, "running")));
  const recent = await db.query.syncRuns.findMany({
    where: and(eq(schema.syncRuns.cabinetId, cabinetId), inArray(schema.syncRuns.kind, KINDS), gt(schema.syncRuns.startedAt, new Date(Date.now() - STALE_MS))),
  });
  // Не чаще раза в минуту даже по кнопке: у WB лимит — один запрос отчёта в минуту.
  const lastStart = Math.max(0, ...recent.map((r) => r.startedAt.getTime()));
  if (!force && recent.length > 0) return "fresh";
  if (force && Date.now() - lastStart < 60_000) return "fresh";

  const token = decryptSecret(cabinet.apiTokenEnc);
  inFlight.add(cabinetId);
  void syncCabinet(cabinetId, token)
    .catch((e) => console.error("sync", e))
    .finally(() => inFlight.delete(cabinetId));
  return "started";
}
