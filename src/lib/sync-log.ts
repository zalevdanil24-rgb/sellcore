// Короткий журнал загрузки из WB в памяти сервера: последние 60 строк.
// Нужен, чтобы видеть прямо на странице, что отвечает WB, без доступа к логам хостинга.
const g = globalThis as unknown as { wbSyncLog?: string[] };
const lines = (g.wbSyncLog ??= []);

export function syncLog(line: string) {
  const time = new Date().toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" });
  const text = `${time} ${line}`;
  console.log(text);
  lines.push(text);
  if (lines.length > 60) lines.splice(0, lines.length - 60);
}

export const syncLogLines = () => lines.slice().reverse();
