import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/setup";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Пока в базе нет ни одного пользователя — отправляем на первичную настройку.
  if (!(await hasAnyUser())) redirect("/setup");
  return <LoginForm />;
}
