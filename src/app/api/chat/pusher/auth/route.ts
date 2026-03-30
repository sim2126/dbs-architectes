import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id")!;
  const channel = params.get("channel_name")!;

  if (channel.startsWith("presence-")) {
    const authResponse = pusherServer.authorizeChannel(socketId, channel, {
      user_id: session.user.id,
      user_info: {
        name: session.user.name,
        initials: (session.user as { initials?: string }).initials ?? session.user.name?.slice(0, 2).toUpperCase(),
        image: session.user.image,
      },
    });
    return Response.json(authResponse);
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channel);
  return Response.json(authResponse);
}
