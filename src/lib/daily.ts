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
      enable_chat: true,
      enable_whiteboard: true,
      enable_recording: "cloud",
      enable_transcription_storage: true,
      transcription_presets: ["default"],
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

// ── Recordings & transcripts ──────────────────────────────
// Fetched after a call ends to feed the summarizer.

export interface DailyRecording {
  id: string;
  room_name: string;
  status: string;
  start_ts: number;
  duration: number;
  download_link?: string;
}

export async function getRoomRecordings(roomName: string): Promise<DailyRecording[]> {
  const res = await fetch(`${DAILY_API_URL}/recordings?room_name=${roomName}&limit=10`, {
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data ?? [];
}

export async function getRecordingAccessLink(recordingId: string): Promise<string | null> {
  const res = await fetch(`${DAILY_API_URL}/recordings/${recordingId}/access-link`, {
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.download_link ?? null;
}

export interface DailyTranscript {
  transcriptId: string;
  status: string;
  mtgSessionId?: string;
  roomName?: string;
  duration?: number;
  outParams?: { s3config?: { bucket?: string; key?: string } };
}

export async function getRoomTranscripts(roomName: string): Promise<DailyTranscript[]> {
  const res = await fetch(`${DAILY_API_URL}/transcript?room_name=${roomName}&limit=10`, {
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data ?? [];
}

export async function getTranscriptAccessLink(transcriptId: string): Promise<string | null> {
  const res = await fetch(`${DAILY_API_URL}/transcript/${transcriptId}/access-link`, {
    headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.download_link ?? data?.accessLink ?? null;
}

export async function fetchTranscriptText(transcriptId: string): Promise<string | null> {
  const link = await getTranscriptAccessLink(transcriptId);
  if (!link) return null;
  try {
    const res = await fetch(link);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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
