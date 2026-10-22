import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listAdminOrders } from "@/lib/admin/service";
import { listAllServices } from "@/lib/orders/service";
import { ORDER_STATUSES, statusLabel } from "@/lib/orders/status";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge, PaymentBadge } from "@/components/orders/status-badge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; service?: string; q?: string; page?: string }>;
}) {
  await requirePermission("orders:read:all");
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);

  const [{ rows, total }, services] = await Promise.all([
    listAdminOrders({
      status: params.status,
      serviceSlug: params.service,
      search: params.q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listAllServices(),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as Array<[string, string]>);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Orders</h2>
        <p className="mt-1 text-sm text-ink-soft">{formatNumber(total)} matching order(s).</p>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Search
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Order, email or URL" />
          </label>
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Status
            <Select name="status" defaultValue={params.status ?? "all"}>
              <option value="all">All statuses</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Service
            <Select name="service" defaultValue={params.service ?? ""}>
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service.slug} value={service.slug}>
                  {service.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
              Filter
            </button>
            <Link href="/admin/orders" className="h-11 rounded-xl border border-line px-4 py-2.5 text-sm text-ink-soft hover:text-ink">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No orders found" description="Adjust the filters or wait for the first order." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Service</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.publicId} className="hover:bg-canvas/50">
                <Td>
                  <Link href={`/admin/orders/${order.publicId}`} className="font-semibold text-ink hover:text-brand-700">
                    {order.publicId}
                  </Link>
                  <p className="text-xs text-ink-faint">{formatDateTime(order.createdAt)}</p>
                </Td>
                <Td>
                  <p className="text-ink">{order.customerName}</p>
                  <p className="text-xs text-ink-faint">{order.customerEmail}</p>
                </Td>
                <Td className="text-xs">
                  {order.serviceName}
                  <p className="text-ink-faint">{formatNumber(order.quantity)} units</p>
                </Td>
                <Td className="text-xs">{order.providerName ?? <span className="text-warn">Unassigned</span>}</Td>
                <Td>
                  <StatusBadge status={order.status} />
                </Td>
                <Td>
                  <PaymentBadge status={order.paymentStatus} />
                </Td>
                <Td className="text-right tabular-nums">{formatPaise(order.totalPaise)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-ink-faint">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-line px-3 py-1.5"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page + 1) }).toString()}`}
                className="rounded-lg border border-line px-3 py-1.5"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
