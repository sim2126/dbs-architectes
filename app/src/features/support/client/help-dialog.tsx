"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, HelpCircle, Loader2, Paperclip, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/dialog";
import { Button } from "@/ui/components/button";
import { showToast } from "@/ui/components/toast";
import { cn } from "@/ui/utils";
import { useHelpStore } from "@/ui/stores/help-store";

type Kind = "problem" | "question";
type Staged = { filename: string; contentType: string; data: string; size: number };

const MAX_FILES = 4;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export function HelpDialog() {
  const open = useHelpStore((s) => s.open);
  const onOpenChange = useHelpStore((s) => s.setOpen);
  const [kind, setKind] = useState<Kind | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Staged[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setKind(null);
    setMessage("");
    setFiles([]);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const stage = useCallback(
    async (incoming: FileList | null) => {
      if (!incoming) return;
      const next: Staged[] = [];
      let total = files.reduce((n, f) => n + f.size, 0);

      for (const file of Array.from(incoming)) {
        if (files.length + next.length >= MAX_FILES) {
          showToast(`You can attach at most ${MAX_FILES} files.`, "warning");
          break;
        }
        total += file.size;
        if (total > MAX_TOTAL_BYTES) {
          showToast("Attachments are too large — keep the total under 8 MB.", "warning");
          break;
        }
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        next.push({
          filename: file.name,
          contentType: file.type,
          data: data.slice(data.indexOf(",") + 1),
          size: file.size,
        });
      }
      if (next.length > 0) setFiles((prev) => [...prev, ...next]);
    },
    [files],
  );

  // Screenshots are usually pasted, not chosen from a file picker.
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.files);
      if (items.length === 0) return;
      e.preventDefault();
      const dt = new DataTransfer();
      items.forEach((f) => dt.items.add(f));
      void stage(dt.files);
    },
    [stage],
  );

  const submit = async () => {
    if (!kind || message.trim() === "") return;
    setSending(true);
    try {
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          message,
          pageUrl: window.location.href,
          files: files.map(({ filename, contentType, data }) => ({
            filename,
            contentType,
            data,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(body?.error ?? "Could not send the report.", "danger");
        return;
      }
      showToast("Sent. We will come back to you.", "success");
      close(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === null ? "Get help" : kindTitle(kind)}</DialogTitle>
        </DialogHeader>

        {kind === null ? (
          <div className="space-y-2.5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tell us what you need and it reaches the team directly.
            </p>
            <ChoiceButton
              icon={<AlertCircle className="h-4 w-4" />}
              title="Something is not working"
              description="Report a problem. Attach a screenshot if it helps."
              onClick={() => setKind("problem")}
            />
            <ChoiceButton
              icon={<HelpCircle className="h-4 w-4" />}
              title="I am not sure how to do something"
              description="Ask a question and we will walk you through it."
              onClick={() => setKind("question")}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={onPaste}
              rows={6}
              placeholder={
                kind === "problem"
                  ? "What were you doing, and what happened instead?"
                  : "What are you trying to do?"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.filename}-${i}`}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="flex-1 truncate">{f.filename}</span>
                    <span className="tabular-nums shrink-0">
                      {Math.round(f.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.filename}`}
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach a screenshot
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                onChange={(e) => void stage(e.target.files)}
                className="hidden"
              />
              <span className="text-xs text-friday-fg-subtle">
                or paste one into the box
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setKind(null)} disabled={sending}>
                Back
              </Button>
              <Button onClick={submit} disabled={sending || message.trim() === ""}>
                {sending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Send
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function kindTitle(kind: Kind): string {
  return kind === "problem" ? "Report a problem" : "Ask a question";
}

function ChoiceButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border border-border bg-card px-4 py-3",
        "hover:border-friday-accent hover:bg-friday-surface-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="flex items-center gap-2 text-sm text-foreground">
        {icon}
        {title}
      </span>
      <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
        {description}
      </span>
    </button>
  );
}
