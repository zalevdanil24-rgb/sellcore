"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { completeReset, notifyPasswordChanged } from "@/lib/password-reset";
import { createSession } from "@/lib/session";

type State = { error: string };

export async function resetPassword(_: State, data: FormData): Promise<State> {
  const token = String(data.get("token") ?? "");
  const password = String(data.get("password") ?? "");
  const repeat = String(data.get("repeat") ?? "");
  if (password.length < 10 || password.length > 200) return { error: "Пароль должен быть не короче 10 символов" };
  if (password !== repeat) return { error: "Пароли не совпадают" };

  const user = await completeReset(token, await bcrypt.hash(password, 12));
  if (!user) return { error: "Ссылка устарела или уже использована. Запросите новую." };

  try {
    await notifyPasswordChanged(user);
  } catch (e) {
    console.error("Не удалось отправить уведомление о смене пароля", e);
  }
  await createSession(user.id);
  redirect("/");
}
