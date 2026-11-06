"use server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { pingAll, type PingResult } from "@/lib/wb";

export type CheckState = {
  rows: { name: string; results: PingResult[] }[];
  error?: string;
  checkedAt?: string;
};

export async function checkTokens(_: CheckState): Promise<CheckState> {
  const { cabinets } = await requireUser();
  const withToken = cabinets.filter((c) => c.apiTokenEnc);
  if (withToken.length === 0) return { rows: [], error: "Сначала подключите хотя бы один токен" };

  // Кабинеты проверяем по очереди, чтобы не упереться в лимиты WB.
  const rows = [];
  for (const c of withToken) {
    rows.push({ name: c.name, results: await pingAll(decryptSecret(c.apiTokenEnc!)) });
  }
  const checkedAt = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" });
  return { rows, checkedAt };
}
