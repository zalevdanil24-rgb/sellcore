"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/components/icons";
import { forgotPassword } from "./actions";

export default function ForgotPage() {
  const [state, action, pending] = useActionState(forgotPassword, { sent: false, error: "", email: "" });
  return (
    <main className="auth">
      <form className="card" action={action}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} />
          <span className="num" style={{ fontSize: 24 }}>SellCore</span>
        </div>
        <h2 style={{ margin: 0 }}>Восстановление пароля</h2>
        {state.sent ? (
          <>
            <p style={{ margin: 0 }}>
              Если почта <b>{state.email}</b> зарегистрирована в SellCore, на неё пришло письмо со ссылкой. Ссылка действует 1 час.
            </p>
            <p className="muted" style={{ margin: 0 }}>Письма нет через пару минут — проверьте папку «Спам».</p>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>Укажите почту, с которой входите. Пришлём ссылку, чтобы задать новый пароль.</p>
            <label className="field">
              Почта
              <input className="input" name="email" type="email" autoComplete="email" defaultValue={state.email} key={state.email} required />
            </label>
            {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
            <button className="btn btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
              {pending ? "Отправляем…" : "Прислать ссылку"}
            </button>
          </>
        )}
        <Link href="/login" style={{ textAlign: "center" }}>Вернуться ко входу</Link>
      </form>
    </main>
  );
}
