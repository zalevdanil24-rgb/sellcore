"use client";
import { useState, useTransition } from "react";
import { createResetLink, dismissResetRequest } from "./actions";
import { CopyLink } from "./copy-link";

// Кнопка «Ссылка для нового пароля»: создаёт одноразовую ссылку и показывает её один раз, чтобы скопировать.
export function ResetLink({ userId, name, requested }: { userId: string; name: string; requested: boolean }) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  if (url) {
    return (
      <CopyLink
        url={url}
        note={`Отправьте её сотруднику (${name}) в Telegram или WhatsApp. Действует 24 часа и срабатывает один раз. Больше она не покажется.`}
      />
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        className={`btn${requested ? " btn-primary" : ""}`}
        type="button"
        disabled={pending}
        onClick={() => start(async () => setUrl((await createResetLink(userId)).url))}
      >
        {pending ? "Создаём…" : "Ссылка для нового пароля"}
      </button>
      {requested && (
        <button className="btn" type="button" disabled={pending} onClick={() => start(() => dismissResetRequest(userId))}>
          Отклонить запрос
        </button>
      )}
    </div>
  );
}
