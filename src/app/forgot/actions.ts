"use server";
import { z } from "zod";
import { requestReset, resetMode, type ResetMode } from "@/lib/password-reset";

type State = { sent: boolean; error: string; email: string; mode?: ResetMode };

export async function forgotPassword(_: State, data: FormData): Promise<State> {
  const email = String(data.get("email") ?? "").trim();
  if (!z.string().email().safeParse(email).success) return { sent: false, error: "Введите почту полностью", email };
  try {
    await requestReset(email);
  } catch (e) {
    // Сбой почтового сервиса не показываем подробно, но записываем в лог сервера.
    console.error("Не удалось отправить письмо для восстановления пароля", e);
    return { sent: false, error: "Не получилось отправить письмо. Попробуйте ещё раз через пару минут.", email };
  }
  return { sent: true, error: "", email, mode: resetMode() };
}
