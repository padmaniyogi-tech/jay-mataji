import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { profileSchema } from "@/lib/validation";
import { updateProfile } from "@/lib/auth/service";

export const PATCH = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await readJson(req, profileSchema);
  await updateProfile(user, {
    name: body.name ?? user.name,
    phone: body.phone ?? undefined,
    company: body.company ?? undefined,
    marketingOptIn: body.marketingOptIn ?? user.marketingOptIn,
  });
  return jsonOk({ updated: true });
});
