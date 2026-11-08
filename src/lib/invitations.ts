// Приглашения сотрудников.
// 1. Владелец в «Сотрудниках» указывает имя, почту и роль → получает ссылку на 7 дней.
// 2. Отправляет её в мессенджер (позже — письмом).
// 3. Сотрудник открывает ссылку, сам придумывает пароль и попадает на сайт.
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { appUrl } from "./mail";
import { hashToken } from "./password-reset";
import { roleInfo, type Role } from "./roles";

export { roleInfo, type Role };

export const INVITE_TTL_DAYS = 7;
export async function createInvitation(input: {
  organizationId: string;
  invitedBy: string;
  email: string;
  displayName: string;
  role: Role;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) {
    const member = await db.query.memberships.findFirst({
      where: and(eq(schema.memberships.userId, existing.id), eq(schema.memberships.organizationId, input.organizationId)),
    });
    return { error: member ? "Этот человек уже в команде" : "Эта почта уже занята на SellCore" } as const;
  }

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    // Старые неиспользованные приглашения на эту же почту отменяем — действует последнее.
    await tx
      .update(schema.invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.organizationId, input.organizationId),
          eq(schema.invitations.email, email),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      );
    await tx.insert(schema.invitations).values({
      organizationId: input.organizationId,
      invitedBy: input.invitedBy,
      email,
      displayName: input.displayName.trim(),
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    });
  });
  return { url: `${appUrl()}/invite?token=${token}` } as const;
}

const validWhere = (token: string) =>
  and(
    eq(schema.invitations.tokenHash, hashToken(token)),
    isNull(schema.invitations.acceptedAt),
    isNull(schema.invitations.revokedAt),
    gt(schema.invitations.expiresAt, new Date()),
  );

// Действующее приглашение с названием организации (для страницы /invite).
export async function findInvitation(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({ invitation: schema.invitations, orgName: schema.organizations.name })
    .from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.organizationId))
    .where(validWhere(token));
  return row ?? null;
}

// Принимает приглашение: создаёт пользователя и доступ к организации. Возвращает id пользователя.
export async function acceptInvitation(token: string, passwordHash: string) {
  return db.transaction(async (tx) => {
    // «Забираем» приглашение одной командой — дважды им не воспользоваться.
    const [inv] = await tx
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(validWhere(token))
      .returning();
    if (!inv) return { error: "Приглашение устарело или уже использовано. Попросите новое." } as const;
    const taken = await tx.query.users.findFirst({ where: eq(schema.users.email, inv.email) });
    if (taken) return { error: "Эта почта уже зарегистрирована. Войдите со своим паролем." } as const;
    const [user] = await tx
      .insert(schema.users)
      .values({ email: inv.email, displayName: inv.displayName, passwordHash })
      .returning();
    await tx.insert(schema.memberships).values({ userId: user.id, organizationId: inv.organizationId, role: inv.role });
    return { userId: user.id } as const;
  });
}
