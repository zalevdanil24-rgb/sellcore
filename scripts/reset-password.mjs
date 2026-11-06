// Сброс пароля пользователя. Запуск в консоли сервера:
//   node scripts/reset-password.mjs            — если пользователь один
//   node scripts/reset-password.mjs почта@...  — для конкретной почты
// Новый пароль генерируется случайно и печатается один раз — сохраните его.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl });

try {
  const emailArg = (process.argv[2] ?? "").toLowerCase();
  const { rows } = emailArg
    ? await pool.query("select id, email from users where email = $1", [emailArg])
    : await pool.query("select id, email from users order by created_at");

  if (rows.length === 0) {
    console.log(emailArg ? `Пользователь ${emailArg} не найден` : "В базе нет пользователей");
  } else if (rows.length > 1) {
    console.log("Пользователей несколько, укажите почту:");
    for (const r of rows) console.log("  " + r.email);
  } else {
    const user = rows[0];
    const password = randomBytes(12).toString("base64url");
    await pool.query("update users set password_hash = $1 where id = $2", [await bcrypt.hash(password, 12), user.id]);
    console.log("");
    console.log(`Почта для входа: ${user.email}`);
    console.log(`Новый пароль:    ${password}`);
    console.log("Сохраните его в менеджере паролей.");
  }
} finally {
  await pool.end();
}
