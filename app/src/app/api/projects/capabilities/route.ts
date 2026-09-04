/**
 * GET /api/projects/capabilities — what the caller may do to projects in
 * general, as opposed to a particular one.
 *
 * The board hides affordances it must not offer. Per-project rights ride
 * along with each row from the list endpoint, but creating a project belongs
 * to no row, so it is asked for here. Answering server-side keeps the rules
 * in authorize() alone — including a per-user grant, which a role check in
 * the browser would miss.
 */

import { authorize, loadSubject } from "@/platform/authz";

export async function GET() {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({
    create: authorize(subject, "project:create", null).allow,
  });
}
