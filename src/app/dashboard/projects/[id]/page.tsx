"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, ExternalLink, Loader2, Send, Globe,
  MessageSquare, ChevronDown, AlertCircle, ThumbsUp, Reply,
  Paperclip, Smile, AtSign, FileText, Activity, MoreHorizontal,
  Upload, Image, File, Check, Clock, X, Trash2, Edit2,
  User, Tag, MapPin, CreditCard, Calendar, RotateCcw,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PHASE_COLORS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { useT } from "@/lib/translations";
import { useLanguageStore } from "@/lib/language-store";

// ── Types ───────────────────────────────────────────────────────────────────

interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; initials: string | null; image: string | null; role: string };
  replies: ThreadMessage[];
  reactions: Array<{ emoji: string; user: { id: string; name: string | null } }>;
}

interface ProjectDetail {
  id: string;
  code: string;
  title: string;
  category: string;
  phase: string;
  client: string | null;
  year: number | null;
  commune: string | null;
  typology: string | null;
  terrain: string | null;
  roof: string | null;
  description: string | null;
  pageLink: string | null;
  image: string | null;
  floors: number | null;
  area: number | null;
  status: string;
  workStatus?: string;
  billing: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: Array<{
    userId: string;
    role: string | null;
    user: { id: string; name: string | null; initials: string | null; image: string | null; email: string; role: string };
  }>;
  agendaItems: Array<{ id: string; title: string; date: string; priority: string; status: string }>;
  activities: Array<{
    id: string; type: string; description: string; createdAt: string;
    user: { id: string; name: string | null; initials: string; image: string | null };
  }>;
}

// ── Work Status — monday.com palette ───────────────────────────────────────
const WORK_STATUS = {
  todo:      { label: "Not Started",   solid: "#c4c4cf" },
  doing:     { label: "Working on it", solid: "#fdab3d" },
  stuck:     { label: "Stuck",         solid: "#e2445c" },
  completed: { label: "Done",          solid: "#00c875" },
} as const;
type WorkStatusKey = keyof typeof WORK_STATUS;

// ── Update / Comment feed (monday.com style) ────────────────────────────────

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
  const t = useT();
  const [likeCount, setLikeCount] = useState(message.reactions.filter(r => r.emoji === "👍").length);
  const [liked, setLiked] = useState(message.reactions.some(r => r.emoji === "👍" && r.user.id === currentUserId));
  const [showReplies, setShowReplies] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const displayText = translated && !showOriginal ? translated : message.content;

  const handleLike = async () => {
    setLiked((v) => !v);
    setLikeCount((c) => liked ? c - 1 : c + 1);
    await fetch(`/api/projects/${projectId}/thread/${message.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji: "👍" }),
    }).catch(() => {});
  };

  const handleTranslate = async () => {
    if (translated) { setShowOriginal((v) => !v); return; }
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, targetLang }),
      });
      const data = await res.json();
      if (data.translated) setTranslated(data.translated);
    } finally { setTranslating(false); }
  };

  return (
    <div className="border-b border-border last:border-0">
      {/* Update header */}
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
              <span className="text-sm font-bold text-foreground">{message.user.name ?? "Unknown"}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
              </span>
            </div>
            <button className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {displayText}
          </p>

          {/* Replies preview */}
          {message.replies.length > 0 && (
            <button
              onClick={() => setShowReplies((v) => !v)}
              className="flex items-center gap-1.5 mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              <MessageSquare className="w-3 h-3" />
              {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
              <ChevronDown className={cn("w-3 h-3 transition-transform", showReplies && "rotate-180")} />
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

      {/* Action bar — Like | Reply | Translate */}
      <div className="flex items-center gap-1 px-5 pb-3 ml-12">
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
            liked
              ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          {translating ? "Translating…" : translated && !showOriginal ? "Show original" : "Translate"}
        </button>
      </div>
    </div>
  );
}

// ── Updates Tab ─────────────────────────────────────────────────────────────

function UpdatesTab({ projectId, currentUserId }: { projectId: string; currentUserId: string }) {
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
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { const id = setInterval(fetchMessages, 15000); return () => clearInterval(id); }, [fetchMessages]);

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
      const msg = await res.json();
      if (msg.id) {
        if (prevReplyTo) {
          setMessages((prev) =>
            prev.map((m) => m.id === prevReplyTo.id ? { ...m, replies: [...m.replies, msg] } : m)
          );
        } else {
          setMessages((prev) => [...prev, { ...msg, replies: [], reactions: [] }]);
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
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn(
          "border border-border rounded-xl overflow-hidden bg-background focus-within:border-foreground/30 transition-colors",
          replyTo && "rounded-t-none border-t-0"
        )}>
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/30">
            {[
              { icon: "B", label: "Bold", cls: "font-bold" },
              { icon: "I", label: "Italic", cls: "italic" },
              { icon: "U", label: "Underline", cls: "underline" },
            ].map((b) => (
              <button key={b.label} className={`px-2 py-1 text-xs ${b.cls} text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors`}>{b.icon}</button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Mention">
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Emoji">
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Attach file">
              <Paperclip className="w-3.5 h-3.5" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={replyTo ? `Reply to ${replyTo.user.name}…` : "Write an update…"}
            rows={3}
            className="w-full px-4 py-3 text-sm bg-transparent outline-none resize-none placeholder:text-muted-foreground"
          />

          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
            <span className="text-[11px] text-muted-foreground">
              <kbd className="font-mono bg-background border border-border px-1 rounded text-[10px]">↵</kbd> send ·{" "}
              <kbd className="font-mono bg-background border border-border px-1 rounded text-[10px]">⇧↵</kbd> newline
            </span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all",
                input.trim() && !sending ? "bg-blue-600 hover:bg-blue-700" : "bg-muted text-muted-foreground cursor-not-allowed"
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
              <p className="text-xs text-muted-foreground">Share progress, mention a teammate.</p>
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

// ── Files Tab ────────────────────────────────────────────────────────────────

function FilesTab({ projectId }: { projectId: string }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors">
          <Upload className="w-3.5 h-3.5" /> Add file
        </button>
        <span className="text-xs text-muted-foreground ml-2">Upload documents, images, and more</span>
      </div>

      {/* Drop zone */}
      <div
        className="flex-1 p-6 flex flex-col items-center justify-center"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); /* handle files */ }}
      >
        <motion.div
          animate={{ scale: dragging ? 1.03 : 1 }}
          className={cn(
            "w-full max-w-md flex flex-col items-center gap-4 py-16 px-8 rounded-2xl border-2 border-dashed transition-colors",
            dragging ? "border-blue-400 bg-blue-50 dark:bg-blue-900/10" : "border-border bg-muted/20"
          )}
        >
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-xl bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <Image className="w-7 h-7 text-yellow-500" />
            </div>
            <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <File className="w-7 h-7 text-blue-500" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              <span className="font-bold">Drag &amp; drop</span> or{" "}
              <label className="text-blue-500 cursor-pointer hover:underline">
                browse files
                <input type="file" multiple className="hidden" onChange={() => {}} />
              </label>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload, comment and review files to collaborate in context
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Activity Log Tab ─────────────────────────────────────────────────────────

function ActivityTab({ activities }: {
  activities: Array<{
    id: string; type: string; description: string; createdAt: string;
    user: { id: string; name: string | null; initials: string; image: string | null };
  }>;
}) {
  const TYPE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
    updated:  { icon: Edit2,        color: "#3b82f6" },
    created:  { icon: Check,        color: "#00c875" },
    assigned: { icon: User,         color: "#8b5cf6" },
    comment:  { icon: MessageSquare,color: "#f59e0b" },
    default:  { icon: Activity,     color: "#94a3b8" },
  };

  return (
    <div className="overflow-y-auto h-full px-5 py-4">
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Activity className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
          <div className="space-y-0">
            {activities.map((act) => {
              const cfg = TYPE_ICON[act.type] ?? TYPE_ICON.default;
              const Icon = cfg.icon;
              return (
                <div key={act.id} className="flex gap-3 py-3 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 relative z-10"
                    style={{ background: cfg.color }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-xs text-foreground leading-relaxed">{act.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {act.user.name && (
                        <span className="text-[10px] font-semibold text-muted-foreground">{act.user.name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

type DetailView = "updates" | "files" | "activity";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailView>("updates");

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(setProject)
      .catch(() => setError("Project not found"))
      .finally(() => setLoading(false));
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      if (s?.user?.id) setCurrentUserId(s.user.id);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">{error ?? "Project not found"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  const phaseColor = PHASE_COLORS[project.phase] ?? "#6b7280";
  const wsKey = (project.workStatus as WorkStatusKey) in WORK_STATUS ? project.workStatus as WorkStatusKey : "todo";
  const ws = WORK_STATUS[wsKey];

  const TABS: { id: DetailView; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "updates", label: "Updates", icon: MessageSquare },
    { id: "files",   label: "Files",   icon: Paperclip },
    { id: "activity",label: "Activity Log", icon: Activity, count: project.activities.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
        {/* Row 1: breadcrumb + title + status */}
        <div className="flex items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")} className="gap-1.5 shrink-0 h-8 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Button>
          <div className="w-px h-4 bg-border" />
          {project.image && <img src={project.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate leading-tight">{project.title}</h1>
            <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: phaseColor }}>
              {project.phase}
            </span>
            {/* Monday.com style status chip */}
            <span className="text-[10px] font-bold px-3 py-1 rounded text-white" style={{ background: ws.solid }}>
              {ws.label}
            </span>
            {project.pageLink && (
              <a href={project.pageLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ExternalLink className="w-3 h-3" /> Notion
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Row 2: assignees + meta + toggle */}
        <div className="flex items-center gap-3 px-5 pb-2.5 flex-wrap">
          <div className="flex -space-x-1.5">
            {project.assignments.slice(0, 5).map((a) => (
              <Avatar key={a.userId} className="h-6 w-6 border-2 border-background" title={a.user.name ?? ""}>
                <AvatarImage src={a.user.image || ""} />
                <AvatarFallback className="text-[8px] font-bold bg-foreground text-background">
                  {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                </AvatarFallback>
              </Avatar>
            ))}
            {project.assignments.length === 0 && <span className="text-[11px] text-muted-foreground">No assignees</span>}
          </div>
          {[project.category, project.commune, project.client, project.year ? String(project.year) : null].filter(Boolean).map((v) => (
            <span key={v} className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{v}</span>
          ))}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDetails && "rotate-180")} />
            {showDetails ? "Hide" : "Show"} details
          </button>
        </div>

        {/* Expandable details */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border"
            >
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
                {[
                  { label: "Category", value: project.category, icon: Tag },
                  { label: "Client", value: project.client, icon: User },
                  { label: "Year", value: project.year, icon: Calendar },
                  { label: "Commune", value: project.commune, icon: MapPin },
                  { label: "Typology", value: project.typology, icon: Building2 },
                  { label: "Terrain", value: project.terrain, icon: Building2 },
                  { label: "Roof", value: project.roof, icon: Building2 },
                  { label: "Billing", value: project.billing, icon: CreditCard },
                  { label: "Area", value: project.area ? `${project.area} m²` : null, icon: Building2 },
                  { label: "Floors", value: project.floors, icon: Building2 },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label} className="flex items-start gap-2">
                    <row.icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">{row.label}</p>
                      <p className="text-xs font-medium">{String(row.value)}</p>
                    </div>
                  </div>
                ))}
                {project.notes && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-[10px] text-muted-foreground mb-1">Notes</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{project.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-5 border-t border-border">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors relative",
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30" : "bg-muted text-muted-foreground"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "updates" && currentUserId && (
            <motion.div
              key="updates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <UpdatesTab projectId={id} currentUserId={currentUserId} />
            </motion.div>
          )}
          {activeTab === "files" && (
            <motion.div
              key="files"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <FilesTab projectId={id} />
            </motion.div>
          )}
          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ActivityTab activities={project.activities} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
