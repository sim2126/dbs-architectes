import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { getOAuth2Client } from "@/platform/integrations/google-calendar";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.redirect(new URL("/login", request.url));

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return Response.redirect(new URL("/dashboard/agenda?gcal=error", request.url));
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  await prisma.googleCalendarToken.upsert({
    where: { userId: session.user.id },
    update: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    create: {
      userId: session.user.id,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  return Response.redirect(new URL("/dashboard/agenda?gcal=connected", request.url));
}
