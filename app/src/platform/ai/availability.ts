/**
 * Is there an AI provider to talk to at all?
 *
 * Separate from the manual AI_DISABLED switch in features/ai/domain/ai-flags.
 * That switch is a deliberate, announced pause with an ETA. This is the
 * unannounced case — the key was rotated, the secret failed to deploy, the
 * environment is a staging box that never had one. The platform is required
 * to keep working end-to-end when the provider is dark, and "working" means a
 * clear 503 before any quota is spent, not a 500 from inside the SDK
 * constructor after the caller has been charged for the attempt.
 *
 * Checked by the agent route (fail closed before quota) and by /api/ai-status
 * (so the page shows the unavailable state instead of a composer that cannot
 * work). Server-only: it reads process.env.
 */
export function aiProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI Assistant is unavailable — no provider is configured for this deployment.";

export function aiUnavailableResponse(): Response {
  return Response.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
}
