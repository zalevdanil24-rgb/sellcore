"use client";
import { useActionState, useState } from "react";
import { roleInfo, type Role } from "@/lib/roles";
import { inviteMember } from "./actions";
import { CopyLink } from "./copy-link";

const roles = Object.keys(roleInfo) as Role[];

export function InviteForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(inviteMember, { error: "", url: "", name: "" });
  const [role, setRole] = useState<Role>("MANAGER");

  if (!open) {
    return (
      <div>
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>+ Пригласить сотрудника</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <b>Новый сотрудник</b>
      {state.url ? (
        <>
          <p style={{ margin: 0 }}>Приглашение для «{state.name}» готово.</p>
          <CopyLink
            url={state.url}
            note="Отправьте ссылку в Telegram или WhatsApp. По ней сотрудник сам придумает пароль. Действует 7 дней и срабатывает один раз."
          />
          <div><button className="btn" type="button" onClick={() => location.reload()}>Готово</button></div>
        </>
      ) : (
        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 520 }}>
          <label className="field">
            Имя (так его будут видеть в SellCore)
            <input className="input" name="displayName" required maxLength={100} />
          </label>
          <label className="field">
            Почта — будет логином для входа
            <input className="input" name="email" type="email" required />
          </label>
          <label className="field">
            Роль
            <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>{roleInfo[r].label}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>{roleInfo[role].hint}</span>
          </label>
          {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Создаём…" : "Создать приглашение"}</button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </form>
      )}
    </div>
  );
}
