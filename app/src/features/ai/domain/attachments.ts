/**
 * Attachment types DBS AI accepts.
 *
 * Deliberately narrow. Each entry here is a promise that the ingestion
 * pipeline can actually read it — accepting a .dwg today would mean storing
 * something the agent can never use, which is worse than refusing it, because
 * the user believes they have supplied context.
 *
 * What the pipeline reads:
 *   PDF          — embedded text layer
 *   images       — a vision model, which reads labels and describes the sheet
 *   CSV / Excel  — tabular parse, sheet names preserved
 *   .docx        — document text
 *
 * Note the absence of legacy .doc (application/msword). It is a binary
 * OLE container, not an OOXML zip, and the .docx reader cannot open it — so
 * accepting it would break the promise above.
 *
 * Pure — importable by the route, the client and a test alike.
 */

export type IngestKind = "pdf" | "image" | "table" | "doc";

/** MIME type to the kind of extraction it will need. */
export const INGESTIBLE_TYPES: ReadonlyArray<{ mime: string; kind: IngestKind }> = [
  { mime: "application/pdf", kind: "pdf" },

  { mime: "image/png", kind: "image" },
  { mime: "image/jpeg", kind: "image" },
  { mime: "image/webp", kind: "image" },
  { mime: "image/gif", kind: "image" },
  { mime: "image/tiff", kind: "image" },
  { mime: "image/bmp", kind: "image" },
  { mime: "image/heic", kind: "image" },
  { mime: "image/heif", kind: "image" },
  { mime: "image/svg+xml", kind: "image" },

  { mime: "text/csv", kind: "table" },
  { mime: "application/csv", kind: "table" },
  { mime: "application/vnd.ms-excel", kind: "table" },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "table",
  },

  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "doc",
  },
];

/** The `accept` attribute for a file input. */
export const ACCEPT_ATTRIBUTE = INGESTIBLE_TYPES.map((t) => t.mime).join(",");

export function isIngestibleType(mime: string): boolean {
  const normalised = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return INGESTIBLE_TYPES.some((t) => t.mime === normalised);
}

export function kindForType(mime: string): IngestKind | null {
  const normalised = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return INGESTIBLE_TYPES.find((t) => t.mime === normalised)?.kind ?? null;
}

/**
 * Re-exported so existing callers keep one import.
 *
 * The definition moved to ui/ because the file previewer needs it and ui/ may
 * not import features/. Formatting a byte count was never AI-domain logic.
 */
export { formatSize } from "@/ui/utils";

export type AttachmentState = "stored" | "ready" | "failed";

/**
 * What the user is told about a file.
 *
 * "stored" is the honest default: the file is safe and downloadable, and the
 * assistant cannot read it yet. Saying anything warmer would imply the
 * content is available for grounding when it is not.
 */
export function attachmentState(a: {
  ingestedAt: string | null;
  ingestError: string | null;
}): AttachmentState {
  if (a.ingestError) return "failed";
  if (a.ingestedAt) return "ready";
  return "stored";
}

export const ATTACHMENT_STATE_LABEL: Record<AttachmentState, string> = {
  stored: "Stored — not yet readable by the assistant",
  ready: "Readable by the assistant",
  failed: "Could not be read",
};
