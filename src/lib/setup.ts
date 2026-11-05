import { sql } from "drizzle-orm";
import { db, schema } from "./db";

export async function hasAnyUser() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  return row.n > 0;
}
