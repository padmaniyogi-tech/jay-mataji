import { requirePermission } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/admin/service";
import { formatDateTime } from "@/lib/format";
import { Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requirePermission("audit:read");
  const rows = await listAuditLogs(150);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Audit log</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Append-only record of administrative and security-relevant actions. Entries include the actor, entity and metadata.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No audit entries" description="Actions will be recorded here as staff manage the platform." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Metadata</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="align-top">
                <Td className="whitespace-nowrap text-xs">{formatDateTime(entry.createdAt)}</Td>
                <Td className="text-xs">
                  {entry.actorEmail ?? "system"}
                  <p className="text-ink-faint">{entry.actorRole ?? "—"}</p>
                </Td>
                <Td className="text-xs font-medium text-ink">{entry.action}</Td>
                <Td className="text-xs">
                  {entry.entityType}
                  <p className="break-all text-ink-faint">{entry.entityId ?? "—"}</p>
                </Td>
                <Td className="max-w-[320px] break-words font-mono text-[10px] text-ink-faint">
                  {Object.keys(entry.metadata).length > 0 ? JSON.stringify(entry.metadata) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
