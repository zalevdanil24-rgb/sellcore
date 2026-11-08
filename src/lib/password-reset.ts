// Логика восстановления пароля.
// 1. Человек вводит почту → создаём случайную ссылку на 1 час и отправляем письмо.
// 2. По ссылке он задаёт новый пароль → ссылка сгорает, все старые входы на других устройствах выходят.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { appUrl, layout, sendMail } from "./mail";

export const RESET_TTL_MINUTES = 60;
const MAX_PER_HOUR = 3; // не больше 3 писем на одну почту в час — защита от спама

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  // Если такой почты нет — молча ничего не делаем. Ответ на экране одинаковый,
  // чтобы по форме нельзя было проверить, зарегистрирован ли человек.
  if (!user) return;

  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.userId, user.id), gt(schema.passwordResets.createdAt, sql`now() - interval '1 hour'`)));
  if (recent.n >= MAX_PER_HOUR) return;

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    // Прежние неиспользованные ссылки гасим — действует только последняя.
    await tx
      .update(schema.passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.passwordResets.userId, user.id), isNull(schema.passwordResets.usedAt)));
    await tx.insert(schema.passwordResets).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
    });
  });

  const url = `${appUrl()}/reset?token=${token}`;
  const lines = [
    `Здравствуйте, ${user.displayName}!`,
    "Кто-то (надеемся, вы) попросил восстановить пароль от SellCore.",
    `Ссылка действует ${RESET_TTL_MINUTES} минут и срабатывает один раз.`,
    "Если вы ничего не запрашивали — просто удалите письмо, пароль останется прежним.",
  ];
  await sendMail({
    to: user.email,
    subject: "SellCore — восстановление пароля",
    text: `${lines.join("\n")}\n\nЗадать новый пароль: ${url}`,
    html: layout("Восстановление пароля", lines, { label: "Задать новый пароль", url }),
  });
}

// Действует ли ссылка (для показа формы).
export async function findValidReset(token: string) {
  if (!token) return null;
  return (
    (await db.query.passwordResets.findFirst({
      where: and(
        eq(schema.passwordResets.tokenHash, hashToken(token)),
        isNull(schema.passwordResets.usedAt),
        gt(schema.passwordResets.expiresAt, new Date()),
      ),
    })) ?? null
  );
}

// Меняет пароль по ссылке. Возвращает пользователя или null, если ссылка уже не действует.
export async function completeReset(token: string, passwordHash: string) {
  return db.transaction(async (tx) => {
    const now = new Date();
    // «Забираем» ссылку одной командой: даже два одновременных нажатия не используют её дважды.
    const [reset] = await tx
      .update(schema.passwordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(schema.passwordResets.tokenHash, hashToken(token)),
          isNull(schema.passwordResets.usedAt),
          gt(schema.passwordResets.expiresAt, now),
        ),
      )
      .returning();
    if (!reset) return null;
    const [user] = await tx
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(schema.users.id, reset.userId))
      .returning();
    return user ?? null;
  });
}

// Уведомление «пароль изменён» — чтобы владелец сразу узнал, если это сделал не он.
export async function notifyPasswordChanged(user: { email: string; displayName: string }) {
  const lines = [
    `Здравствуйте, ${user.displayName}!`,
    "Пароль от SellCore только что изменён. На всех других устройствах выполнен выход.",
    "Если это были не вы — сразу восстановите пароль по ссылке «Забыли пароль?» и сообщите владельцу организации.",
  ];
  await sendMail({
    to: user.email,
    subject: "SellCore — пароль изменён",
    text: lines.join("\n"),
    html: layout("Пароль изменён", lines, { label: "Открыть SellCore", url: `${appUrl()}/login` }),
  });
}
