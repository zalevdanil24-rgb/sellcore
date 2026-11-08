"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { acceptInvitation } from "@/lib/invitations";
import { createSession } from "@/lib/session";

export async function acceptInvite(_: { error: string }, data: FormData): Promise<{ error: string }> {
  const token = String(data.get("token") ?? "");
  const password = String(data.get("password") ?? "");
  const repeat = String(data.get("repeat") ?? "");
  if (password.length < 10 || password.length > 200) return { error: "Пароль должен быть не короче 10 символов" };
  if (password !== repeat) return { error: "Пароли не совпадают" };

  const result = await acceptInvitation(token, await bcrypt.hash(password, 12));
  if ("error" in result) return { error: result.error ?? "" };
  await createSession(result.userId);
  redirect("/");
}
