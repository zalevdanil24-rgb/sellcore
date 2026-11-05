// Первоначальное заполнение базы: наша организация, два кабинета и владелец.
// Запуск: npm run db:seed  (почта и пароль владельца — из SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD)
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cabinets, memberships, organizations, users } from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const email = (process.env.SEED_OWNER_EMAIL ?? "").toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD ?? "";
if (!email || password.length < 10) {
  throw new Error("Укажите SEED_OWNER_EMAIL и SEED_OWNER_PASSWORD (пароль не короче 10 символов)");
}

const [org] = await db.insert(organizations).values({ name: "Наша команда", dataRegion: "RU" }).returning();
await db.insert(cabinets).values([
  { organizationId: org.id, name: "ИП Кузнецова", country: "RU", currency: "RUB" },
  // Валюту отчётов WB для Антариона уточним по первым данным API.
  { organizationId: org.id, name: "ОсОО Антарион", country: "KG", currency: "RUB" },
]);
const [owner] = await db
  .insert(users)
  .values({ email, displayName: "Данил", passwordHash: await bcrypt.hash(password, 12) })
  .returning();
await db.insert(memberships).values({ userId: owner.id, organizationId: org.id, role: "OWNER" });

await pool.end();
console.log(`Готово: организация «${org.name}», владелец ${email}`);
