import { auth } from "@/platform/auth";
import { AI_DISABLED_ETA, AI_DISABLED_MESSAGE, isAiDisabled } from "@/features/ai/domain/ai-flags";

// Public-to-signed-in-users endpoint reporting whether the AI surfaces
// are currently active. The DBS AI page polls this on mount so it can
// render the friendly "scheduled return" state without trying to fire
// /api/agent and waiting for it to fail.
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (isAiDisabled()) {
    return Response.json({
      enabled: false,
      message: AI_DISABLED_MESSAGE,
      eta: AI_DISABLED_ETA,
    });
  }

  return Response.json({ enabled: true });
}
