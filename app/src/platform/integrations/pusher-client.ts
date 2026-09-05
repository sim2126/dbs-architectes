"use client";

import PusherClient from "pusher-js";
import { localPusherEndpoint } from "./pusher-local";

let instance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!instance && typeof window !== "undefined") {
    const local = localPusherEndpoint(process.env.NEXT_PUBLIC_PUSHER_HOST, process.env.NEXT_PUBLIC_PUSHER_PORT);
    instance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      ...(local ? {
        wsHost: local.host,
        wsPort: local.port,
        forceTLS: false,
        enabledTransports: ["ws" as const],
        disableStats: true,
      } : {}),
      authEndpoint: "/api/chat/pusher/auth",
      auth: {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    });
  }
  return instance!;
}

export function disconnectPusher() {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
