"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { createInvitation } from "@/lib/invitations";
import { dismissRequests, issueManualLink } from "@/lib/password-reset";

// Все действия здесь — только для владельца и только внутри своей организации.
async function requireOwner() {
  const ctx = await requireUser();
  if (ctx.membership.role !== "OWNER") throw new Error("Только владелец может управлять сотрудниками");
  return ctx;
}

async function ownMember(userId: string) {
  const ctx = await requireOwner();
  const member = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.userId, userId), eq(schema.memberships.organizationId, ctx.organization.id)),
  });
  if (!member) throw new Error("Сотрудник не найден");
  return { ...ctx, member };
}

const refresh = () => revalidatePath("/", "layout");

export async function createResetLink(userId: string): Promise<{ url: string }> {
  await ownMember(userId);
  const url = await issueManualLink(userId);
  refresh();
  return { url };
}

export async function dismissResetRequest(userId: string) {
  await ownMember(userId);
  await dismissRequests(userId);
  refresh();
}

const inviteForm = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  role: z.enum(schema.role.enumValues),
});

export type InviteState = { error: string; url: string; name: string };

export async function inviteMember(_: InviteState, data: FormData): Promise<InviteState> {
  const { organization, user } = await requireOwner();
  const parsed = inviteForm.safeParse({ displayName: data.get("displayName"), email: data.get("email"), role: data.get("role") });
  if (!parsed.success) return { error: "Укажите имя и почту полностью", url: "", name: "" };
  const result = await createInvitation({ organizationId: organization.id, invitedBy: user.id, ...parsed.data });
  if ("error" in result) return { error: result.error ?? "", url: "", name: "" };
  refresh();
  return { error: "", url: result.url, name: parsed.data.displayName };
}

export async function revokeInvite(invitationId: string) {
  const { organization } = await requireOwner();
  await db
    .update(schema.invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.organizationId, organization.id)));
  refresh();
}

// Убирает человека из команды: доступ пропадает сразу. Себя удалить нельзя.
export async function removeMember(userId: string) {
  const { user, member } = await ownMember(userId);
  if (userId === user.id) throw new Error("Нельзя удалить самого себя");
  await db.transaction(async (tx) => {
    await tx.delete(schema.memberships).where(eq(schema.memberships.id, member.id));
    // Если человек больше ни в одной команде не состоит — удаляем и сам аккаунт.
    const other = await tx.query.memberships.findFirst({ where: eq(schema.memberships.userId, userId) });
    if (!other) await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
  refresh();
}
