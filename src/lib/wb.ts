// Работа с API Wildberries. Каждый раздел API живёт на своём адресе и проверяется методом /ping.
export const WB_SECTIONS = [
  { key: "content", label: "Контент", host: "content-api.wildberries.ru" },
  { key: "statistics", label: "Статистика", host: "statistics-api.wildberries.ru" },
  { key: "analytics", label: "Аналитика", host: "seller-analytics-api.wildberries.ru" },
  { key: "prices", label: "Цены и скидки", host: "discounts-prices-api.wildberries.ru" },
  { key: "advert", label: "Продвижение", host: "advert-api.wildberries.ru" },
  { key: "supplies", label: "Поставки", host: "supplies-api.wildberries.ru" },
  { key: "finance", label: "Финансы", host: "finance-api.wildberries.ru" },
] as const;

export type PingResult = { key: string; label: string; ok: boolean; status: number | null };

// Проверяет, к каким разделам у токена есть доступ. 401 = токен не подходит к разделу.
export async function pingAll(token: string): Promise<PingResult[]> {
  return Promise.all(
    WB_SECTIONS.map(async (s) => {
      try {
        const res = await fetch(`https://${s.host}/ping`, {
          headers: { Authorization: token },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        return { key: s.key, label: s.label, ok: res.ok, status: res.status };
      } catch {
        return { key: s.key, label: s.label, ok: false, status: null };
      }
    }),
  );
}

// ───── Запросы данных ─────
const HOSTS = {
  content: "content-api.wildberries.ru",
  statistics: "statistics-api.wildberries.ru",
  analytics: "seller-analytics-api.wildberries.ru",
  prices: "discounts-prices-api.wildberries.ru",
  marketplace: "marketplace-api.wildberries.ru",
} as const;

// Сколько секунд по умолчанию ждать после ответа «слишком часто» в каждом разделе.
const WAIT_429: Record<keyof typeof HOSTS, number> = { content: 5, statistics: 61, analytics: 21, prices: 7, marketplace: 5 };

export class WbError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Один запрос к WB. Если WB отвечает «слишком часто» (429), ждём и пробуем ещё раз.
// WB_API_MOCK — адрес подставного сервера для проверки на своём компьютере.
async function wbFetch<T>(section: keyof typeof HOSTS, path: string, token: string, body?: unknown, method?: "GET" | "POST"): Promise<T> {
  const mock = process.env.WB_API_MOCK;
  const url = mock ? `${mock}/${section}${path}` : `https://${HOSTS[section]}${path}`;
  let last429 = "";
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    const t0 = Date.now();
    try {
      res = await fetch(url, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { Authorization: token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
        cache: "no-store",
      });
    } catch (e) {
      console.log(`[wb] ${section} ${path.split("?")[0]} — нет ответа за ${Date.now() - t0} мс (${e instanceof Error ? e.name : "?"}), попытка ${attempt + 1}`);
      if (attempt < 2) { await sleep(3_000); continue; }
      throw new WbError(null, "WB не отвечает");
    }
    // Лимиты WB считаются на весь аккаунт продавца, поэтому 429 бывает и из-за других сервисов
    // с тем же кабинетом. Ждём столько, сколько просит WB (но не меньше обычного окна раздела) и пробуем снова.
    console.log(`[wb] ${section} ${path.split("?")[0]} → ${res.status} за ${Date.now() - t0} мс, попытка ${attempt + 1}` +
      (res.status === 429 ? `, retry=${res.headers.get("x-ratelimit-retry") ?? "?"} remaining=${res.headers.get("x-ratelimit-remaining") ?? "?"} reset=${res.headers.get("x-ratelimit-reset") ?? "?"}` : ""));
    if (res.status === 429) last429 = `${(await res.clone().text().catch(() => "")).slice(0, 160)} · retry=${res.headers.get("x-ratelimit-retry") ?? "?"} remaining=${res.headers.get("x-ratelimit-remaining") ?? "?"}`;
    if (res.status === 429 && attempt < 5) {
      const asked = Number(res.headers.get("x-ratelimit-retry") ?? res.headers.get("retry-after") ?? 0) || 0;
      await sleep(mock ? 100 : Math.min(Math.max(asked, WAIT_429[section]), 90) * 1000);
      continue;
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      const why =
        res.status === 401 ? "у токена нет доступа к этому разделу" :
        res.status === 429 ? `WB 5 раз ответил «слишком частые запросы» — лимит аккаунта занят, возможно, другим сервисом. Попробуйте позже. Ответ WB: ${last429}` :
        `код ${res.status}${text ? `: ${text}` : ""}`;
      throw new WbError(res.status, why);
    }
    // 204 — WB так отвечает, когда данных нет.
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }
}

export type WbCard = {
  nmID: number; imtID?: number; vendorCode: string; brand?: string; subjectName?: string; title?: string;
  photos?: { tm?: string; c246x328?: string; square?: string; big?: string }[];
  sizes?: { techSize?: string; skus?: string[] }[];
  updatedAt?: string;
};

// Все карточки кабинета, по 100 штук за запрос.
export async function fetchCards(token: string): Promise<WbCard[]> {
  const all: WbCard[] = [];
  let cursor: Record<string, unknown> = { limit: 100 };
  for (let page = 0; page < 500; page++) {
    const res = await wbFetch<{ cards?: WbCard[]; cursor?: { updatedAt?: string; nmID?: number; total?: number } }>(
      "content", "/content/v2/get/cards/list", token, { settings: { cursor, filter: { withPhoto: -1 } } });
    const cards = res.cards ?? [];
    all.push(...cards);
    if (cards.length < 100 || !res.cursor?.updatedAt) break;
    cursor = { limit: 100, updatedAt: res.cursor.updatedAt, nmID: res.cursor.nmID };
  }
  return all;
}

export type WbPrice = { nmID: number; sizes?: { price?: number; discountedPrice?: number }[] };

export async function fetchPrices(token: string): Promise<WbPrice[]> {
  const all: WbPrice[] = [];
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const res = await wbFetch<{ data?: { listGoods?: WbPrice[] } }>(
      "prices", `/api/v2/list/goods/filter?limit=1000&offset=${offset}`, token);
    const goods = res.data?.listGoods ?? [];
    all.push(...goods);
    if (goods.length < 1000) break;
  }
  return all;
}

export type WbOrder = {
  date: string; lastChangeDate: string; nmId: number; techSize?: string; warehouseType?: string;
  priceWithDisc?: number; finishedPrice?: number; spp?: number; isCancel?: boolean; cancelDate?: string; srid: string;
};
export type WbSale = {
  date: string; lastChangeDate: string; nmId: number; techSize?: string;
  priceWithDisc?: number; forPay?: number; saleID: string; srid?: string;
};
export type WbStock = { nmId: number; quantity?: number; inWayToClient?: number; inWayFromClient?: number };

// Заказы / продажи, изменившиеся с момента dateFrom (московское время). WB отдаёт до ~80 000 строк
// за раз; если пришло много — запрашиваем продолжение с даты последней строки (не чаще раза в минуту).
async function fetchChanged<T extends { lastChangeDate: string }>(kind: "orders" | "sales", token: string, dateFrom: string): Promise<T[]> {
  const all: T[] = [];
  let from = dateFrom;
  for (let page = 0; page < 20; page++) {
    const rows = await wbFetch<T[]>("statistics", `/api/v1/supplier/${kind}?dateFrom=${encodeURIComponent(from)}&flag=0`, token);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 50_000) break;
    from = rows[rows.length - 1].lastChangeDate;
  }
  return all;
}
export const fetchOrders = (token: string, dateFrom: string) => fetchChanged<WbOrder>("orders", token, dateFrom);
export const fetchSales = (token: string, dateFrom: string) => fetchChanged<WbSale>("sales", token, dateFrom);

// Остатки на складах WB и товары в пути — строка на каждый размер на каждом складе.
// Старый метод /api/v1/supplier/stocks WB отключил 23.06.2026. Основная замена — stocks-report/wb-warehouses,
// но он работает не со всеми типами токенов (403). Тогда берём отчёт warehouse_remains:
// заказываем отчёт, ждём готовности и скачиваем.
export async function fetchStocks(token: string): Promise<WbStock[]> {
  try {
    return await fetchStocksReport(token);
  } catch (e) {
    if (e instanceof WbError && (e.status === 403 || e.status === 401)) return fetchWarehouseRemains(token);
    throw e;
  }
}

async function fetchStocksReport(token: string): Promise<WbStock[]> {
  const all: WbStock[] = [];
  const limit = 250_000;
  for (let offset = 0; offset < 5_000_000; offset += limit) {
    const res = await wbFetch<{ data?: { items?: WbStock[] } } | null>(
      "analytics", "/api/analytics/v1/stocks-report/wb-warehouses", token, { limit, offset });
    const items = res?.data?.items ?? [];
    all.push(...items);
    if (items.length < limit) break;
    await sleep(20_000); // лимит WB: 1 запрос в 20 секунд
  }
  return all;
}

type RemainsRow = { nmId: number; warehouses?: { warehouseName: string; quantity: number }[] };

async function fetchWarehouseRemains(token: string): Promise<WbStock[]> {
  const path = "/api/v1/warehouse_remains?groupByNm=true";
  type Task = { data?: { taskId?: string } };
  // В разных версиях документации отчёт заказывается то GET, то POST — пробуем оба.
  const task = await wbFetch<Task>("analytics", path, token, undefined, "GET").catch((e) => {
    if (e instanceof WbError && (e.status === 405 || e.status === 404)) return wbFetch<Task>("analytics", path, token, {}, "POST");
    throw e;
  });
  const id = task?.data?.taskId;
  if (!id) throw new WbError(null, "WB не выдал номер отчёта об остатках");
  // Отчёт строится от нескольких секунд до пары минут. Статус можно спрашивать раз в 5 секунд.
  for (let i = 0; i < 60; i++) {
    await sleep(process.env.WB_API_MOCK ? 50 : 6_000);
    const st = await wbFetch<{ data?: { status?: string } }>("analytics", `/api/v1/warehouse_remains/tasks/${id}/status`, token);
    const status = st?.data?.status;
    if (status === "done") break;
    if (status === "canceled" || status === "purged") throw new WbError(null, `отчёт об остатках: ${status}`);
    if (i === 59) throw new WbError(null, "отчёт об остатках не успел построиться");
  }
  const rows = await wbFetch<RemainsRow[]>("analytics", `/api/v1/warehouse_remains/tasks/${id}/download`, token);
  return (Array.isArray(rows) ? rows : []).map((r) => {
    let total: number | null = null, toClient = 0, fromClient = 0, sumWh = 0;
    for (const w of r.warehouses ?? []) {
      const name = w.warehouseName.toLowerCase();
      if (name.startsWith("в пути до получател")) toClient += w.quantity;
      else if (name.startsWith("в пути возврат")) fromClient += w.quantity;
      else if (name.startsWith("всего")) total = w.quantity;
      else sumWh += w.quantity;
    }
    return { nmId: r.nmId, quantity: total ?? sumWh, inWayToClient: toClient, inWayFromClient: fromClient };
  });
}

// Остатки на складах продавца (FBS): по штрихкодам, для каждого склада продавца.
export async function fetchFbsStocks(token: string, barcodes: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const warehouses = await wbFetch<{ id: number }[]>("marketplace", "/api/v3/warehouses", token);
  for (const w of Array.isArray(warehouses) ? warehouses : []) {
    for (let i = 0; i < barcodes.length; i += 1000) {
      const res = await wbFetch<{ stocks?: { sku: string; amount: number }[] }>(
        "marketplace", `/api/v3/stocks/${w.id}`, token, { skus: barcodes.slice(i, i + 1000) });
      for (const s of res.stocks ?? []) result.set(s.sku, (result.get(s.sku) ?? 0) + (s.amount ?? 0));
    }
  }
  return result;
}
