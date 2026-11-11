"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { startSync } from "@/lib/wb-sync";

// Кнопка «Обновить»: запускает загрузку свежих данных WB в фоне.
export async function refreshSales(cabinetId: string): Promise<{ note: string | null }> {
  const { cabinets } = await requireUser();
  if (!cabinets.some((c) => c.id === cabinetId)) return { note: "Нет доступа к кабинету" };
  const result = await startSync(cabinetId, true);
  revalidatePath("/sales");
  return {
    note:
      result === "no-token" ? "Сначала подключите токен WB в разделе «Кабинеты»" :
      result === "fresh" ? "Данные только что обновлялись — WB разрешает запрос раз в минуту" : null,
  };
}
