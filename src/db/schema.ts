// Схема базы данных SellCore.
// Главная идея: каждый селлер — отдельная «Организация». У организации есть
// кабинеты маркетплейса (наши: ИП Кузнецова и ОсОО Антарион) и сотрудники с ролями.
// Данные одной организации никогда не видны другой.
import { createId } from "@paralleldrive/cuid2";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// Где физически хранятся данные организации (152-ФЗ и страны СНГ).
export const dataRegion = pgEnum("data_region", ["RU", "KG"]);
// OWNER — всё; MANAGER — реклама, товары, задачи; LOGISTICS — остатки и поставки;
// FINANCE — себестоимость и отчёты; VIEWER — только просмотр.
export const role = pgEnum("role", ["OWNER", "MANAGER", "LOGISTICS", "FINANCE", "VIEWER"]);
export const marketplace = pgEnum("marketplace", ["WILDBERRIES"]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  dataRegion: dataRegion("data_region").default("RU").notNull(),
  createdAt: createdAt(),
});

// Собираем минимум персональных данных: почта для входа и имя для показа.
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: role("role").notNull(),
    // Пусто = доступ ко всем кабинетам организации; иначе — только к перечисленным.
    cabinetIds: text("cabinet_ids").array().default([]).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org").on(t.userId, t.organizationId)],
);

export const cabinets = pgTable("cabinets", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  marketplace: marketplace("marketplace").default("WILDBERRIES").notNull(),
  name: text("name").notNull(), // «ИП Кузнецова»
  country: text("country").notNull(), // RU, KG, KZ…
  currency: text("currency").notNull(), // RUB, KGS…
  // Токен API WB — только в зашифрованном виде (AES-256-GCM, см. src/lib/crypto.ts).
  apiTokenEnc: text("api_token_enc"),
  tokenAddedAt: timestamp("token_added_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Журнал фоновой загрузки данных из API WB.
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    cabinetId: text("cabinet_id").notNull().references(() => cabinets.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // orders, sales, stocks, ads, finance…
    status: text("status").notNull(), // running, ok, error
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    message: text("message"),
  },
  (t) => [index("sync_runs_cabinet_kind").on(t.cabinetId, t.kind, t.startedAt)],
);

export type Cabinet = typeof cabinets.$inferSelect;
