export type MessageCursor = {
  createdAt: Date;
  id: string;
};

const SEPARATOR = "|";

/**
 * A deterministic cursor for the `(createdAt DESC, id DESC)` message order.
 * The id tie-breaker prevents messages created in the same millisecond from
 * being skipped between pages.
 */
export function encodeMessageCursor(cursor: MessageCursor): string {
  return `${cursor.createdAt.toISOString()}${SEPARATOR}${cursor.id}`;
}

export function decodeMessageCursor(value: string | null): MessageCursor | null {
  if (!value) return null;
  const separatorIndex = value.lastIndexOf(SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return null;

  const createdAt = new Date(value.slice(0, separatorIndex));
  const id = value.slice(separatorIndex + 1);
  if (Number.isNaN(createdAt.getTime()) || !id || id.length > 200) return null;
  return { createdAt, id };
}
