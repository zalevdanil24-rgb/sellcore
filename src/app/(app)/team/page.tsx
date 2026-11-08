import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { resetMode } from "@/lib/password-reset";
import { roleInfo } from "@/lib/roles";
import { InviteForm } from "./invite-form";
import { RemoveMember, RevokeInvite } from "./member-actions";
import { ResetLink } from "./reset-link";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bishkek" });

export default async function TeamPage() {
  const { organization, membership, user: me } = await requireUser();
  const isOwner = membership.role === "OWNER";

  const members = await db
    .select({ id: schema.users.id, name: schema.users.displayName, email: schema.users.email, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.organizationId, organization.id))
    .orderBy(asc(schema.memberships.createdAt));

  const open = isOwner
    ? await db
        .select({ userId: schema.passwordResetRequests.userId, at: schema.passwordResetRequests.createdAt })
        .from(schema.passwordResetRequests)
        .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.passwordResetRequests.userId))
        .where(and(eq(schema.memberships.organizationId, organization.id), isNull(schema.passwordResetRequests.resolvedAt)))
    : [];
  const requestedAt = new Map(open.map((r) => [r.userId, r.at]));

  // Приглашения, которые ещё не приняли (и не отменили, и не истекли).
  const pending = isOwner
    ? await db.query.invitations.findMany({
        where: and(
          eq(schema.invitations.organizationId, organization.id),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          gt(schema.invitations.expiresAt, new Date()),
        ),
        orderBy: [desc(schema.invitations.createdAt)],
      })
    : [];

  return (
    <>
      <div className="topbar"><h1>Сотрудники</h1></div>
      {isOwner && <InviteForm />}

      {isOwner && open.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warning-ink)", background: "var(--warning-soft)" }}>
          <b>Забыли пароль: {open.length}</b>
          <p style={{ margin: "4px 0 0" }}>
            Нажмите «Ссылка для нового пароля» у сотрудника и отправьте ему ссылку в мессенджер.
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead><tr><th>Сотрудник</th><th>Почта</th><th>Роль</th>{isOwner && <th>Пароль</th>}{isOwner && <th></th>}</tr></thead>
          <tbody>
            {members.map((m) => {
              const at = requestedAt.get(m.id);
              return (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>
                    {m.name}
                    {m.id === me.id && <span className="muted"> (вы)</span>}
                    {at && <div className="error" style={{ fontSize: 13 }}>Забыл пароль · {fmt(at)}</div>}
                  </td>
                  <td>{m.email}</td>
                  <td>{roleInfo[m.role].label}</td>
                  {isOwner && (
                    <td>{m.id === me.id && !at ? <span className="muted">—</span> : <ResetLink userId={m.id} name={m.name} requested={!!at} />}</td>
                  )}
                  {isOwner && <td>{m.id !== me.id && <RemoveMember userId={m.id} name={m.name} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <>
          <h3 style={{ margin: 0 }}>Ждут принятия приглашения</h3>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead><tr><th>Имя</th><th>Почта</th><th>Роль</th><th>Действует до</th><th></th></tr></thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{i.displayName}</td>
                    <td>{i.email}</td>
                    <td>{roleInfo[i.role].label}</td>
                    <td>{fmt(i.expiresAt)}</td>
                    <td><RevokeInvite id={i.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 0 }}>Ссылку приглашения нельзя посмотреть повторно. Если она потерялась — пригласите человека ещё раз, старая ссылка отключится.</p>
        </>
      )}

      {isOwner && resetMode() === "owner" && (
        <p className="muted" style={{ margin: 0 }}>
          Пока на сайте не подключена отправка писем, запросы «Забыли пароль?» приходят сюда. Когда подключим почту,
          ссылка будет приходить сотруднику на почту сама.
        </p>
      )}
    </>
  );
}
