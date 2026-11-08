import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/icons";
import { findInvitation, roleInfo } from "@/lib/invitations";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const found = await findInvitation(token);
  return (
    <main className="auth">
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={36} />
          <span className="num" style={{ fontSize: 24 }}>SellCore</span>
        </div>
        {found ? (
          <>
            <h2 style={{ margin: 0 }}>Здравствуйте, {found.invitation.displayName}!</h2>
            <p className="muted" style={{ margin: 0 }}>
              Вас пригласили в «{found.orgName}» с ролью «{roleInfo[found.invitation.role].label}».
              Придумайте пароль — его будете знать только вы.
            </p>
            <InviteForm token={token} email={found.invitation.email} />
          </>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>Приглашение не действует</h2>
            <p style={{ margin: 0 }}>Оно устарело, уже использовано или отменено. Попросите руководителя прислать новое.</p>
            <Link href="/login" style={{ textAlign: "center" }}>Перейти ко входу</Link>
          </>
        )}
      </div>
    </main>
  );
}
