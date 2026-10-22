import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listActiveServices, listOrdersForUser } from "@/lib/orders/service";
import { ORDER_STATUSES, statusLabel } from "@/lib/orders/status";
import { formatDateTime, formatNumber, socialLabel } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";
import { StatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { Input, Select } from "@/components/ui/field";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; service?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);

  const [{ rows, total }, services] = await Promise.all([
    listOrdersForUser(user.id, {
      status: params.status,
      serviceSlug: params.service,
      search: params.q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listActiveServices(),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
  );

  function pageHref(nextPage: number) {
    const next = new URLSearchParams(query);
    next.set("page", String(nextPage));
    return `/dashboard/orders?${next.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Order history</h2>
          <p className="mt-1 text-sm text-ink-soft">{formatNumber(total)} order{total === 1 ? "" : "s"} in your account.</p>
        </div>
        <ButtonLink href="/services">New campaign</ButtonLink>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Search
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Order ID or URL" />
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
              Apply filters
            </button>
            <Link href="/dashboard/orders" className="h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders match those filters"
            description="Try clearing filters, or start a new campaign to see the full workflow in action."
            action={<ButtonLink href="/services">Browse services</ButtonLink>}
          />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Service / target</Th>
              <Th>Quantity</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th className="text-right">Total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.publicId} className="transition hover:bg-canvas/50">
                <Td>
                  <Link href={`/dashboard/orders/${order.publicId}`} className="font-semibold text-ink hover:text-brand-700">
                    {order.publicId}
                  </Link>
                  <p className="text-xs text-ink-faint">{formatDateTime(order.createdAt)}</p>
                </Td>
                <Td>
                  <p className="font-medium text-ink">{order.serviceName}</p>
                  <p className="text-xs text-ink-faint">{socialLabel(order.targetUrl)}</p>
                </Td>
                <Td className="tabular-nums">{formatNumber(order.quantity)}</Td>
                <Td>
                  <StatusBadge status={order.status} />
                </Td>
                <Td>
                  <PaymentBadge status={order.paymentStatus} />
                </Td>
                <Td className="text-right tabular-nums">{formatPaise(order.totalPaise)}</Td>
                <Td className="text-right">
                  <Link href={`/dashboard/orders/${order.publicId}`} className="link text-xs">
                    Open
                  </Link>
                </Td>
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
              <Link href={pageHref(page - 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
