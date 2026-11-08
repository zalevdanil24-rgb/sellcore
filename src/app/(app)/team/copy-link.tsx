"use client";
import { useState } from "react";

// Поле со ссылкой и кнопкой «Копировать». Ссылка показывается один раз.
export function CopyLink({ url, note }: { url: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
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
      <span className="muted" style={{ fontSize: 13 }}>{note}</span>
    </div>
  );
}
