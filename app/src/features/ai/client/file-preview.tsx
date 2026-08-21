"use client";

import { Download, ExternalLink, FileText, X } from "lucide-react";
import { Dialog, DialogContent } from "@/ui/components/dialog";
import { cn } from "@/ui/utils";
import { formatSize, kindForType } from "../domain/attachments";
import type { AiAttachment } from "./ai-lists";

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
 *   table — the extracted text laid out as a grid. The stored object is a
 *           binary .xlsx the browser cannot display, so the extraction is
 *           what makes a preview possible at all — which is why a table
 *           preview is only offered once the file has been read.
 *
 * The body scrolls; the header and footer do not. A long spreadsheet or a
 * tall elevation is the normal case, not the exception.
 */
export function FilePreview({
  attachment,
  onClose,
}: {
  attachment: AiAttachment | null;
  onClose: () => void;
}) {
  if (!attachment) return null;

  const kind = kindForType(attachment.contentType);
  const readable = attachment.ingestedAt !== null;

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
                {formatSize(attachment.sizeBytes)}
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
          ) : (
            <Unavailable note="This file type cannot be previewed here." />
          )}
        </div>

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

function unitWord(kind: ReturnType<typeof kindForType>, n: number): string {
  const plural = n === 1 ? "" : "s";
  if (kind === "pdf") return `page${plural}`;
  if (kind === "table") return `sheet${plural}`;
  return `image${plural}`;
}
