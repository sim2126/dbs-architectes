const CHANNEL_TYPES = new Set(["public", "private", "direct"] as const);

export type ChannelCreateInput = {
  name: string;
  description: string | null;
  type: "public" | "private" | "direct";
  memberIds: string[];
};

export type ChannelCreateParseResult =
  | { ok: true; value: ChannelCreateInput }
  | { ok: false; error: string };

export function parseChannelCreateInput(body: unknown): ChannelCreateParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid channel payload" };
  }
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string") {
    return { ok: false, error: "Channel name is required" };
  }
  const name = input.name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name || name.length > 80) {
    return { ok: false, error: "Channel name must be between 1 and 80 characters" };
  }

  const description = input.description ?? null;
  if (description !== null && typeof description !== "string") {
    return { ok: false, error: "Channel description must be text" };
  }
  const trimmedDescription = typeof description === "string" ? description.trim() : null;
  if (trimmedDescription && trimmedDescription.length > 500) {
    return { ok: false, error: "Channel description is limited to 500 characters" };
  }

  const type = input.type ?? "public";
  if (typeof type !== "string" || !CHANNEL_TYPES.has(type as ChannelCreateInput["type"])) {
    return { ok: false, error: "Invalid channel type" };
  }

  const memberIds = input.memberIds ?? [];
  if (
    !Array.isArray(memberIds) ||
    memberIds.length > 100 ||
    memberIds.some((id) => typeof id !== "string" || !id || id.length > 200)
  ) {
    return { ok: false, error: "Invalid channel members" };
  }
  if (new Set(memberIds).size !== memberIds.length) {
    return { ok: false, error: "Channel members must be unique" };
  }

  return {
    ok: true,
    value: {
      name,
      description: trimmedDescription || null,
      type: type as ChannelCreateInput["type"],
      memberIds,
    },
  };
}
