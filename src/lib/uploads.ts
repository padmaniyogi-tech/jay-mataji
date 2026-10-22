import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, getDbAsync, type Executor } from "@/lib/db";
import { uploads, type Upload } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Secure uploads: allow-listed image/PDF types, magic-byte sniffing, size caps, random
 * storage keys (no user-supplied paths), and owner-checked downloads.
 */
const ALLOWED: Record<string, { ext: string; magic: number[][] }> = {
  "image/png": { ext: "png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: "jpg", magic: [[0xff, 0xd8, 0xff]] },
  "image/webp": { ext: "webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  "application/pdf": { ext: "pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
};

function matchesMagic(bytes: Uint8Array, magic: number[][]): boolean {
  return magic.some((signature) => signature.every((byte, index) => bytes[index] === byte));
}

export async function saveUpload(input: {
  userId: string;
  orderId?: string | null;
  file: File;
  executor?: Executor;
}): Promise<Upload> {
  const env = getEnv();
  await getDbAsync();
  const type = input.file.type;
  const spec = ALLOWED[type];
  if (!spec) throw new ValidationError("Only PNG, JPEG, WebP and PDF files are accepted.");
  if (input.file.size <= 0) throw new ValidationError("The file is empty.");
  if (input.file.size > env.MAX_UPLOAD_BYTES) {
    throw new ValidationError(`Files must be under ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (!matchesMagic(buffer, spec.magic)) {
    // Extension/type lying: refuse.
    throw new ValidationError("The file content does not match its declared type.");
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const key = `${input.userId}/${randomUUID()}.${spec.ext}`;
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR, input.userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key.split("/")[1]}`), buffer, { mode: 0o600 });

  const executor = input.executor ?? db;
  const inserted = await executor
    .insert(uploads)
    .values({
      userId: input.userId,
      orderId: input.orderId ?? null,
      filename: input.file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200),
      mimeType: type,
      sizeBytes: input.file.size,
      storageKey: key,
      checksum,
    })
    .returning();
  return inserted[0]!;
}

export async function readUpload(id: string, viewer: { id: string; role: string }): Promise<{ upload: Upload; data: Buffer }> {
  await getDbAsync();
  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  const upload = rows[0];
  if (!upload) throw new NotFoundError("File not found.");
  const staff = viewer.role === "admin" || viewer.role === "support" || viewer.role === "finance";
  if (upload.userId !== viewer.id && !staff) throw new ForbiddenError();
  const env = getEnv();
  const filePath = path.resolve(process.cwd(), env.UPLOAD_DIR, upload.storageKey);
  // Defence in depth: never serve outside the uploads directory.
  const root = path.resolve(process.cwd(), env.UPLOAD_DIR);
  if (!filePath.startsWith(root + path.sep)) throw new ForbiddenError();
  try {
    const data = await readFile(filePath);
    return { upload, data };
  } catch {
    throw new NotFoundError("File content is no longer available.");
  }
}

export async function attachUploadToOrder(uploadId: string, orderId: string, userId: string): Promise<void> {
  await getDbAsync();
  const updated = await db
    .update(uploads)
    .set({ orderId })
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)))
    .returning({ id: uploads.id });
  if (!updated[0]) throw new AppError("Upload not found.", { status: 404, code: "upload_not_found" });
}
