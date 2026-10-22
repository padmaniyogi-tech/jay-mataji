import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import path from "node:path";
import { db, getDbAsync, type Executor } from "@/lib/db";
import { emailTemplates } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatPaise } from "@/lib/money";

/**
 * Email delivery with a pluggable transport:
 *  - `console` (default in demo): writes JSONL to .data/mail/outbox.jsonl so the flow is
 *    inspectable without an email provider. Never pretends to deliver mail.
 *  - `smtp`: any provider (Resend/SES/Postmark SMTP) via nodemailer.
 *
 * Templates live in the `email_templates` table and can be edited by admins; the defaults
 * below are the fallback. Placeholders are {{key}} and are HTML-escaped on render.
 */

export type EmailTemplateKey =
  | "verify_email"
  | "reset_password"
  | "order_created"
  | "order_paid"
  | "order_started"
  | "order_progress"
  | "order_completed"
  | "order_failed"
  | "order_refunded"
  | "order_needs_review"
  | "refund_requested"
  | "refund_processed"
  | "payment_failed"
  | "admin_no_provider"
  | "ticket_reply";

type Template = { subject: string; body: string };

export const DEFAULT_TEMPLATES: Record<EmailTemplateKey, Template> = {
  verify_email: {
    subject: "Verify your {{appName}} email",
    body: `<p>Hi {{name}},</p><p>Confirm your email to start ordering campaigns.</p><p><a href="{{verifyUrl}}">Verify my email</a></p><p>This link expires in 24 hours. If you didn't create an account, ignore this email.</p>`,
  },
  reset_password: {
    subject: "Reset your {{appName}} password",
    body: `<p>Hi {{name}},</p><p>Use the link below to choose a new password. It expires in 60 minutes.</p><p><a href="{{resetUrl}}">Reset password</a></p><p>If you didn't request this, no action is needed.</p>`,
  },
  order_created: {
    subject: "Order {{orderId}} created — complete payment",
    body: `<p>Hi {{name}},</p><p>Your order <strong>{{orderId}}</strong> for {{serviceName}} ({{quantity}} {{unitLabel}}) is awaiting payment of <strong>{{total}}</strong>.</p><p><a href="{{orderUrl}}">Open order</a></p>`,
  },
  order_paid: {
    subject: "Payment received for order {{orderId}}",
    body: `<p>Hi {{name}},</p><p>We verified your payment of {{total}}. Your campaign is being routed to an eligible delivery partner now.</p><p><a href="{{orderUrl}}">Track order</a></p>`,
  },
  order_started: {
    subject: "Your campaign {{orderId}} has started",
    body: `<p>Hi {{name}},</p><p>Order <strong>{{orderId}}</strong> ({{serviceName}}) is now in progress{{providerName}}.</p><p>Estimated duration: {{duration}}. You can follow progress on your order page.</p><p><a href="{{orderUrl}}">View progress</a></p>`,
  },
  order_progress: {
    subject: "Progress update for {{orderId}}",
    body: `<p>Hi {{name}},</p><p>{{message}}</p><p><a href="{{orderUrl}}">View order</a></p>`,
  },
  order_completed: {
    subject: "Campaign {{orderId}} completed",
    body: `<p>Hi {{name}},</p><p>{{serviceName}} campaign <strong>{{orderId}}</strong> is complete.</p><p>Requested target: {{quantity}}. Verified/reported result: {{result}}.</p><p><a href="{{reportUrl}}">Open the campaign report</a></p>`,
  },
  order_failed: {
    subject: "Action needed for order {{orderId}}",
    body: `<p>Hi {{name}},</p><p>Campaign <strong>{{orderId}}</strong> could not be completed: {{reason}}</p><p>Our finance team has been notified and will review eligibility for a refund within {{refundWindow}}.</p><p><a href="{{orderUrl}}">View order</a></p>`,
  },
  order_refunded: {
    subject: "Refund processed for {{orderId}}",
    body: `<p>Hi {{name}},</p><p>A refund of {{amount}} has been processed for order <strong>{{orderId}}</strong>. Bank timelines vary; the gateway reference is {{refundRef}}.</p>`,
  },
  order_needs_review: {
    subject: "Order {{orderId}} needs a quick review",
    body: `<p>Hi {{name}},</p><p>Before we can route <strong>{{orderId}}</strong>, our team needs to review the campaign brief. We're on it and will update you here.</p><p><a href="{{orderUrl}}">View order</a></p>`,
  },
  refund_requested: {
    subject: "Refund request received for {{orderId}}",
    body: `<p>Hi {{name}},</p><p>We received your refund request for <strong>{{orderId}}</strong> ({{amount}}). Finance will review it and update the order status.</p>`,
  },
  refund_processed: {
    subject: "Refund update for {{orderId}}",
    body: `<p>Hi {{name}},</p><p>{{message}}</p><p>Amount: {{amount}}. Reference: {{refundRef}}.</p>`,
  },
  payment_failed: {
    subject: "Payment could not be completed for {{orderId}}",
    body: `<p>Hi {{name}},</p><p>Your payment attempt for <strong>{{orderId}}</strong> was not completed. No money was captured. You can retry securely from the order page.</p><p><a href="{{orderUrl}}">Retry payment</a></p>`,
  },
  admin_no_provider: {
    subject: "[Amplifi] No eligible provider for {{orderId}}",
    body: `<p>Order <strong>{{orderId}}</strong> ({{serviceName}}, {{quantity}}) is in <em>pending provider</em>.</p><p>Reason: {{reason}}</p><p><a href="{{adminUrl}}">Review in admin</a></p>`,
  },
  ticket_reply: {
    subject: "Reply to your support request {{ticketId}}",
    body: `<p>Hi {{name}},</p><p>{{message}}</p><p><a href="{{ticketUrl}}">Open the conversation</a></p>`,
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplateString(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return escapeHtml(value);
  });
}

const LAYOUT = (body: string) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f4ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17141f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5dfd4;border-radius:16px;padding:28px">
    <div style="font-weight:700;font-size:18px;margin-bottom:16px">Amplifi</div>
    <div style="font-size:15px;line-height:1.6">${body}</div>
    <hr style="border:none;border-top:1px solid #e5dfd4;margin:24px 0" />
    <p style="font-size:12px;color:#787287;margin:0">
      Amplifi is a campaign ordering platform. Follower, view and like counts are never guaranteed.
      Results are reported only when a provider or verified report supports them.
    </p>
  </div>
</body></html>`;

export async function renderTemplate(
  key: EmailTemplateKey,
  data: Record<string, unknown>,
  executor: Executor = db,
): Promise<{ subject: string; html: string; text: string }> {
  const base = DEFAULT_TEMPLATES[key];
  if (!base) throw new Error(`Unknown email template: ${key}`);
  let subject = base.subject;
  let body = base.body;

  try {
    await getDbAsync();
    const rows = await executor
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.key, key))
      .limit(1);
    const custom = rows[0];
    if (custom && custom.enabled) {
      subject = custom.subject;
      body = custom.body;
    }
  } catch {
    // Table may not exist yet during first boot — fall back to defaults.
  }

  const payload = {
    appName: getEnv().APP_NAME,
    appUrl: getEnv().APP_URL,
    ...data,
  };
  const html = LAYOUT(renderTemplateString(body, payload));
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return { subject: renderTemplateString(subject, payload), html, text };
}

export type CapturedEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  template?: string;
  createdAt: string;
  transport: "console" | "smtp";
  delivered: boolean;
};

let smtpTransport: import("nodemailer").Transporter | null = null;

async function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  const env = getEnv();
  const nodemailer = await import("nodemailer");
  smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return smtpTransport;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  template?: string;
}): Promise<{ delivered: boolean; transport: "console" | "smtp" }> {
  const env = getEnv();
  const transport = env.EMAIL_PROVIDER;

  if (transport === "smtp") {
    if (!env.SMTP_HOST) throw new Error("EMAIL_PROVIDER=smtp but SMTP_HOST is not set.");
    const tx = await getSmtpTransport();
    await tx.sendMail({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    logger.info("email_sent", { to: maskEmail(input.to), template: input.template, transport });
    return { delivered: true, transport };
  }

  const record: CapturedEmail = {
    to: input.to,
    from: env.EMAIL_FROM,
    subject: input.subject,
    text: input.text.slice(0, 4000),
    template: input.template,
    createdAt: new Date().toISOString(),
    transport: "console",
    delivered: false,
  };
  const dir = path.resolve(process.cwd(), env.EMAIL_OUTBOX_DIR);
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "outbox.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  logger.info("email_captured", { to: maskEmail(input.to), template: input.template, subject: input.subject });
  return { delivered: false, transport: "console" };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Admin-only helper for the dev mailbox page. */
export async function listCapturedEmails(limit = 50): Promise<CapturedEmail[]> {
  const env = getEnv();
  const file = path.resolve(process.cwd(), env.EMAIL_OUTBOX_DIR, "outbox.jsonl");
  try {
    await stat(file);
    const contents = await readFile(file, "utf8");
    return contents
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as CapturedEmail);
  } catch {
    return [];
  }
}

export function formatMoneyForEmail(paise: number): string {
  return formatPaise(paise);
}
