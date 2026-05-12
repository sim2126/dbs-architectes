"use client";

import PusherClient from "pusher-js";

let instance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!instance && typeof window !== "undefined") {
    instance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
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
