"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Calculator,
  Copy,
  Check,
  ExternalLink,
  FileSearch,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
  isStreaming?: boolean;
}

interface SSEEvent {
  type: "text" | "tool_start" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  tools?: string[];
  name?: string;
  message?: string;
}

// ─── Sidebar content ──────────────────────────────────────────

const PROMPT_GROUPS = [
  {
    title: "Portfolio",
    icon: Building2,
    prompts: [
      "Portfolio health overview — phases, statuses, blocked projects",
      "Which projects are currently stuck or at risk?",
      "List all active projects with their team and next deadline",
    ],
  },
  {
    title: "Team & Workload",
    icon: Calculator,
    prompts: [
      "Show team workload — who is overloaded and who has capacity?",
      "What deadlines are coming up in the next 2 weeks?",
      "What changed in the last 7 days?",
    ],
  },
  {
    title: "Regulations & SOPs",
    icon: BookOpen,
    prompts: [
      "What are the VSS standards for residential parking?",
      "Summarize PROCAP accessibility requirements for common areas.",
      "Which DBS SOP applies before permit submission?",
    ],
  },
];

const TRUSTED_SOURCES = [
  { label: "Live Project Database", type: "Real-time data", detail: "Projects, phases, status, team assignments" },
  { label: "Team Threads & Chat", type: "Internal comms", detail: "Project updates and team discussions" },
  { label: "Agenda & Deadlines", type: "Schedule data", detail: "Milestones, tasks, and overdue items" },
  { label: "DBS OPS Manual", type: "Knowledge base", detail: "SOPs, standards, and regulations" },
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

// ─── Message bubble ───────────────────────────────────────────

function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
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

      <div className={`max-w-[86%] space-y-2`}>
        {/* Tool call badges */}
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
          ) : (
            <div className="space-y-2">
              {message.isStreaming && !message.content ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aria is thinking…
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-7 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions for assistant messages */}
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

// ─── Main page ────────────────────────────────────────────────

export default function DBSGPTPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seqRef = useRef(0);

  const makeId = (role: string) => `${role}-${++seqRef.current}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build OpenAI-format history from chat messages
  const buildHistory = useCallback((msgs: ChatMessage[]) =>
    msgs
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    []
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

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

    // Reset textarea height
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
            // malformed SSE line, skip
          }
        }
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
  }, [loading, messages, buildHistory]);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/80 px-6 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">DBS GPT — Aria</h1>
              <p className="text-xs text-muted-foreground">
                Project intelligence · Regulations · SOPs · Live data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">Live project data</Badge>
            <Badge variant="success" className="text-xs">Real-time answers</Badge>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setMessages([])}
              >
                New chat
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left sidebar */}
        <div className="space-y-4">
          <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">Knowledge sources</p>
              </div>
              <div className="mt-4 space-y-3">
                {TRUSTED_SOURCES.map((source) => (
                  <div key={source.label} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{source.label}</p>
                      <Badge variant="outline" className="text-[10px]">{source.type}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{source.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Prompt collections</p>
              </div>
              <div className="mt-4 space-y-4">
                {PROMPT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 flex items-center gap-2">
                      <group.icon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {group.title}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {group.prompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          disabled={loading}
                          className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat panel */}
        <div className="flex min-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-[32px] border border-border bg-card shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex-1 overflow-y-auto p-6">
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-4xl">
                <div className="rounded-[30px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#155e75_100%)] p-8 text-white shadow-[0_28px_70px_rgba(15,23,42,0.2)]">
                  <Badge className="bg-white/12 text-[11px] text-white">Project Intelligence · Aria</Badge>
                  <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                    Ask anything about DBS projects, deadlines, team, or regulations.
                  </h2>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75">
                    Aria has live access to your full project portfolio, team threads, agenda, workload data, and internal standards — all from one place.
                  </p>
                  <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {[
                      { title: "Live project data", body: "Real-time access to project status, phases, team assignments, and activity." },
                      { title: "Deadline intelligence", body: "Surfaces overdue items, upcoming milestones, and blocked projects instantly." },
                      { title: "Markdown tables", body: "Structured responses with tables, lists, and source-backed findings." },
                    ].map((item) => (
                      <div key={item.title} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-2 text-xs leading-6 text-white/72">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {[
                    "Portfolio health overview — phases, statuses, blocked projects",
                    "Which projects are currently stuck or blocked?",
                    "What deadlines are coming up in the next 2 weeks?",
                    "Show team workload — who is overloaded?",
                    "List all projects in the CHANTIER phase",
                    "What changed in the last 7 days?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="group rounded-[24px] border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm font-medium leading-6">{prompt}</p>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            /* Messages */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl space-y-6">
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
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border bg-background/90 p-4">
            <div className="mx-auto max-w-4xl">
              <div className="flex gap-3">
                <textarea
                  ref={textareaRef}
                  placeholder="Ask about projects, deadlines, team workload, regulations…"
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 min-h-[56px] max-h-[140px] resize-none rounded-2xl border border-border bg-card px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  size="icon"
                  className="h-14 w-14 rounded-2xl shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Enter to send · Shift+Enter for new line
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Live DB access
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    GPT-4o powered
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
