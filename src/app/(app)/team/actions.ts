"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { dismissRequests, issueManualLink } from "@/lib/password-reset";

// Только владелец и только для людей из своей организации.
async function ownMember(userId: string) {
  const { membership, organization } = await requireUser();
  if (membership.role !== "OWNER") throw new Error("Только владелец может восстанавливать пароли");
  const member = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.userId, userId), eq(schema.memberships.organizationId, organization.id)),
  });
  if (!member) throw new Error("Сотрудник не найден");
}

export async function createResetLink(userId: string): Promise<{ url: string }> {
  await ownMember(userId);
  const url = await issueManualLink(userId);
  revalidatePath("/", "layout");
  return { url };
}

export async function dismissResetRequest(userId: string) {
  await ownMember(userId);
  await dismissRequests(userId);
  revalidatePath("/", "layout");
}
