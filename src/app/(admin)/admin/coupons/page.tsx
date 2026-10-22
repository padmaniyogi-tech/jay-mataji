import { desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { coupons } from "@/lib/db/schema";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Badge, Card, CardBody, CardHeader, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";
import { CouponForm, CouponToggle } from "@/components/admin/coupon-form";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requirePermission("coupons:manage");
  const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(100);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Coupons</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Percent values are 1–100. Redemption counts are enforced server-side inside the order transaction.
        </p>
      </div>

      <Card>
        <CardHeader title="Create a coupon" />
        <CardBody>
          <CouponForm />
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No coupons" description="Create your first discount code above." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Discount</Th>
              <Th>Conditions</Th>
              <Th className="text-right">Used</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((coupon) => (
              <tr key={coupon.id}>
                <Td>
                  <p className="font-semibold text-ink">{coupon.code}</p>
                  {coupon.description && <p className="text-xs text-ink-faint">{coupon.description}</p>}
                </Td>
                <Td className="text-xs">
                  {coupon.type === "percent" ? `${coupon.value}% off` : `${formatPaise(coupon.value)} off`}
                  {coupon.maxDiscountPaise ? <p className="text-ink-faint">max {formatPaise(coupon.maxDiscountPaise)}</p> : null}
                </Td>
                <Td className="text-xs">
                  min {formatPaise(coupon.minOrderPaise)}
                  {coupon.maxRedemptions ? <p className="text-ink-faint">limit {formatNumber(coupon.maxRedemptions)}</p> : null}
                </Td>
                <Td className="text-right tabular-nums">{formatNumber(coupon.redemptionCount)}</Td>
                <Td>
                  <Badge tone={coupon.active ? "success" : "neutral"}>{coupon.active ? "active" : "disabled"}</Badge>
                </Td>
                <Td className="text-xs">{formatDateTime(coupon.createdAt)}</Td>
                <Td>
                  <CouponToggle couponId={coupon.id} active={coupon.active} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
