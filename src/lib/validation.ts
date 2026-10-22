import { z } from "zod";

/**
 * Shared request schemas.
 *
 * Rules enforced here are defence-in-depth only: the same limits are re-checked
 * server-side when pricing, routing and refunds are applied. Nothing in this file
 * trusts client-supplied money values.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(5, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.")
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), "Include at least one letter and one number.");

export const nameSchema = z.string().trim().min(2, "Enter your name.").max(120, "That name is too long.");

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+0-9 ()-]*$/, "Use digits, spaces, +, - or parentheses only.")
  .optional();

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  company: z.string().trim().max(120).optional(),
  phone: phoneSchema,
  marketingOptIn: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const profileSchema = z.object({
  name: nameSchema.optional(),
  company: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: passwordSchema,
});

/* ------------------------------- Catalog --------------------------------- */

const quantitySchema = z.coerce
  .number({ invalid_type_error: "Enter a quantity as a number." })
  .int("Quantities must be whole numbers.")
  .positive("Quantity must be at least 1.")
  .max(10_000_000, "That quantity is too large.");

export const quoteSchema = z.object({
  serviceSlug: z.string().trim().min(2).max(80),
  quantity: quantitySchema,
  couponCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9_-]*$/, "Coupon codes use letters, numbers, - and _ only.")
    .optional(),
  packageId: z.string().uuid().optional(),
});

export const createOrderSchema = quoteSchema.extend({
  targetUrl: z.string().trim().min(10, "Paste the public Instagram link.").max(500),
  audienceCountry: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, "Use a two-letter country code.")
    .transform((value) => value.toUpperCase())
    .optional(),
  brief: z.string().trim().max(2000, "Keep the brief under 2000 characters.").optional(),
  /** Client-generated once per checkout attempt; prevents duplicate orders on retry. */
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Missing idempotency key.")
    .max(100)
    .regex(/^[A-Za-z0-9:_-]+$/, "Invalid idempotency key."),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;

/* ------------------------------- Payments -------------------------------- */

export const mockAuthorizeSchema = z.object({
  orderPublicId: z.string().trim().min(3).max(32),
  outcome: z.enum(["success", "failure"]).default("success"),
});

export const razorpayVerifySchema = z.object({
  orderPublicId: z.string().trim().min(3).max(32),
  razorpay_order_id: z.string().trim().min(4).max(120),
  razorpay_payment_id: z.string().trim().min(4).max(120),
  razorpay_signature: z.string().trim().min(20).max(400),
});

/* -------------------------------- Support -------------------------------- */

export const ticketSchema = z.object({
  subject: z.string().trim().min(5, "Add a subject.").max(180),
  category: z
    .enum(["general", "order", "payment", "refund", "account", "reporting"])
    .default("general"),
  message: z.string().trim().min(10, "Describe the issue in a little more detail.").max(4000),
  orderPublicId: z.string().trim().max(32).optional(),
});

export const ticketReplySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  internal: z.boolean().optional(),
});

export const refundRequestSchema = z.object({
  reason: z.string().trim().min(10, "Tell us what went wrong.").max(1000),
});

/* --------------------------------- Admin --------------------------------- */

export const adminOrderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry_provider") }),
  z.object({ action: z.literal("route") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("note"), note: z.string().trim().min(2).max(2000) }),
  z.object({ action: z.literal("mark_in_progress") }),
  z.object({
    action: z.literal("record_delivery"),
    deliveredQuantity: z.coerce.number().int().min(0).max(10_000_000),
    latestCount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("force_status"),
    status: z.enum([
      "pending_payment",
      "paid",
      "pending_review",
      "pending_provider",
      "queued",
      "in_progress",
      "partially_completed",
      "completed",
      "failed",
      "cancellation_requested",
      "cancelled",
      "refund_pending",
      "partially_refunded",
      "refunded",
    ]),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({ action: z.literal("assign_provider"), providerId: z.string().uuid() }),
]);

export type AdminOrderAction = z.infer<typeof adminOrderActionSchema>;

export const adminRefundActionSchema = z.object({
  refundId: z.string().uuid(),
  action: z.enum(["approve", "reject", "retry"]),
  amountPaise: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, _ and - only.")
    .transform((value) => value.toUpperCase()),
  type: z.enum(["percent", "fixed"]),
  /** percent: whole percent (1-100); fixed: rupees. Converted server-side. */
  value: z.coerce.number().positive().max(1_000_000),
  description: z.string().trim().max(240).optional(),
  minOrderRupees: z.coerce.number().min(0).max(1_000_000).default(0),
  maxDiscountRupees: z.coerce.number().min(0).max(1_000_000).optional(),
  maxRedemptions: z.coerce.number().int().min(1).max(100_000).optional(),
  active: z.boolean().default(true),
});

export const serviceUpdateSchema = z.object({
  serviceId: z.string().uuid(),
  active: z.boolean().optional(),
  unitPriceRupees: z.coerce.number().min(0).max(1_000_000).optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  maxQuantity: z.coerce.number().int().min(1).optional(),
  requiresManualReview: z.boolean().optional(),
  estimatedDurationHours: z.coerce.number().int().min(1).max(2160).optional(),
});

export const providerUpdateSchema = z.object({
  providerId: z.string().uuid(),
  enabled: z.boolean().optional(),
  priority: z.coerce.number().int().min(1).max(999).optional(),
  reliabilityScore: z.coerce.number().int().min(0).max(100).optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  maxQuantity: z.coerce.number().int().min(1).optional(),
  costPerUnitPaise: z.coerce.number().int().min(0).optional(),
  fixedCostPaise: z.coerce.number().int().min(0).optional(),
  estimatedDurationHours: z.coerce.number().int().min(1).max(2160).optional(),
  credentials: z.record(z.string().max(500)).optional(),
  config: z.record(z.unknown()).optional(),
});
