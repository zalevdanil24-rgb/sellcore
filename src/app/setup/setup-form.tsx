"use client";
import { useActionState } from "react";
import { Logo } from "@/components/icons";
import { setupOwner } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupOwner, { error: "", values: {} as Record<string, string> });
  const v = state.values;
  return (
    <main className="auth">
      <form className="card" action={action}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} />
          <span className="num" style={{ fontSize: 24 }}>SellCore</span>
        </div>
        <h2 style={{ margin: 0 }}>Первичная настройка</h2>
        <p className="muted" style={{ margin: 0 }}>Создайте аккаунт владельца. Эта страница доступна только один раз.</p>
        <label className="field">
          Название организации
          <input className="input" name="orgName" defaultValue={v.orgName ?? "Наша команда"} required />
        </label>
        <label className="field">
          Ваше имя
          <input className="input" name="displayName" defaultValue={v.displayName ?? ""} required />
        </label>
        <label className="field">
          Почта для входа
          <input className="input" name="email" type="email" autoComplete="email" defaultValue={v.email ?? ""} required />
        </label>
        <label className="field">
          Пароль (не короче 10 символов)
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending} style={{ justifyContent: "center" }}>
          {pending ? "Создаём…" : "Создать и войти"}
        </button>
      </form>
    </main>
  );
}
