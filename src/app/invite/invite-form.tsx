"use client";
import { useActionState } from "react";
import { acceptInvite } from "./actions";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvite, { error: "" });
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <input type="hidden" name="token" value={token} />
      <label className="field">
        Почта для входа
        <input className="input" type="email" name="email" value={email} readOnly autoComplete="username" />
      </label>
      <label className="field">
        Придумайте пароль (не короче 10 символов)
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        Повторите пароль
        <input className="input" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? "Создаём…" : "Создать пароль и войти"}
      </button>
    </form>
  );
}
