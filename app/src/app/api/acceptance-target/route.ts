import { acceptanceTarget } from "../../../../load/acceptance-target.mjs";

export const dynamic = "force-dynamic";

/** Test runners verify the serving process before sending fixture credentials. */
export function GET() {
  const target = acceptanceTarget(process.env);
  const headers = { "Cache-Control": "no-store" };
  if (!target) return Response.json({ error: "Not found" }, { status: 404, headers });
  return Response.json({ target }, { headers });
}
