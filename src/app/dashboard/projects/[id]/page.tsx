"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  User,
  Tag,
  Layers,
  Mountain,
  Home,
  SquareStack,
  Ruler,
  CreditCard,
  FileText,
  ExternalLink,
  Clock,
  Activity,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Globe,
  Eye,
  MessageSquare,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  RotateCcw,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PHASE_COLORS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { useT } from "@/lib/translations";
import { useLanguageStore } from "@/lib/language-store";

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

type DetailTab = "details" | "tasks" | "activity";

const PRIORITY_CONFIG = {
  high: { label: "High", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  medium: { label: "Medium", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  low: { label: "Low", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
} as Record<string, { label: string; color: string; bg: string }>;

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  message,
  currentUserId,
  projectId,
  onReply,
  targetLang,
}: {
  message: ThreadMessage;
  currentUserId: string;
  projectId: string;
  onReply: (msg: ThreadMessage) => void;
  targetLang: string;
}) {
  const t = useT();
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const isMe = message.user.id === currentUserId;

  const handleTranslate = async () => {
    if (translated) { setShowOriginal(!showOriginal); return; }
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, targetLang }),
      });
      const data = await res.json();
      if (data.translated) setTranslated(data.translated);
    } finally {
      setTranslating(false);
    }
  };

  const displayText = translated && !showOriginal ? translated : message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <div className={cn("flex gap-3", isMe && "flex-row-reverse")}>
        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
          <AvatarImage src={message.user.image || ""} />
          <AvatarFallback className="text-[10px] bg-foreground text-background">
            {message.user.initials ?? message.user.name?.slice(0, 2).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>

        <div className={cn("flex-1 max-w-[80%]", isMe && "items-end flex flex-col")}>
          <div className={cn("flex items-center gap-2 mb-1", isMe && "flex-row-reverse")}>
            <span className="text-xs font-semibold">{message.user.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(message.createdAt), "HH:mm")} ·{" "}
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              isMe
                ? "bg-foreground text-background rounded-tr-sm"
                : "bg-muted rounded-tl-sm"
            )}
          >
            {displayText}
          </div>

          {/* Actions row */}
          <div className={cn("flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity", isMe && "flex-row-reverse")}>
            <button
              onClick={() => onReply(message)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              {t("thread.reply")}
            </button>
            <button
              onClick={handleTranslate}
              disabled={translating}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Globe className="w-3 h-3" />
              {translating ? "…" : translated && !showOriginal ? t("common.show_original") : t("common.translate")}
            </button>
            {translated && showOriginal && (
              <button
                onClick={() => setShowOriginal(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Translated
              </button>
            )}
          </div>

          {/* Replies */}
          {message.replies.length > 0 && (
            <div className={cn("mt-1", isMe && "self-end")}>
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showReplies ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
              </button>
              <AnimatePresence>
                {showReplies && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 pl-4 border-l-2 border-border space-y-2"
                  >
                    {message.replies.map((reply) => (
                      <div key={reply.id} className="flex gap-2">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="text-[9px] bg-foreground text-background">
                            {reply.user.initials ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11px] font-semibold">{reply.user.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 text-xs">
                            {reply.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Project Thread Panel ────────────────────────────────────────────────────

function ProjectThread({ projectId, currentUserId }: { projectId: string; currentUserId: string }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/thread`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Poll every 10s for new messages
  useEffect(() => {
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    setReplyTo(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId: replyTo?.id }),
      });
      const msg = await res.json();
      if (msg.id) {
        if (replyTo) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyTo.id ? { ...m, replies: [...m.replies, msg] } : m
            )
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const grouped: { date: string; messages: ThreadMessage[] }[] = [];
  for (const msg of messages) {
    const dateKey = format(new Date(msg.createdAt), "MMMM d, yyyy");
    const last = grouped[grouped.length - 1];
    if (last?.date === dateKey) last.messages.push(msg);
    else grouped.push({ date: dateKey, messages: [msg] });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{t("thread.title")}</span>
          {messages.length > 0 && (
            <Badge variant="secondary" className="text-xs">{messages.length}</Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          Ctrl+Enter to send
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">{t("thread.no_messages")}</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground font-medium px-2">{group.date}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {group.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    currentUserId={currentUserId}
                    projectId={projectId}
                    onReply={setReplyTo}
                    targetLang={language}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mx-4 mb-2 px-3 py-2 bg-accent rounded-lg border border-border text-xs flex items-center justify-between"
          >
            <span className="text-muted-foreground">
              Replying to <strong>{replyTo.user.name}</strong>: {replyTo.content.slice(0, 50)}…
            </span>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground ml-2">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-4 pb-4 shrink-0">
        <div className="flex gap-2 items-end border border-border rounded-xl overflow-hidden bg-background focus-within:border-foreground/30 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("thread.placeholder")}
            rows={1}
            className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none resize-none min-h-[40px] max-h-32"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="m-1.5 p-2 bg-foreground text-background rounded-lg disabled:opacity-40 hover:bg-foreground/80 transition-colors shrink-0"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Work Status Config ──────────────────────────────────────────────────────
const WORK_STATUS = {
  todo:      { label: "Not Started", color: "#94a3b8", bg: "#f1f5f9" },
  doing:     { label: "In Progress", color: "#3b82f6", bg: "#eff6ff" },
  stuck:     { label: "Stuck",       color: "#ef4444", bg: "#fef2f2" },
  completed: { label: "Done",        color: "#22c55e", bg: "#f0fdf4" },
} as const;

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);

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
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("common.back")} to Projects
        </Button>
      </div>
    );
  }

  const phaseColor = PHASE_COLORS[project.phase] ?? "#6b7280";
  const ws = WORK_STATUS[(project as any).workStatus as keyof typeof WORK_STATUS] ?? WORK_STATUS.todo;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Compact header ── */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
        {/* Row 1: nav + title */}
        <div className="flex items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")} className="gap-1.5 shrink-0 h-8 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />
            Projects
          </Button>
          <div className="w-px h-4 bg-border" />
          {project.image && <img src={project.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate leading-tight">{project.title}</h1>
            <p className="text-[10px] text-muted-foreground font-mono">{project.code}</p>
          </div>
          {/* Badges */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: phaseColor }}>
              {project.phase}
            </span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border" style={{ color: ws.color, background: ws.bg, borderColor: ws.color + "40" }}>
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

        {/* Row 2: assignees + key meta + toggle details */}
        <div className="flex items-center gap-4 px-5 pb-2.5">
          {/* Assignees */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {project.assignments.slice(0, 5).map((a) => (
                <Avatar key={a.userId} className="h-6 w-6 border-2 border-background" title={a.user.name ?? ""}>
                  <AvatarImage src={a.user.image || ""} />
                  <AvatarFallback className="text-[8px] font-bold bg-foreground text-background">
                    {a.user.initials ?? a.user.name?.slice(0, 2).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {project.assignments.length === 0 && <span className="text-[11px] text-muted-foreground">No assignees</span>}
          </div>

          {/* Meta pills */}
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
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2">
                {[
                  { label: "Category", value: project.category },
                  { label: "Client", value: project.client },
                  { label: "Year", value: project.year },
                  { label: "Commune", value: project.commune },
                  { label: "Typology", value: project.typology },
                  { label: "Terrain", value: project.terrain },
                  { label: "Roof", value: project.roof },
                  { label: "Billing", value: project.billing },
                  { label: "Area", value: project.area ? `${project.area} m²` : null },
                  { label: "Floors", value: project.floors },
                ].filter((r) => r.value).map((row) => (
                  <div key={row.label}>
                    <p className="text-[10px] text-muted-foreground">{row.label}</p>
                    <p className="text-xs font-medium">{String(row.value)}</p>
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
      </div>

      {/* ── Full-height Thread ── */}
      <div className="flex-1 overflow-hidden">
        {currentUserId ? (
          <ProjectThread projectId={id} currentUserId={currentUserId} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
