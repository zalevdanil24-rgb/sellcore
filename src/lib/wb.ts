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
