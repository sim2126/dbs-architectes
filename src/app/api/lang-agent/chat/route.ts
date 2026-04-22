import { auth } from "@/lib/auth";
import { SignJWT } from "jose";

// Proxies /dashboard/ai/lang chat requests to the FastAPI backend's
// synchronous agent endpoint. The Next.js session is translated into a
// short-lived HS256 JWT that FastAPI validates with the same SECRET_KEY.

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
const FASTAPI_SECRET = process.env.FASTAPI_SECRET_KEY || "";

async function mintFastApiToken(userId: string, email: string, role: string): Promise<string> {
  if (!FASTAPI_SECRET) throw new Error("FASTAPI_SECRET_KEY is not configured");
  const key = new TextEncoder().encode(FASTAPI_SECRET);
  return await new SignJWT({ sub: userId, email, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    message?: string;
    project_id?: string;
    project_context?: Record<string, unknown>;
    thread_id?: string;
  };
  if (!body.message || typeof body.message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let token: string;
  try {
    token = await mintFastApiToken(
      session.user.id,
      session.user.email ?? "unknown@dbsarc.com",
      session.user.role ?? "viewer",
    );
  } catch (e) {
    return Response.json(
      { error: "Demo agent backend is not configured. Set FASTAPI_SECRET_KEY in .env." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${FASTAPI_URL}/api/agents/chat/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error:
          `Could not reach the LangGraph backend at ${FASTAPI_URL}. ` +
          "Start it with: cd apps/api && uv run uvicorn app.main:app --reload.",
        detail: msg,
      },
      { status: 502 },
    );
  }
}
