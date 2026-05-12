"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Copy, Send, Check, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { SummaryRenderer } from "@/components/calls/summary-renderer";
import type { AnySummary } from "@/platform/integrations/meeting-summarizer";

interface CallLite {
  id: string;
  title?: string | null;
  summary?: unknown;
  summaryMode?: string | null;
  shareToken?: string | null;
  project?: { id: string; title: string; code: string } | null;
}

type Mode = "simple" | "detailed";

export function SummaryModal({
  call,
  onClose,
  onUpdated,
}: {
  call: CallLite | null;
  onClose: () => void;
  onUpdated: (c: Partial<CallLite> & { id: string }) => void;
}) {
  const [mode, setMode] = useState<Mode>("simple");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnySummary | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [posted, setPosted] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!call) return;
    setError(null);
    setPosted(false);
    if (call.summary) {
      setSummary(call.summary as AnySummary);
      setShareToken(call.shareToken ?? null);
      setMode((call.summaryMode as Mode) ?? "simple");
    } else {
      setSummary(null);
      setShareToken(null);
      setMode("simple");
    }
  }, [call]);

  if (!call) return null;

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/meeting/${shareToken}`
    : null;

  const runSummarize = async (selectedMode: Mode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${call.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Summarization failed");
      setSummary(data.summary);
      setShareToken(data.shareToken);
      setMode(selectedMode);
      onUpdated({
        id: call.id,
        summary: data.summary,
        summaryMode: selectedMode,
        shareToken: data.shareToken,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const postToThread = async () => {
    setPosting(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/share-to-thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setPosted(true);
        setTimeout(() => setPosted(false), 3000);
      } else {
        setError(data.error ?? "Could not post");
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 20 }}
          className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Meeting Intelligence
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {call.title ?? "Team Meeting"}
                {call.project && ` · ${call.project.code}`}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode selector */}
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-2 p-1 bg-muted rounded-xl w-fit">
              {(["simple", "detailed"] as const).map((m) => (
                <button
                  key={m}
                  disabled={loading}
                  onClick={() => {
                    if (summary && mode === m) return;
                    runSummarize(m);
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize",
                    mode === m && summary
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    loading && "opacity-50 cursor-wait"
                  )}
                >
                  {m === "simple" ? "Simple report" : "Detailed (DBS-native)"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Simple = Read-AI style · Detailed = adds project context, team roster, prior-meeting delta, risks, budget & deadline tracking.
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
                <p className="text-sm font-medium">
                  {mode === "detailed" ? "Loading DBS context & summarizing…" : "Summarizing…"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This can take 10–30 seconds.
                </p>
              </div>
            )}

            {!loading && !summary && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-5 bg-violet-500/10 rounded-3xl mb-4">
                  <FileText className="w-8 h-8 text-violet-500" />
                </div>
                <p className="text-sm font-medium mb-1">No summary yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mb-5">
                  Pick a mode above to generate one. Detailed mode uses the full DBS project graph.
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => runSummarize("simple")}>Simple report</Button>
                  <Button
                    onClick={() => runSummarize("detailed")}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Detailed report
                  </Button>
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200 text-sm rounded-xl p-4">
                {error}
              </div>
            )}

            {summary && !loading && (
              <SummaryRenderer summary={summary} recordingUrl={null} />
            )}
          </div>

          {/* Footer actions */}
          {summary && shareUrl && (
            <div className="px-6 py-3 border-t border-border bg-muted/30 flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={copyShareUrl}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy share link"}
              </Button>
              {call.project && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={postToThread}
                  disabled={posting || posted}
                >
                  {posting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : posted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {posted ? "Posted" : "Post to project thread"}
                </Button>
              )}
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Open full page <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
