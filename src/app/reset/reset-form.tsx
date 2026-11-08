"use client";
import Link from "next/link";
import { useActionState } from "react";
import { resetPassword } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, { error: "" });
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <input type="hidden" name="token" value={token} />
      <label className="field">
        Новый пароль (не короче 10 символов)
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        Повторите пароль
        <input className="input" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {state.error && (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {state.error} {state.error.includes("новую") && <Link href="/forgot">Запросить</Link>}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? "Сохраняем…" : "Сохранить и войти"}
      </button>
    </form>
  );
}
