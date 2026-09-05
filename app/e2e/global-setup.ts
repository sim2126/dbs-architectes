import { request, type FullConfig } from "@playwright/test";
import { assertLoadTargetIdentifier, assertLocalBaseUrl, assertServerTarget } from "../load/target-safety.mjs";

/** Runs even with --no-deps, before stored sessions or test writes are used. */
export default async function verifyAcceptanceTarget(config: FullConfig) {
  const expected = assertLoadTargetIdentifier(process.env.FRIDAY_LOAD_TARGET);
  const baseURL = assertLocalBaseUrl(config.projects[0].use.baseURL);
  const client = await request.newContext();
  try {
    const response = await client.get(`${baseURL}/api/acceptance-target`, { maxRedirects: 0 });
    if (response.status() !== 200) throw new Error("The server must attest its local database before browser tests may run.");
    assertServerTarget(await response.json(), expected);
  } finally {
    await client.dispose();
  }
}
