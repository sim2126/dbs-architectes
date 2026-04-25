// Server-side feature flag for the AI features (DBS GPT, translate,
// meeting summariser). Flip on by setting AI_DISABLED=true in the
// Vercel project env vars. Flip off by removing the var (or setting it
// to anything other than "true") and triggering a redeploy.
//
// While disabled the AI endpoints return a 503 with a fixed friendly
// payload so the UI can show a "scheduled return" state instead of a
// cryptic OpenAI error. Used during cost-control windows where the
// OPENAI_API_KEY has been removed from Vercel.

export const AI_DISABLED_MESSAGE =
  "Aria is taking a short planned break. She'll be back online for the DBS technical review on 27 April.";

export const AI_DISABLED_ETA = "27 April 2026";

export function isAiDisabled(): boolean {
  return process.env.AI_DISABLED === "true";
}

/**
 * Standard 503 payload returned by every AI endpoint when the flag is on.
 * Frontend code can detect this shape and render the corresponding UI.
 */
export function aiDisabledResponse() {
  return Response.json(
    {
      error: "ai_disabled",
      message: AI_DISABLED_MESSAGE,
      eta: AI_DISABLED_ETA,
    },
    { status: 503 },
  );
}
