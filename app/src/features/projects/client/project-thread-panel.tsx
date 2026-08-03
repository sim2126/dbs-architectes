"use client";

// Reusable project-thread UI. Extracted from /dashboard/projects/[id]
// so sheets, calls, agenda, etc. can all open the same comment panel.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  ChevronDown,
  Globe,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Reply,
  Send,
  Smile,
  ThumbsUp,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { cn } from "@/ui/utils";
import { useLanguageStore } from "@/i18n/language-store";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    initials: string | null;
    image: string | null;
    role: string;
  };
  replies: ThreadMessage[];
  reactions: Array<{ emoji: string; user: { id: string; name: string | null } }>;
}

// ── Single message (with reactions, replies, translate) ──────────────────────

function UpdateItem({
  message,
  currentUserId,
  projectId,
  targetLang,
  onReply,
}: {
  message: ThreadMessage;
  currentUserId: string;
  projectId: string;
  targetLang: string;
  onReply: (msg: ThreadMessage) => void;
}) {
  const [likeCount, setLikeCount] = useState(
    message.reactions.filter((r) => r.emoji === "👍").length,
  );
  const [liked, setLiked] = useState(
    message.reactions.some((r) => r.emoji === "👍" && r.user.id === currentUserId),
  );
  const [showReplies, setShowReplies] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const displayText = translated && !showOriginal ? translated : message.content;

  const handleLike = async () => {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    await fetch(`/api/projects/${projectId}/thread/${message.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji: "👍" }),
    }).catch(() => {});
  };

  const handleTranslate = async () => {
    if (translated) {
      setShowOriginal((v) => !v);
      return;
    }
    setTranslating(true);
    setTranslationError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, targetLang }),
      });
      const data = (await res.json()) as { translated?: string; error?: string };
      if (!res.ok || !data.translated) {
        throw new Error(data.error ?? "AI Assistant could not translate this update. Please try again.");
      }
      setTranslated(data.translated);
    } catch (error) {
      setTranslationError(
        error instanceof Error
          ? error.message
          : "AI Assistant could not translate this update. Please try again.",
      );
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-start gap-3 px-5 py-4">
        <Avatar className="w-9 h-9 shrink-0 mt-0.5">
          <AvatarImage src={message.user.image ?? undefined} />
          <AvatarFallback className="text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {message.user.initials ?? message.user.name?.slice(0, 2).toUpperCase() ?? "??"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {message.user.name ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
              </span>
            </div>
            <button className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {(translating || translated || translationError) && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              AI Assistant · Translation · {targetLang.toUpperCase()}
            </p>
          )}
          {translationError && (
            <p className="mb-1 text-xs text-destructive">{translationError}</p>
          )}
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {displayText}
          </p>

          {message.replies.length > 0 && (
            <button
              onClick={() => setShowReplies((v) => !v)}
              className="flex items-center gap-1.5 mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              <MessageSquare className="w-3 h-3" />
              {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
              <ChevronDown
                className={cn("w-3 h-3 transition-transform", showReplies && "rotate-180")}
              />
            </button>
          )}

          <AnimatePresence>
            {showReplies && message.replies.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-3 pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-3"
              >
                {message.replies.map((reply) => (
                  <div key={reply.id} className="flex gap-2.5">
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className="text-[9px] font-bold bg-muted text-foreground">
                        {reply.user.initials ?? reply.user.name?.slice(0, 2).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold">{reply.user.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{reply.content}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-1 px-5 pb-3 ml-12">
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
            liked
              ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          {likeCount > 0 ? `Like (${likeCount})` : "Like"}
        </button>
        <button
          onClick={() => onReply(message)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <Reply className="w-3.5 h-3.5" />
          Reply
        </button>
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <Globe className="w-3.5 h-3.5" />
          {translating
            ? "Translating…"
            : translated && !showOriginal
              ? "Show original"
              : "Translate"}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function ProjectThreadPanel({
  projectId,
  currentUserId,
}: {
  projectId: string;
  currentUserId: string;
}) {
  const language = useLanguageStore((s) => s.language);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/thread`);
      const data = (await res.json()) as { messages?: ThreadMessage[] };
      if (data.messages) setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const id = setInterval(fetchMessages, 15000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const prevReplyTo = replyTo;
    setReplyTo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId: prevReplyTo?.id }),
      });
      const msg = (await res.json()) as Partial<ThreadMessage>;
      if (msg.id) {
        if (prevReplyTo) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === prevReplyTo.id
                ? { ...m, replies: [...m.replies, msg as ThreadMessage] }
                : m,
            ),
          );
        } else {
          setMessages((prev) => [
            ...prev,
            { ...(msg as ThreadMessage), replies: [], reactions: [] },
          ]);
        }
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Composer */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-t-xl px-3 py-2 mb-0 border-b-0"
            >
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
                <Reply className="w-3 h-3" />
                Replying to <strong>{replyTo.user.name}</strong>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            "border border-border rounded-xl overflow-hidden bg-background focus-within:border-foreground/30 transition-colors",
            replyTo && "rounded-t-none border-t-0",
          )}
        >
          <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/30">
            {[
              { icon: "B", label: "Bold", cls: "font-bold" },
              { icon: "I", label: "Italic", cls: "italic" },
              { icon: "U", label: "Underline", cls: "underline" },
            ].map((b) => (
              <button
                key={b.label}
                className={`px-2 py-1 text-xs ${b.cls} text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors`}
              >
                {b.icon}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Mention"
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Emoji"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={replyTo ? `Reply to ${replyTo.user.name}…` : "Write an update…"}
            rows={3}
            className="w-full px-4 py-3 text-sm bg-transparent outline-none resize-none placeholder:text-muted-foreground"
          />

          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
            <span className="text-[11px] text-muted-foreground">
              <kbd className="font-mono bg-background border border-border px-1 rounded text-[10px]">
                ↵
              </kbd>{" "}
              send ·{" "}
              <kbd className="font-mono bg-background border border-border px-1 rounded text-[10px]">
                ⇧↵
              </kbd>{" "}
              newline
            </span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all",
                input.trim() && !sending
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {replyTo ? "Reply" : "Update"}
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">No updates yet</p>
              <p className="text-xs text-muted-foreground">
                Share progress, mention a teammate.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {[...messages].reverse().map((msg) => (
              <UpdateItem
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                projectId={projectId}
                targetLang={language}
                onReply={setReplyTo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
