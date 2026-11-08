import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { openRequestCount } from "@/lib/password-reset";
import { Logo } from "@/components/icons";
import { NavLinks } from "./nav-links";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, membership } = await requireUser();
  const resetRequests = membership.role === "OWNER" ? await openRequestCount(organization.id) : 0;
  return (
    <div className="shell">
      <aside className="nav">
        <Link href="/" className="nav-logo"><Logo />SellCore</Link>
        <NavLinks resetRequests={resetRequests} />
        <div className="nav-foot">
          <div style={{ fontWeight: 500 }}>{user.displayName}</div>
          <div className="muted" style={{ fontSize: 12 }}>{organization.name}</div>
          <form action={logout}>
            <button className="btn" type="submit" style={{ marginTop: 8, height: 32, width: "100%", justifyContent: "center" }}>Выйти</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
