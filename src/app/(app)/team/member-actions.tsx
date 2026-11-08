"use client";
import { useState, useTransition } from "react";
import { removeMember, revokeInvite } from "./actions";

// Удаление в два нажатия, чтобы не убрать человека случайно.
export function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) return <button className="btn" type="button" onClick={() => setConfirm(true)}>Удалить</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>Удалить {name}? Доступ пропадёт сразу.</span>
      <button className="btn" type="button" disabled={pending} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        onClick={() => start(() => removeMember(userId))}>Да, удалить</button>
      <button className="btn" type="button" onClick={() => setConfirm(false)}>Нет</button>
    </div>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn" type="button" disabled={pending} onClick={() => start(() => revokeInvite(id))}>Отменить</button>;
}
