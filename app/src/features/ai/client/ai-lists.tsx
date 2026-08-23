"use client";

import { FileText, Trash2 } from "lucide-react";
import { cn } from "@/ui/utils";
import {
  ATTACHMENT_STATE_LABEL,
  attachmentState,
  formatSize,
} from "../domain/attachments";

/**
 * Row primitives shared by the DBS AI panel and the full DBS AI page.
 *
 * They live here rather than in either caller because the two surfaces show
 * the same lists at different scale — the panel shows conversations, the page
 * shows conversations, saved insights and files — and two copies of a row
 * would drift in exactly the places that matter, like whether a file is
 * described as readable.
 */

export type AiSession = { id: string; title: string; updatedAt: string };
export type AiSaved = {
  id: string;
  title: string;
  text: string;
  sessionId?: string | null;
  createdAt: string;
};
export type AiAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  ingestedAt: string | null;
  ingestError: string | null;
  createdAt: string;
  /** Present only where the caller asked for it — the list endpoint omits it
   *  so a directory listing does not ship every document's full text. */
  extractedText?: string | null;
  extractedUnits?: number | null;
};

export function ListOrEmpty({
  empty,
  note,
  children,
}: {
  empty: boolean;
  note: string;
  children: React.ReactNode;
}) {
  if (empty) {
    return (
      <p className="text-sm text-muted-foreground px-1 py-3 leading-relaxed">
        {note}
      </p>
    );
  }
  return <ul className="space-y-0.5">{children}</ul>;
}

export function ListRow({
  title,
  meta,
  active,
  onOpen,
  onDelete,
  deleteLabel,
}: {
  title: string;
  meta: string;
  active?: boolean;
  onOpen: () => void;
  onDelete: () => void | Promise<void>;
  deleteLabel: string;
}) {
  return (
    <li className="group/row flex items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex-1 min-w-0 text-left rounded-md px-2 py-2 transition-colors",
          "hover:bg-friday-surface-2 focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-friday-surface-2",
        )}
      >
        <span className="block text-sm text-foreground truncate">{title}</span>
        <span className="block text-[11px] text-friday-fg-subtle">{meta}</span>
      </button>
      <button
        type="button"
        onClick={() => void onDelete()}
        aria-label={deleteLabel}
        className="shrink-0 p-1.5 rounded-md text-friday-fg-subtle opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-friday-error-fg transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export function AttachmentRow({
  attachment,
  onOpen,
  onDelete,
}: {
  attachment: AiAttachment;
  /** Opens the centre-stage preview after its storage URL is validated. */
  onOpen: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const state = attachmentState(attachment);
  return (
    <li className="group/row flex items-start gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-start gap-2 text-left rounded-md px-2 py-2 hover:bg-friday-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-sm text-foreground truncate">
            {attachment.filename}
          </span>
          <span className="block text-[11px] text-friday-fg-subtle">
            {formatSize(attachment.sizeBytes)} ·{" "}
            {relativeDay(attachment.createdAt)}
          </span>
          {/*
           * Not decoration. Until ingestion runs the assistant has not read
           * the file, and a user who assumes otherwise will trust an answer
           * about a document the model never saw.
           */}
          <span
            className={cn(
              "block text-[11px] mt-0.5",
              state === "ready"
                ? "text-friday-success-fg"
                : state === "failed"
                  ? "text-friday-error-fg"
                  : "text-muted-foreground",
            )}
          >
            {attachment.ingestError ?? ATTACHMENT_STATE_LABEL[state]}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void onDelete()}
        aria-label={`Remove ${attachment.filename}`}
        className="shrink-0 p-1.5 mt-1 rounded-md text-friday-fg-subtle opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-friday-error-fg transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Today / Yesterday / an absolute date. Relative ages past that make the
 *  reader do arithmetic. */
export function relativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) /
      86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
