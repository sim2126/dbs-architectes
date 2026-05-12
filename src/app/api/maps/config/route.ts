import { auth } from "@/platform/auth";

// Returns the Google Maps API key from server env so the browser client
// does not depend on NEXT_PUBLIC_* being inlined at build time.
// Accepts either GOOGLE_MAPS_API_KEY (preferred) or the legacy NEXT_PUBLIC_* variant.
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "";

  return Response.json({ apiKey });
}
