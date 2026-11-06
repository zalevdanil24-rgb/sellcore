import { requireUser } from "@/lib/auth";
import { TokenForm } from "./token-form";
import { TokenCheck } from "./check";

export default async function CabinetsPage() {
  const { cabinets, membership } = await requireUser();
  const canEdit = membership.role === "OWNER";
  return (
    <>
      <div className="topbar"><h1>Кабинеты</h1></div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead><tr><th>Кабинет</th><th>Страна</th><th>Валюта</th><th>Токен WB</th></tr></thead>
          <tbody>
            {cabinets.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td>{c.country}</td>
                <td>{c.currency}</td>
                <td>
                  {canEdit
                    ? <TokenForm cabinetId={c.id} connected={!!c.apiTokenEnc} />
                    : c.apiTokenEnc ? "Подключён" : "Не подключён"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <TokenCheck />}
      <p className="muted" style={{ margin: 0 }}>
        Токен хранится только в зашифрованном виде. Его нельзя посмотреть после сохранения — только заменить или отключить.
      </p>
    </>
  );
}
