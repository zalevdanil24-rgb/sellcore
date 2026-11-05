"use client";
import { useActionState } from "react";
import { Logo } from "@/components/icons";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "", email: "" });
  return (
    <main className="auth">
      <form className="card" action={action}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} />
          <span className="num" style={{ fontSize: 24 }}>SellCore</span>
        </div>
        <h2 style={{ margin: 0 }}>Вход</h2>
        <label className="field">
          Почта
          <input className="input" name="email" type="email" autoComplete="email" defaultValue={state.email} key={state.email} required />
        </label>
        <label className="field">
          Пароль
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
          {pending ? "Входим…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
