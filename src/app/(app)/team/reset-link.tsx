"use client";
import { useState, useTransition } from "react";
import { createResetLink, dismissResetRequest } from "./actions";

// Кнопка «Ссылка для нового пароля»: создаёт одноразовую ссылку и показывает её один раз, чтобы скопировать.
export function ResetLink({ userId, name, requested }: { userId: string; name: string; requested: boolean }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  if (url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 460 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} />
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          Отправьте её сотруднику ({name}) в Telegram или WhatsApp. Действует 24 часа и срабатывает один раз. Больше она не покажется.
        </span>
      </div>
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
