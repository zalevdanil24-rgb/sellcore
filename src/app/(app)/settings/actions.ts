"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";

async function ownCabinet(cabinetId: string) {
  const { membership, cabinets } = await requireUser();
  if (membership.role !== "OWNER") throw new Error("Только владелец может менять токены");
  if (!cabinets.some((c) => c.id === cabinetId)) throw new Error("Кабинет не найден");
}

export async function saveToken(_: { message: string; ok: boolean }, form: FormData) {
  const cabinetId = String(form.get("cabinetId") ?? "");
  const token = String(form.get("token") ?? "").trim();
  if (token.length < 20) return { message: "Похоже, это не токен WB", ok: false };
  await ownCabinet(cabinetId);
  await db
    .update(schema.cabinets)
    .set({ apiTokenEnc: encryptSecret(token), tokenAddedAt: new Date() })
    .where(eq(schema.cabinets.id, cabinetId));
  revalidatePath("/settings");
  revalidatePath("/");
  return { message: "Токен сохранён", ok: true };
}

export async function removeToken(cabinetId: string) {
  await ownCabinet(cabinetId);
  await db
    .update(schema.cabinets)
    .set({ apiTokenEnc: null, tokenAddedAt: null })
    .where(eq(schema.cabinets.id, cabinetId));
  revalidatePath("/settings");
  revalidatePath("/");
}
