// Кто сейчас вошёл и к какой организации и кабинетам у него есть доступ.
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "./db";
import { readSession } from "./session";

export async function requireUser() {
  const session = await readSession();
  if (!session) redirect("/login");

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) });
  // Пока у пользователя одна организация; выбор между несколькими добавим на этапе 5.
  const membership = user
    ? await db.query.memberships.findFirst({ where: eq(schema.memberships.userId, user.id) })
    : undefined;
  if (!user || !membership) redirect("/login");

  const organization = (await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, membership.organizationId),
  }))!;
  const all = await db.query.cabinets.findMany({
    where: eq(schema.cabinets.organizationId, organization.id),
    orderBy: [asc(schema.cabinets.createdAt), asc(schema.cabinets.name)],
  });
  const allowed = membership.cabinetIds;
  const cabinets = all.filter((c) => allowed.length === 0 || allowed.includes(c.id));
  return { user, membership, organization, cabinets };
}
