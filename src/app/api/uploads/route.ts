import { assertSameOrigin, jsonOk, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/uploads";
import { ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`upload:${user.id}`, RATE_LIMITS.upload.limit, RATE_LIMITS.upload.windowSeconds);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Attach a file using the 'file' field.");
  const upload = await saveUpload({ userId: user.id, file });
  await recordAudit(db, {
    action: "upload.created",
    entityType: "upload",
    entityId: upload.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    metadata: { mimeType: upload.mimeType, sizeBytes: upload.sizeBytes },
  });
  return jsonOk({ id: upload.id, filename: upload.filename, sizeBytes: upload.sizeBytes });
});
