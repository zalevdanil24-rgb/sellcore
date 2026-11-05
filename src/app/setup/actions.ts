"use server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/session";

const form = z.object({
  orgName: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(10).max(200),
});

type State = { error: string; values: Record<string, string> };

export async function setupOwner(_: State, data: FormData): Promise<State> {
  const values = {
    orgName: String(data.get("orgName") ?? ""),
    displayName: String(data.get("displayName") ?? ""),
    email: String(data.get("email") ?? ""),
  };
  const parsed = form.safeParse({ ...values, password: data.get("password") });
  if (!parsed.success) return { error: "Проверьте поля: пароль не короче 10 символов", values };
  const { orgName, displayName, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  // Всё в одной транзакции с блокировкой: два одновременных запроса не создадут двух владельцев.
  const userId = await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${schema.users} in exclusive mode`);
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.users);
    if (row.n > 0) return null;
    const [org] = await tx.insert(schema.organizations).values({ name: orgName, dataRegion: "RU" }).returning();
    await tx.insert(schema.cabinets).values([
      { organizationId: org.id, name: "ИП Кузнецова", country: "RU", currency: "RUB" },
      { organizationId: org.id, name: "ОсОО Антарион", country: "KG", currency: "RUB" },
    ]);
    const [user] = await tx
      .insert(schema.users)
      .values({ email: email.toLowerCase(), displayName, passwordHash })
      .returning();
    await tx.insert(schema.memberships).values({ userId: user.id, organizationId: org.id, role: "OWNER" });
    return user.id;
  });

  if (!userId) redirect("/login");
  await createSession(userId);
  redirect("/");
}
