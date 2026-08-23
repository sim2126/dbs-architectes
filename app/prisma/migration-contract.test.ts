import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const prismaDir = path.resolve(process.cwd(), "prisma");

async function readPrismaFile(relativePath: string) {
  return readFile(path.join(prismaDir, relativePath), "utf8");
}

test("project discussions and AI uploads have database uniqueness contracts", async () => {
  const schema = await readPrismaFile("schema.prisma");
  const channel = schema.match(/model Channel \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const attachment = schema.match(/model AiChatAttachment \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(channel, /@@unique\(\[projectId, type\]\)/);
  assert.match(attachment, /@@unique\(\[userId, url\]\)/);
});

test("the release migration preserves duplicate project-channel data before enforcing uniqueness", async () => {
  const migration = await readPrismaFile(
    "migrations/20260823000000_add_external_users_ai_attachments/migration.sql",
  );

  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /UPDATE "Message" AS message\s+SET "channelId" = merge\."keeperId"/);
  assert.match(migration, /UPDATE "ChannelMember" AS member\s+SET "channelId" = merge\."keeperId"/);
  assert.match(migration, /CREATE UNIQUE INDEX "Channel_projectId_type_key"/);
  assert.match(migration, /CREATE UNIQUE INDEX "AiChatAttachment_userId_url_key"/);
  assert.match(migration, /CREATE TABLE "AiRequestEvent"/);
  assert.match(migration, /CREATE TABLE "AiAgentLease"/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("legacy invitation backfill rejects malformed and multi-at addresses", async () => {
  const migration = await readPrismaFile(
    "migrations/20260823000000_add_external_users_ai_attachments/migration.sql",
  );

  assert.match(migration, /BTRIM\("email"\) ~ '\[\[:space:\]\]'/);
  assert.match(migration, /BTRIM\("email"\) !~ '\^\[\^@\]\+@\[\^@\]\+\$'/);
  assert.match(migration, /LOWER\(SPLIT_PART\(BTRIM\("email"\), '@', 2\)\) <> 'dbsarc\.com'/);
});
