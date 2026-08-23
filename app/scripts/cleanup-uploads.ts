import { prisma } from "../src/platform/db";
import {
  deleteStoredUpload,
  listStoredUploadsOlderThan,
} from "../src/platform/integrations/uploads";
import {
  fridayFileUrl,
  UPLOAD_RECEIPT_TTL_MS,
} from "../src/platform/integrations/upload-receipt";

const RECEIPT_IO_GRACE_MS = 30_000;
const apply = process.argv.includes("--apply");
const cutoff = new Date(Date.now() - UPLOAD_RECEIPT_TTL_MS - RECEIPT_IO_GRACE_MS);

async function main() {
  const keys = await listStoredUploadsOlderThan(cutoff, { limit: 5_000 });
  const urls = keys.map(fridayFileUrl);
  if (urls.length === 0) {
    console.log("Upload GC: no expired objects found.");
    return;
  }

  const [attachments, messages] = await Promise.all([
    prisma.aiChatAttachment.findMany({
      where: { url: { in: urls } },
      select: { url: true },
    }),
    prisma.message.findMany({
      where: { fileUrl: { in: urls } },
      select: { fileUrl: true },
    }),
  ]);
  const referenced = new Set<string>([
    ...attachments.map((attachment) => attachment.url),
    ...messages.flatMap((message) => (message.fileUrl ? [message.fileUrl] : [])),
  ]);
  const orphanKeys = keys.filter((key) => !referenced.has(fridayFileUrl(key)));

  if (apply) {
    for (const key of orphanKeys) await deleteStoredUpload(key);
  }

  console.log(
    `Upload GC: ${keys.length} expired, ${referenced.size} referenced, ` +
      `${orphanKeys.length} ${apply ? "deleted" : "would be deleted (dry run)"}.`,
  );
}

main()
  .catch((error) => {
    console.error("Upload GC failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
