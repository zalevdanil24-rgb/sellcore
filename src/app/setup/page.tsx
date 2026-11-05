import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/setup";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

// Первичная настройка: работает, только пока в базе нет ни одного пользователя.
export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  return <SetupForm />;
}
