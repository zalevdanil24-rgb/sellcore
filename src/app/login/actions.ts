"use server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

const form = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(_: { error: string; email: string }, data: FormData) {
  const email = String(data.get("email") ?? "");
  const parsed = form.safeParse({ email: data.get("email"), password: data.get("password") });
  if (!parsed.success) return { error: "Проверьте почту и пароль", email };

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, parsed.data.email.toLowerCase()),
  });
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return { error: "Неверная почта или пароль", email };

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
