const DAILY_API_URL = "https://api.daily.co/v1";
const DAILY_API_KEY = process.env.DAILY_API_KEY!;

export interface DailyRoom {
  id: string;
  name: string;
  url: string;
  created_at: string;
  config: Record<string, unknown>;
}

export async function createDailyRoom(options?: {
  name?: string;
  expiryMinutes?: number;
  maxParticipants?: number;
}): Promise<DailyRoom> {
  const expiry = options?.expiryMinutes ?? 120;
  const body: Record<string, unknown> = {
    privacy: "private",
    properties: {
      exp: Math.floor(Date.now() / 1000) + expiry * 60,
      max_participants: options?.maxParticipants ?? 20,
      enable_screenshare: true,
      enable_recording: "cloud",
      start_video_off: false,
      start_audio_off: false,
      owner_only_broadcast: false,
    },
  };
  if (options?.name) body.name = options.name;

  const res = await fetch(`${DAILY_API_URL}/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily.co room creation failed: ${err}`);
  }

  return res.json();
}

export async function deleteDailyRoom(roomName: string): Promise<void> {
  await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });
}

export async function createMeetingToken(
  roomName: string,
  userName: string,
  isOwner = false
): Promise<string> {
  const res = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: isOwner,
        exp: Math.floor(Date.now() / 1000) + 7200,
      },
    }),
  });

  if (!res.ok) throw new Error("Failed to create meeting token");
  const data = await res.json();
  return data.token;
}
