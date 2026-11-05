"use client";
import { useActionState } from "react";
import { removeToken, saveToken } from "./actions";

export function TokenForm({ cabinetId, connected }: { cabinetId: string; connected: boolean }) {
  const [state, action, pending] = useActionState(saveToken, { message: "", ok: false });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <form action={action} style={{ display: "flex", gap: 8 }}>
        <input type="hidden" name="cabinetId" value={cabinetId} />
        <input className="input" name="token" type="password" placeholder={connected ? "Заменить токен" : "Вставьте токен WB"} autoComplete="off" required />
        <button className="btn" type="submit" disabled={pending}>Сохранить</button>
      </form>
      {connected && (
        <form action={removeToken.bind(null, cabinetId)}>
          <button className="btn" type="submit" style={{ height: 32 }}>Отключить токен</button>
        </form>
      )}
      {state.message && <span className={state.ok ? "muted" : "error"}>{state.message}</span>}
    </div>
  );
}
