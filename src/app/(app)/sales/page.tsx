import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSales } from "@/lib/sales-data";
import { startSync, syncStatus } from "@/lib/wb-sync";
import { SalesDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ cabinet?: string }> }) {
  const { cabinets } = await requireUser();
  const wanted = (await searchParams).cabinet;
  const cabinet = cabinets.find((c) => c.id === wanted) ?? cabinets.find((c) => c.apiTokenEnc) ?? cabinets[0];

  if (!cabinet) {
    return (<><div className="topbar"><h1>Продажи</h1></div><div className="card muted">Нет доступных кабинетов.</div></>);
  }

  const tabs = cabinets.length > 1 && (
    <div className="seg">
      {cabinets.map((c) => (
        <Link key={c.id} href={`/sales?cabinet=${c.id}`} className={c.id === cabinet.id ? "on" : ""}>{c.name}</Link>
      ))}
    </div>
  );

  if (!cabinet.apiTokenEnc) {
    return (
      <>
        <div className="topbar"><h1>Продажи</h1>{tabs}</div>
        <div className="card">
          <p style={{ margin: 0 }}>
            У кабинета «{cabinet.name}» не подключён токен WB. Добавьте его в разделе <Link href="/settings">Кабинеты</Link> — и здесь появятся заказы и выкупы.
          </p>
        </div>
      </>
    );
  }

  // Данные старше 30 минут — тихо запускаем обновление в фоне.
  await startSync(cabinet.id).catch(() => null);
  const [data, status] = await Promise.all([loadSales(cabinet.id), syncStatus(cabinet.id)]);
  return (
    <>
      <div className="topbar"><h1>Продажи</h1>{tabs}</div>
      <SalesDashboard key={cabinet.id} cabinetId={cabinet.id} data={data} status={status} />
    </>
  );
}
