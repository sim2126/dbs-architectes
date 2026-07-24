import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "./next.config";

async function configuredRedirects() {
  if (!nextConfig.redirects) throw new Error("Next.js redirects are not configured");
  return nextConfig.redirects();
}

test("Settings Members permanently redirects to Users", async () => {
  const redirects = await configuredRedirects();
  assert.deepEqual(
    redirects.find((redirect) => redirect.source === "/dashboard/settings/members"),
    {
      source: "/dashboard/settings/members",
      destination: "/dashboard/users",
      permanent: true,
    },
  );
});

test("Saved Insights permanently redirects to DBS GPT", async () => {
  const redirects = await configuredRedirects();
  assert.deepEqual(
    redirects.find((redirect) => redirect.source === "/dashboard/ai/saved"),
    {
      source: "/dashboard/ai/saved",
      destination: "/dashboard/ai/gpt",
      permanent: true,
    },
  );
});
