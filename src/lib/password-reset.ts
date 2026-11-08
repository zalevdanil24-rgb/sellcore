// Логика восстановления пароля.
// Два режима:
//  • почта настроена (SMTP_*) — человек вводит почту, получает письмо со ссылкой на 1 час;
//  • почта не настроена — создаётся запрос, владелец видит его в «Сотрудниках», нажимает кнопку
//    и отправляет ссылку сотруднику в мессенджер (ссылка действует 24 часа).
// По ссылке задаётся новый пароль → ссылка сгорает, все старые входы на других устройствах выходят.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { appUrl, layout, mailConfigured, sendMail } from "./mail";

export const RESET_TTL_MINUTES = 60;
export const MANUAL_TTL_HOURS = 24; // ссылка, которую владелец пересылает сам, живёт дольше
const MAX_PER_HOUR = 3; // не больше 3 писем на одну почту в час — защита от спама

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type ResetMode = "email" | "owner";
export const resetMode = (): ResetMode => (mailConfigured() ? "email" : "owner");

// Создаёт новую одноразовую ссылку; прежние неиспользованные гасит — действует только последняя.
async function issueToken(userId: string, ttlMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(schema.passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.passwordResets.userId, userId), isNull(schema.passwordResets.usedAt)));
    await tx.insert(schema.passwordResets).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });
  });
  return `${appUrl()}/reset?token=${token}`;
}

export async function requestReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  // Если такой почты нет — молча ничего не делаем. Ответ на экране одинаковый,
  // чтобы по форме нельзя было проверить, зарегистрирован ли человек.
  if (!user) return;

  if (resetMode() === "owner") {
    // Один открытый запрос на человека: повторные нажатия не плодят дубли.
    const open = await db.query.passwordResetRequests.findFirst({
      where: and(eq(schema.passwordResetRequests.userId, user.id), isNull(schema.passwordResetRequests.resolvedAt)),
    });
    if (!open) await db.insert(schema.passwordResetRequests).values({ userId: user.id });
    return;
  }

  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.userId, user.id), gt(schema.passwordResets.createdAt, sql`now() - interval '1 hour'`)));
  if (recent.n >= MAX_PER_HOUR) return;

  const url = await issueToken(user.id, RESET_TTL_MINUTES);
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

// Владелец создаёт ссылку для сотрудника вручную. Запросы этого сотрудника закрываются.
export async function issueManualLink(userId: string) {
  const url = await issueToken(userId, MANUAL_TTL_HOURS * 60);
  await db
    .update(schema.passwordResetRequests)
    .set({ resolvedAt: new Date() })
    .where(and(eq(schema.passwordResetRequests.userId, userId), isNull(schema.passwordResetRequests.resolvedAt)));
  return url;
}

export async function dismissRequests(userId: string) {
  await db
    .update(schema.passwordResetRequests)
    .set({ resolvedAt: new Date() })
    .where(and(eq(schema.passwordResetRequests.userId, userId), isNull(schema.passwordResetRequests.resolvedAt)));
}

// Сколько открытых запросов у сотрудников организации (для значка в меню).
export async function openRequestCount(organizationId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.passwordResetRequests)
    .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.passwordResetRequests.userId))
    .where(and(eq(schema.memberships.organizationId, organizationId), isNull(schema.passwordResetRequests.resolvedAt)));
  return row.n;
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
    // Пароль сменён — открытые запросы владельцу больше не нужны.
    await tx
      .update(schema.passwordResetRequests)
      .set({ resolvedAt: now })
      .where(and(eq(schema.passwordResetRequests.userId, reset.userId), isNull(schema.passwordResetRequests.resolvedAt)));
    return user ?? null;
  });
}

// Уведомление «пароль изменён» — чтобы владелец сразу узнал, если это сделал не он.
export async function notifyPasswordChanged(user: { email: string; displayName: string }) {
  if (!mailConfigured()) return;
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
