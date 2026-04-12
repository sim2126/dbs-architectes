"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  isStreaming?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SSEEvent {
  type: "text" | "tool_start" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  tools?: string[];
  name?: string;
  message?: string;
}

// ─── Constants ────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "Portfolio health overview — phases, statuses, blocked projects",
  "Which projects are currently stuck or blocked?",
  "What deadlines are coming up in the next 2 weeks?",
  "Show team workload — who is overloaded?",
  "List all projects in the CHANTIER phase",
  "What changed in the last 7 days?",
];

const TOOL_LABELS: Record<string, string> = {
  search_projects: "Searching project portfolio",
  get_project_details: "Fetching project details",
  get_project_thread: "Reading project thread",
  get_team_messages: "Reading team messages",
  get_agenda: "Checking agenda & deadlines",
  get_team_workload: "Analysing team workload",
  get_statistics: "Pulling portfolio statistics",
  get_activity_log: "Loading activity log",
};

// Generate a short title from the first user message
function generateTitle(content: string): string {
  const words = content.trim().split(/\s+/);
  const short = words.slice(0, 6).join(" ");
  return short.length < content.trim().length ? short + "…" : short;
}

// ─── Message bubble ───────────────────────────────────────────

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      {message.role === "assistant" && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className="max-w-[86%] space-y-2">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolCalls.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground"
              >
                <Wrench className="h-3 w-3" />
                {TOOL_LABELS[tool] ?? tool}
              </span>
            ))}
          </div>
        )}

        <div
          className={`rounded-[26px] px-4 py-4 ${
            message.role === "user"
              ? "bg-foreground text-background"
              : "border border-border bg-card shadow-sm"
          }`}
        >
          {message.role === "user" ? (
            <p className="text-sm leading-7">{message.content}</p>
          ) : message.isStreaming && !message.content ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aria is thinking…
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-7 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {message.role === "assistant" && !message.isStreaming && message.content && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {message.role === "user" && (
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-muted text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}

// ─── Chat history sidebar ─────────────────────────────────────

function ChatHistorySidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const groupByDate = (sessions: ChatSession[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups: Record<string, ChatSession[]> = { Today: [], Yesterday: [], "Last 7 days": [], Older: [] };

    for (const s of sessions) {
      const d = new Date(s.updatedAt);
      d.setHours(0, 0, 0, 0);
      if (d >= today) groups["Today"].push(s);
      else if (d >= yesterday) groups["Yesterday"].push(s);
      else if (d >= weekAgo) groups["Last 7 days"].push(s);
      else groups["Older"].push(s);
    }

    return groups;
  };

  const grouped = groupByDate(sessions);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 shrink-0">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
        {Object.entries(grouped).map(([label, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
                      activeId === s.id ? "bg-accent" : "hover:bg-accent/50"
                    )}
                    onClick={() => onSelect(s.id)}
                  >
                    {editingId === s.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          if (editValue.trim()) onRename(s.id, editValue.trim());
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editValue.trim()) onRename(s.id, editValue.trim());
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm outline-none border-b border-foreground"
                      />
                    ) : (
                      <span className="flex-1 truncate text-sm">{s.title}</span>
                    )}

                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuId === s.id ? null : s.id);
                        }}
                        className="p-1 rounded-lg hover:bg-background transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>

                      {menuId === s.id && (
                        <div
                          className="absolute right-0 top-6 z-50 min-w-[130px] rounded-xl border border-border bg-card shadow-lg py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setEditValue(s.title);
                              setEditingId(s.id);
                              setMenuId(null);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              onDelete(s.id);
                              setMenuId(null);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-accent transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {sessions.length === 0 && (
          <p className="px-3 pt-4 text-xs text-muted-foreground text-center">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function DBSGPTPage() {
  const { data: userSession } = useSession();

  // Chat sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Messages for current session
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seqRef = useRef(0);
  const pendingUserContent = useRef<string>("");
  const pendingAssistantContent = useRef<string>("");

  const makeId = (role: string) => `${role}-${++seqRef.current}`;

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    fetch("/api/ai-chats")
      .then((r) => r.json())
      .then((data: ChatSession[]) => setSessions(data))
      .catch(() => {});
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    setLoadingSession(true);
    fetch(`/api/ai-chats/${activeSessionId}`)
      .then((r) => r.json())
      .then((data: { messages: { id: string; role: string; content: string }[] }) => {
        setMessages(
          (data.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, [activeSessionId]);

  // Create new session
  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/ai-chats", { method: "POST" });
    const data = await res.json() as ChatSession;
    setSessions((prev) => [data, ...prev]);
    setActiveSessionId(data.id);
    setMessages([]);
    return data.id;
  }, []);

  // Handle new chat button
  const handleNew = useCallback(async () => {
    await createSession();
  }, [createSession]);

  // Select existing session
  const handleSelect = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  // Delete session
  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/ai-chats/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [activeSessionId]);

  // Rename session
  const handleRename = useCallback(async (id: string, title: string) => {
    await fetch(`/api/ai-chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  }, []);

  // Save message pair to DB
  const saveMessages = useCallback(async (
    sessionId: string,
    userContent: string,
    assistantContent: string,
    isFirst: boolean
  ) => {
    const title = isFirst ? generateTitle(userContent) : undefined;
    await fetch(`/api/ai-chats/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userContent, assistantContent, title }),
    });
    if (isFirst && title) {
      setSessions((prev) =>
        prev.map((s) => s.id === sessionId ? { ...s, title, updatedAt: new Date().toISOString() } : s)
      );
    } else {
      setSessions((prev) =>
        prev.map((s) => s.id === sessionId ? { ...s, updatedAt: new Date().toISOString() } : s)
      );
    }
  }, []);

  const buildHistory = useCallback((msgs: ChatMessage[]) =>
    msgs
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    []
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    // Ensure we have a session
    let sessionId = activeSessionId;
    const isFirst = messages.length === 0;
    if (!sessionId) {
      sessionId = await createSession();
    }

    const userMsg: ChatMessage = { id: makeId("user"), role: "user", content };
    const assistantId = makeId("assistant");
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);
    pendingUserContent.current = content;
    pendingAssistantContent.current = "";

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const history = buildHistory([...messages, userMsg]);

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));

            if (event.type === "text" && event.content) {
              pendingAssistantContent.current += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content, isStreaming: false }
                    : m
                )
              );
            } else if (event.type === "tool_start" && event.tools) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), ...event.tools!] }
                    : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                )
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                    : m
                )
              );
            }
          } catch {
            // malformed SSE line
          }
        }
      }

      // Save to DB after stream completes
      if (sessionId && pendingAssistantContent.current) {
        await saveMessages(sessionId, pendingUserContent.current, pendingAssistantContent.current, isFirst);
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Something went wrong: ${String(err)}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeSessionId, createSession, buildHistory, saveMessages]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* Chat history sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold">DBS GPT</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatHistorySidebar
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 border-b border-border bg-card/80 px-6 py-3 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate max-w-xs">
              {activeSessionId
                ? sessions.find((s) => s.id === activeSessionId)?.title ?? "Chat"
                : "DBS GPT — Aria"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">Live</Badge>
            <Badge variant="outline" className="text-xs">GPT-4o</Badge>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleNew}>
                New chat
              </Button>
            )}
          </div>
        </div>

        {/* Messages / empty state */}
        <div className="flex-1 overflow-y-auto">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl px-6 py-10"
            >
              <div className="rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#155e75_100%)] px-8 py-10 text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
                <Badge className="bg-white/12 text-[11px] text-white">Project Intelligence · Aria</Badge>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Ask anything about DBS projects, deadlines, team, or regulations.
                </h2>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="group rounded-[20px] border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-6">{prompt}</p>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
              <AnimatePresence>
                {messages.map((message, idx) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={
                      message.role === "assistant" && idx === messages.length - 1 && lastUserMsg
                        ? () => {
                            setMessages((prev) => prev.slice(0, -1));
                            sendMessage(lastUserMsg.content);
                          }
                        : undefined
                    }
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border bg-card/90 px-6 py-4">
          <div className="mx-auto max-w-3xl flex gap-3">
            <textarea
              ref={textareaRef}
              placeholder="Ask about projects, deadlines, team workload, regulations…"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              className="flex-1 min-h-[52px] max-h-[140px] resize-none rounded-2xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              size="icon"
              className="h-[52px] w-[52px] rounded-2xl shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto max-w-3xl mt-2 text-xs text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
