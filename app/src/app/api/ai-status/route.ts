import { auth } from "@/platform/auth";
import { AI_DISABLED_ETA, AI_DISABLED_MESSAGE, isAiDisabled } from "@/features/ai/domain/ai-flags";
import { AI_UNAVAILABLE_MESSAGE, aiProviderConfigured } from "@/platform/ai/availability";

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

  // Same check the agent route makes before spending quota. Reporting it here
  // is what lets the page show the unavailable state up front instead of a
  // working-looking composer whose every submit returns 503.
  if (!aiProviderConfigured()) {
    return Response.json({
      enabled: false,
      providerConfigured: false,
      message: AI_UNAVAILABLE_MESSAGE,
    });
  }

  return Response.json({ enabled: true, providerConfigured: true });
}
