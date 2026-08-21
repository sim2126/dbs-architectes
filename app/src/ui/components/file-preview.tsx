"use client";

import { Download, ExternalLink, FileText, X } from "lucide-react";
import { Dialog, DialogContent } from "@/ui/components/dialog";
import { cn, formatSize } from "@/ui/utils";

/**
 * How a file is rendered, which is a different question from how it is read.
 *
 * The ingestion pipeline classifies types by which extractor they need
 * (features/ai/domain/attachments). This classifies by what a browser can
 * display. The two overlap today but are not the same concern, and this
 * module lives in ui/ precisely so both chat and DBS AI can use it — ui/ may
 * not import features/, so it cannot borrow the ingest vocabulary.
 *
 * attachments.test.ts asserts every ingestible type has a path here, so
 * adding one to the accepted set without teaching the previewer about it
 * fails at test time rather than showing a blank frame in production.
 */
export type PreviewKind = "pdf" | "image" | "table" | "doc";

const PREVIEW_TYPES: Readonly<Record<string, PreviewKind>> = {
  "application/pdf": "pdf",

  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/tiff": "image",
  "image/bmp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "image/svg+xml": "image",

  "text/csv": "table",
  "application/csv": "table",
  "application/vnd.ms-excel": "table",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "table",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "doc",
};

export function previewKindFor(mime: string): PreviewKind | null {
  const normalised = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return PREVIEW_TYPES[normalised] ?? null;
}

/**
 * Best-effort MIME type from a filename.
 *
 * Exists for chat, whose Message row records a URL and a filename but no
 * content type — so the only way to know whether an attachment can be shown
 * is the extension. Never used to validate an upload: an extension is a claim
 * by the uploader, whereas the accepted-types check reads what the browser
 * actually reported.
 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function typeForFilename(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  return EXTENSION_TYPES[filename.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * What the previewer needs, which is less than a DBS AI attachment carries.
 *
 * Chat attachments are the reason this is its own type. A chat Message row
 * records only a URL and a filename — no MIME type, no byte count, and no
 * extracted text, because chat has no ingestion pipeline. Rather than force
 * those surfaces to fabricate the missing fields, everything beyond the three
 * that always exist is optional.
 */
export type PreviewFile = {
  filename: string;
  contentType: string;
  url: string;
  /** Unknown in chat; omitted from the header rather than shown as "0 B". */
  sizeBytes?: number | null;
  extractedText?: string | null;
  extractedUnits?: number | null;
  ingestedAt?: string | null;
  ingestError?: string | null;
};

/**
 * File preview, centre-stage.
 *
 * Renders what the browser can actually render and falls back honestly to a
 * download otherwise. Three paths:
 *
 *   image — shown directly, contained rather than cropped, because a cropped
 *           drawing hides exactly the title block you wanted to read.
 *   pdf   — an iframe. Every current browser has a PDF viewer with its own
 *           paging and zoom, which is better than anything worth rebuilding.
 *   table — the extracted text laid out as a grid.
 *   doc   — the extracted text as prose.
 *
 * The last two share a constraint: the stored object is a binary OOXML zip no
 * browser can display, so the extraction is what makes a preview possible at
 * all. That is why both are offered only once the file has been read, and why
 * both fall back to a download rather than an empty frame.
 *
 * The body scrolls; the header and footer do not. A long spreadsheet or a
 * tall elevation is the normal case, not the exception.
 */
export function FilePreview({
  attachment,
  onClose,
  showAssistantReadability = false,
}: {
  attachment: PreviewFile | null;
  onClose: () => void;
  /**
   * Whether to state if the assistant can read this file.
   *
   * Only DBS AI attachments are ingested, so only there is the claim
   * meaningful. Defaults to false so a surface that forgets to opt in makes
   * no claim at all, rather than asserting something untrue about a file the
   * assistant has never seen.
   */
  showAssistantReadability?: boolean;
}) {
  if (!attachment) return null;

  const kind = previewKindFor(attachment.contentType);
  const readable = Boolean(attachment.ingestedAt);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-friday-border-soft">
          <span className="flex items-start gap-2.5 min-w-0">
            <FileText
              className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">
                {attachment.filename}
              </span>
              <span className="block text-xs text-muted-foreground">
                {typeof attachment.sizeBytes === "number"
                  ? formatSize(attachment.sizeBytes)
                  : kindLabel(kind)}
                {attachment.extractedUnits
                  ? ` · ${attachment.extractedUnits} ${unitWord(kind, attachment.extractedUnits)}`
                  : ""}
              </span>
            </span>
          </span>

          <span className="flex items-center gap-0.5 shrink-0">
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in a new tab"
              title="Open in a new tab"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={attachment.url}
              download={attachment.filename}
              aria-label="Download"
              title="Download"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        </header>

        {/* The scrolling region. Capped by viewport height so the dialog never
            grows past the window on a tall document. */}
        <div className="max-h-[72vh] overflow-auto bg-friday-surface-2">
          {kind === "image" ? (
            <div className="flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="max-w-full h-auto rounded"
              />
            </div>
          ) : kind === "pdf" ? (
            <iframe
              src={attachment.url}
              title={attachment.filename}
              className="w-full h-[72vh] border-0 bg-friday-surface"
            />
          ) : kind === "table" ? (
            readable && attachment.extractedText ? (
              <TablePreview text={attachment.extractedText} />
            ) : (
              <Unavailable
                note="This spreadsheet has not been read yet, so there is nothing to show inline. Download it to open in Excel."
              />
            )
          ) : kind === "doc" ? (
            readable && attachment.extractedText ? (
              <DocPreview text={attachment.extractedText} />
            ) : (
              <Unavailable
                note="This document has not been read yet, so there is nothing to show inline. Download it to open in Word."
              />
            )
          ) : (
            <Unavailable note="This file type cannot be previewed here." />
          )}
        </div>

        {showAssistantReadability && (
          <footer className="px-5 py-3 border-t border-friday-border-soft">
            <p
              className={cn(
                "text-xs",
                readable ? "text-muted-foreground" : "text-friday-error-fg",
              )}
            >
              {attachment.ingestError
                ? attachment.ingestError
                : readable
                  ? "The assistant can read this file."
                  : "Stored — the assistant has not read this file yet."}
            </p>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Extracted tabular text as a grid.
 *
 * The extractor emits tab-separated rows and `### Sheet name` headers, so
 * that is what this parses. Deliberately dumb: no type inference, no header
 * detection beyond the first row, because guessing wrong about which row is
 * a header is more confusing than showing the data as it is.
 */
function TablePreview({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="p-4">
      <table className="w-full text-xs border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.startsWith("### ")) {
              return (
                <tr key={i}>
                  <th
                    colSpan={99}
                    className="text-left pt-4 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium"
                  >
                    {line.slice(4)}
                  </th>
                </tr>
              );
            }
            if (line.trim() === "") return null;
            // Tabs from Excel extraction, commas from a CSV passed through.
            const cells = line.includes("\t") ? line.split("\t") : line.split(",");
            return (
              <tr key={i} className="border-b border-friday-border-soft">
                {cells.map((cell, c) => (
                  <td
                    key={c}
                    className="px-2 py-1 align-top text-foreground whitespace-pre-wrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Extracted document text as prose.
 *
 * Rendered as plain text nodes, never as markup: the source is a document
 * someone else authored, and React escaping is what keeps a crafted .docx
 * from putting HTML into this page.
 */
function DocPreview({ text }: { text: string }) {
  return (
    <div className="px-6 py-6 mx-auto max-w-2xl bg-friday-surface">
      {text.split(/\n{2,}/).map((para, i) => (
        <p
          key={i}
          className="text-sm text-foreground leading-relaxed mb-3 whitespace-pre-wrap font-serif"
        >
          {para}
        </p>
      ))}
    </div>
  );
}

function Unavailable({ note }: { note: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <FileText
        className="h-7 w-7 mx-auto text-friday-fg-subtle"
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-sm mx-auto">
        {note}
      </p>
    </div>
  );
}

/** Used in place of a byte count where the size is not recorded. */
function kindLabel(kind: PreviewKind | null): string {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "Image";
  if (kind === "table") return "Spreadsheet";
  if (kind === "doc") return "Document";
  return "File";
}

function unitWord(kind: PreviewKind | null, n: number): string {
  const plural = n === 1 ? "" : "s";
  if (kind === "pdf") return `page${plural}`;
  if (kind === "table") return `sheet${plural}`;
  if (kind === "doc") return `paragraph${plural}`;
  return `image${plural}`;
}
