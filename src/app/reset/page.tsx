import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/icons";
import { findValidReset } from "@/lib/password-reset";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";
// Ссылка со секретом в адресе не должна уходить на другие сайты через заголовок Referer.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const valid = await findValidReset(token);
  return (
    <main className="auth">
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} />
          <span className="num" style={{ fontSize: 24 }}>SellCore</span>
        </div>
        <h2 style={{ margin: 0 }}>Новый пароль</h2>
        {valid ? (
          <ResetForm token={token} />
        ) : (
          <>
            <p style={{ margin: 0 }}>Ссылка устарела или уже использована.</p>
            <Link className="btn btn-primary" href="/forgot" style={{ justifyContent: "center" }}>Запросить новую ссылку</Link>
          </>
        )}
        <Link href="/login" style={{ textAlign: "center" }}>Вернуться ко входу</Link>
      </div>
    </main>
  );
}
