import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function Overview() {
  const { cabinets } = await requireUser();
  return (
    <>
      <div className="topbar"><h1>Обзор</h1></div>
      <div className="grid">
        {cabinets.map((c) => (
          <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="metric-label">{c.name}</div>
            <div className="muted">{c.country} · {c.currency}</div>
            {c.apiTokenEnc
              ? <span className="status status-done">Токен подключён</span>
              : <span className="status status-wait">Нужен токен WB</span>}
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Что дальше</h2>
        <p className="muted" style={{ margin: 0 }}>
          Подключите токены WB в разделе <Link href="/settings">Кабинеты</Link>. После этого здесь появятся продажи, заказы и маржа по каждому кабинету.
        </p>
      </div>
    </>
  );
}
