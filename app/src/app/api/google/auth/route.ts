import { auth } from "@/platform/auth";
import { getAuthUrl } from "@/platform/integrations/google-calendar";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = getAuthUrl();
  return Response.redirect(url);
}
