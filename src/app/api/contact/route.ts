import { z } from "zod";
import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPlatformSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { emailSchema } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  message: z.string().trim().min(10).max(4000),
});

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  await enforceRateLimit(`contact:${ip}`, 5, 60 * 60);

  const body = await readJson(req, schema);
  const settings = await getPlatformSettings();

  await sendEmail({
    to: settings.supportEmail,
    subject: `Website enquiry from ${body.name}`,
    html: `<p><strong>${body.name}</strong> &lt;${body.email}&gt; wrote:</p><p>${body.message.replace(/</g, "&lt;")}</p>`,
    text: `${body.name} <${body.email}>\n\n${body.message}`,
    template: "contact",
  });
  await recordAudit(db, { action: "contact.message", entityType: "contact", metadata: { ip }, actorEmail: body.email });

  return jsonOk({ received: true });
});
