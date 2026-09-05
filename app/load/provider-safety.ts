/** Fail closed before destructive fixtures or agent requests can reach a model. */
export function assertNoProvider(status: number, body: unknown): void {
  if (status !== 200 || !body || typeof body !== "object" ||
      !("providerConfigured" in body) || body.providerConfigured !== false) {
    throw new Error("Concurrency probes require HTTP 200 from /api/ai-status explicitly reporting providerConfigured=false. Disable the server's AI provider before running this suite.");
  }
}
