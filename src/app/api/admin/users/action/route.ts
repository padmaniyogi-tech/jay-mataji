import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { updateUser } from "@/lib/admin/service";
import { ForbiddenError } from "@/lib/errors";

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["customer", "support", "finance", "admin"]).optional(),
  suspended: z.boolean().optional(),
});

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Administrator role required.");
  const body = await readJson(req, schema);
  await updateUser({ actor: user, userId: body.userId, role: body.role, suspended: body.suspended });
  return jsonOk({ message: "User updated." });
});
