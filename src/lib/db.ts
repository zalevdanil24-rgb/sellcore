import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

// Одно подключение к базе на всё приложение (в режиме разработки Next перезагружает модули).
const g = globalThis as unknown as { pool?: Pool };
// DATABASE_SSL=no-verify — шифрованное подключение без проверки сертификата (для облачных баз с собственным сертификатом).
const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined;
const pool = g.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl });
if (process.env.NODE_ENV !== "production") g.pool = pool;

export const db = drizzle(pool, { schema });
// Прямое подключение — для массовой загрузки данных WB, где нужен обычный SQL.
export { pool };
export { schema };
