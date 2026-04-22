import { auth } from "@/lib/auth";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// Lightweight liveness probe for the LangGraph backend. Used by the demo
// page to render a green/red dot before the user types anything.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const upstream = await fetch(`${FASTAPI_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!upstream.ok) {
      return Response.json({ ok: false, status: upstream.status }, { status: 200 });
    }
    const data = (await upstream.json()) as { status?: string; version?: string };
    return Response.json({ ok: true, version: data.version ?? "unknown" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}
