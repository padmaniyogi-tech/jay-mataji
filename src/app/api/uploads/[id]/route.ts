import { jsonError, NO_STORE_HEADERS } from "@/lib/http";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { readUpload } from "@/lib/uploads";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await ensureDatabaseReady();
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to download this file.", { status: 401 });
    const { id } = await context.params;
    const { upload, data } = await readUpload(id, user);
    return new Response(new Uint8Array(data), {
      headers: {
        ...NO_STORE_HEADERS,
        "content-type": upload.mimeType,
        "content-length": String(upload.sizeBytes),
        "content-disposition": `inline; filename="${encodeURIComponent(upload.filename)}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return jsonError(err.message, { status: err.status });
    return jsonError("File unavailable.", { status: 404 });
  }
}
