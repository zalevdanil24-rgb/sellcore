"use client";
import { useActionState } from "react";
import { checkTokens, type CheckState } from "./check-action";

export function TokenCheck() {
  const [state, action, pending] = useActionState(checkTokens, { rows: [] } as CheckState);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Проверка доступа к API WB</h2>
        <form action={action} style={{ marginLeft: "auto" }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Проверяем…" : "Проверить токены"}
          </button>
        </form>
      </div>
      {state.error && <p className="error" style={{ margin: 0 }}>{state.error}</p>}
      {state.rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Кабинет</th>
                {state.rows[0].results.map((r) => <th key={r.key}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  {row.results.map((r) => (
                    <td key={r.key}>
                      <span className={`status ${r.ok ? "status-done" : "status-late"}`} title={r.status ? `Код ответа ${r.status}` : "Нет ответа"}>
                        {r.ok ? "Есть" : r.status === 401 ? "Нет доступа" : "Ошибка"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.checkedAt && <p className="muted" style={{ margin: 0 }}>Проверено: {state.checkedAt}</p>}
    </div>
  );
}
