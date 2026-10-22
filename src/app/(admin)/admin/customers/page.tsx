import { requirePermission } from "@/lib/auth/session";
import { listUsersWithStats } from "@/lib/admin/service";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Badge, Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";
import { UserActions } from "@/components/admin/user-actions";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const staff = await requirePermission("users:read");
  const users = await listUsersWithStats();
  const canManage = staff.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Customers &amp; staff</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {users.length} account(s). Role changes and suspensions are audited; the last administrator cannot be demoted.
        </p>
      </div>

      {users.length === 0 ? (
        <Card>
          <EmptyState title="No accounts" description="Seeded accounts should appear after running npm run db:seed." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Role</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Paid spend</Th>
              <Th>Last login</Th>
              <Th>Manage</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td>
                  <p className="font-medium text-ink">{user.name}</p>
                  <p className="break-all text-xs text-ink-faint">{user.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {user.emailVerifiedAt ? <Badge tone="success">verified</Badge> : <Badge tone="warn">unverified</Badge>}
                    {user.suspendedAt && <Badge tone="danger">suspended</Badge>}
                  </div>
                </Td>
                <Td className="text-xs">
                  {ROLE_LABELS[user.role]}
                  <p className="text-ink-faint">joined {formatDateTime(user.createdAt)}</p>
                </Td>
                <Td className="text-right tabular-nums">{formatNumber(user.orderCount)}</Td>
                <Td className="text-right tabular-nums">{formatPaise(user.spendPaise)}</Td>
                <Td className="text-xs">{formatDateTime(user.lastLoginAt)}</Td>
                <Td>
                  {canManage ? (
                    <UserActions userId={user.id} role={user.role} suspended={Boolean(user.suspendedAt)} isSelf={user.id === staff.id} />
                  ) : (
                    <span className="text-[11px] text-ink-faint">Admin only</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
