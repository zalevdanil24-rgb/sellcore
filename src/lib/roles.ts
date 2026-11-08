// Роли сотрудников — подписи для экрана. Отдельный файл без доступа к базе, чтобы его можно было
// использовать и на сервере, и в браузере.
export type Role = "OWNER" | "MANAGER" | "LOGISTICS" | "FINANCE" | "VIEWER";

export const roleInfo: Record<Role, { label: string; hint: string }> = {
  OWNER: { label: "Владелец", hint: "полный доступ ко всему, включая сотрудников и токены WB" },
  MANAGER: { label: "Менеджер", hint: "реклама, товары, задачи" },
  LOGISTICS: { label: "Логистика", hint: "остатки и поставки" },
  FINANCE: { label: "Финансы", hint: "себестоимость и отчёты" },
  VIEWER: { label: "Просмотр", hint: "только смотреть, без изменений" },
};
