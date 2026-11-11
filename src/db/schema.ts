// Схема базы данных SellCore.
// Главная идея: каждый селлер — отдельная «Организация». У организации есть
// кабинеты маркетплейса (наши: ИП Кузнецова и ОсОО Антарион) и сотрудники с ролями.
// Данные одной организации никогда не видны другой.
import { createId } from "@paralleldrive/cuid2";
import { bigint, boolean, date, index, integer, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  // Когда пароль меняли в последний раз. Все входы, сделанные раньше, становятся недействительными.
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Одноразовые ссылки «Забыли пароль?». В базе храним только отпечаток (SHA-256) ссылки,
// а саму ссылку знает только получатель письма: даже утечка базы не даст сбросить чужой пароль.
export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user").on(t.userId, t.createdAt)],
);

// Запросы «Забыли пароль?», пока на сайте не подключена отправка писем.
// Владелец организации видит их в разделе «Сотрудники» и сам отправляет ссылку в мессенджер.
export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("password_reset_requests_open").on(t.userId, t.resolvedAt)],
);

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

// Приглашения сотрудников. Владелец создаёт ссылку, сотрудник по ней сам задаёт пароль.
// Как и с восстановлением пароля, храним только отпечаток ссылки.
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: role("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org").on(t.organizationId, t.createdAt)],
);

// ───── Данные WB для раздела «Продажи» ─────
// Всё привязано к кабинету. nmId — артикул WB (число в адресе карточки).
// Номера WB храним как bigint: они уже перевалили за 2 млрд и не влезают в обычное целое.

// Карточки товаров (из раздела API «Контент») и текущая цена (раздел «Цены и скидки»).
export const wbProducts = pgTable(
  "wb_products",
  {
    cabinetId: text("cabinet_id").notNull().references(() => cabinets.id, { onDelete: "cascade" }),
    nmId: bigint("nm_id", { mode: "number" }).notNull(),
    imtId: bigint("imt_id", { mode: "number" }), // общий номер склейки карточек
    vendorCode: text("vendor_code").notNull(), // артикул продавца
    brand: text("brand").default("").notNull(),
    subject: text("subject").default("").notNull(), // категория (предмет)
    title: text("title").default("").notNull(),
    photoUrl: text("photo_url"),
    barcodes: text("barcodes").array().default([]).notNull(),
    cardUpdatedAt: timestamp("card_updated_at", { withTimezone: true }),
    price: real("price"), // цена до скидки продавца
    discountedPrice: real("discounted_price"), // цена со скидкой продавца (без СПП)
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.cabinetId, t.nmId] })],
);

// Заказы: одна строка = одна единица товара. day — дата заказа по Москве (так считает WB).
export const wbOrders = pgTable(
  "wb_orders",
  {
    cabinetId: text("cabinet_id").notNull().references(() => cabinets.id, { onDelete: "cascade" }),
    srid: text("srid").notNull(), // уникальный номер заказа
    day: date("day").notNull(),
    orderedAt: timestamp("ordered_at").notNull(), // московское время, как отдаёт WB
    lastChangeAt: timestamp("last_change_at").notNull(),
    nmId: bigint("nm_id", { mode: "number" }).notNull(),
    techSize: text("tech_size").default("").notNull(),
    warehouseType: text("warehouse_type").default("").notNull(), // «Склад WB» / «Склад продавца»
    priceWithDisc: real("price_with_disc").default(0).notNull(), // цена со скидкой продавца
    finishedPrice: real("finished_price").default(0).notNull(), // цена для покупателя (с СПП)
    spp: real("spp").default(0).notNull(),
    isCancel: boolean("is_cancel").default(false).notNull(),
    cancelDay: date("cancel_day"),
  },
  (t) => [
    primaryKey({ columns: [t.cabinetId, t.srid] }),
    index("wb_orders_day").on(t.cabinetId, t.day, t.nmId),
    index("wb_orders_cancel").on(t.cabinetId, t.cancelDay),
  ],
);

// Продажи (выкупы) и возвраты: одна строка = одна единица. Возврат — isReturn = true.
export const wbSales = pgTable(
  "wb_sales",
  {
    cabinetId: text("cabinet_id").notNull().references(() => cabinets.id, { onDelete: "cascade" }),
    saleId: text("sale_id").notNull(), // S… продажа, R… возврат
    srid: text("srid").default("").notNull(),
    day: date("day").notNull(),
    soldAt: timestamp("sold_at").notNull(),
    lastChangeAt: timestamp("last_change_at").notNull(),
    nmId: bigint("nm_id", { mode: "number" }).notNull(),
    techSize: text("tech_size").default("").notNull(),
    priceWithDisc: real("price_with_disc").default(0).notNull(),
    forPay: real("for_pay").default(0).notNull(), // к перечислению продавцу
    isReturn: boolean("is_return").default(false).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cabinetId, t.saleId] }),
    index("wb_sales_day").on(t.cabinetId, t.day, t.nmId),
  ],
);

// Текущие остатки по артикулу. История не хранится — WB отдаёт только «сейчас».
export const wbStocks = pgTable(
  "wb_stocks",
  {
    cabinetId: text("cabinet_id").notNull().references(() => cabinets.id, { onDelete: "cascade" }),
    nmId: bigint("nm_id", { mode: "number" }).notNull(),
    fbo: integer("fbo").default(0).notNull(), // на складах WB
    fbs: integer("fbs"), // на складах продавца; пусто = у токена нет доступа к разделу «Маркетплейс»
    toClient: integer("to_client").default(0).notNull(), // в пути к клиенту
    fromClient: integer("from_client").default(0).notNull(), // в пути от клиента
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.cabinetId, t.nmId] })],
);

// До какого времени WB запретил запросы к разделу API (после ответа 429). Хранится в базе,
// чтобы перезапуск сайта не сбрасывал паузу и мы не продлевали блокировку лишним запросом.
export const wbRateLimits = pgTable("wb_rate_limits", {
  key: text("key").primaryKey(), // раздел + конец токена
  until: timestamp("until", { withTimezone: true }).notNull(),
});

export type Cabinet = typeof cabinets.$inferSelect;
