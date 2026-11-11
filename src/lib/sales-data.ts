// Данные для раздела «Продажи»: 21 день (20 полных + сегодня) заказов и выкупов по каждому артикулу.
// Дни считаются по московскому времени — так же, как в кабинете WB.
import { pool } from "./db";

export const DAYS = 21;

export type SalesRow = {
  nmId: number;
  vendorCode: string;
  brand: string;
  subject: string;
  photoUrl: string | null;
  cardUpdatedAt: string | null;
  fbo: number;
  fbs: number | null; // null — нет доступа к остаткам FBS
  toClient: number;
  fromClient: number;
  price: number | null; // цена со скидкой продавца, без СПП
  spp: number | null; // % СПП по последнему заказу
  buyout: number | null; // доля выкупа за 30 дней, 0…1
  oq: number[]; // заказы, шт по дням
  os: number[]; // заказы, ₽ по дням
  sq: number[]; // выкупы за вычетом возвратов, шт
  ss: number[]; // выкупы за вычетом возвратов, ₽
};

export type SalesData = { days: string[]; rows: SalesRow[] };

export async function loadSales(cabinetId: string): Promise<SalesData> {
  const today = `(now() at time zone 'Europe/Moscow')::date`;
  const [daysQ, productsQ, ordersQ, salesQ, buyoutQ, sppQ] = await Promise.all([
    pool.query(`select to_char(d, 'YYYY-MM-DD') as d from generate_series(${today} - ${DAYS - 1}, ${today}, interval '1 day') d order by d`),
    pool.query(
      `select p.nm_id, p.vendor_code, p.brand, p.subject, p.photo_url, p.card_updated_at, p.discounted_price,
              coalesce(s.fbo, 0) as fbo, s.fbs, coalesce(s.to_client, 0) as to_client, coalesce(s.from_client, 0) as from_client
       from wb_products p left join wb_stocks s on s.cabinet_id = p.cabinet_id and s.nm_id = p.nm_id
       where p.cabinet_id = $1`, [cabinetId]),
    pool.query(
      `select nm_id, to_char(day, 'YYYY-MM-DD') as d, count(*)::int as q, sum(price_with_disc)::float as s
       from wb_orders where cabinet_id = $1 and day >= ${today} - ${DAYS - 1} group by 1, 2`, [cabinetId]),
    pool.query(
      `select nm_id, to_char(day, 'YYYY-MM-DD') as d,
              sum(case when is_return then -1 else 1 end)::int as q,
              sum(case when is_return then -price_with_disc else price_with_disc end)::float as s
       from wb_sales where cabinet_id = $1 and day >= ${today} - ${DAYS - 1} group by 1, 2`, [cabinetId]),
    // % выкупа за 30 полных дней: (выкупы − возвраты) ÷ (выкупы + отказы).
    pool.query(
      `select nm_id, sum(sold)::int as sold, sum(returned)::int as returned, sum(cancelled)::int as cancelled from (
         select nm_id, count(*) filter (where not is_return) as sold, count(*) filter (where is_return) as returned, 0 as cancelled
         from wb_sales where cabinet_id = $1 and day between ${today} - 30 and ${today} - 1 group by 1
         union all
         select nm_id, 0, 0, count(*) from wb_orders
         where cabinet_id = $1 and is_cancel and cancel_day between ${today} - 30 and ${today} - 1 group by 1
       ) t group by 1`, [cabinetId]),
    pool.query(
      `select distinct on (nm_id) nm_id, spp from wb_orders
       where cabinet_id = $1 and day >= ${today} - 14 order by nm_id, ordered_at desc`, [cabinetId]),
  ]);

  const days: string[] = daysQ.rows.map((r) => r.d);
  const at = new Map(days.map((d, i) => [d, i]));
  const zeros = () => new Array<number>(DAYS).fill(0);
  const rows = new Map<number, SalesRow>();
  for (const p of productsQ.rows) {
    rows.set(p.nm_id, {
      nmId: p.nm_id, vendorCode: p.vendor_code, brand: p.brand, subject: p.subject, photoUrl: p.photo_url,
      cardUpdatedAt: p.card_updated_at ? new Date(p.card_updated_at).toISOString() : null,
      fbo: p.fbo, fbs: p.fbs, toClient: p.to_client, fromClient: p.from_client,
      price: p.discounted_price, spp: null, buyout: null, oq: zeros(), os: zeros(), sq: zeros(), ss: zeros(),
    });
  }
  for (const o of ordersQ.rows) {
    const r = rows.get(o.nm_id), i = at.get(o.d);
    if (r && i !== undefined) { r.oq[i] = o.q; r.os[i] = Math.round(o.s); }
  }
  for (const s of salesQ.rows) {
    const r = rows.get(s.nm_id), i = at.get(s.d);
    if (r && i !== undefined) { r.sq[i] = s.q; r.ss[i] = Math.round(s.s); }
  }
  for (const b of buyoutQ.rows) {
    const r = rows.get(b.nm_id), base = b.sold + b.cancelled;
    if (r && base > 0) r.buyout = Math.max(0, b.sold - b.returned) / base;
  }
  for (const s of sppQ.rows) {
    const r = rows.get(s.nm_id);
    if (r) r.spp = s.spp;
  }
  return { days, rows: [...rows.values()] };
}
