"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        {/* Tool badges */}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Actions */}
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

  const buildHistory = useCallback(
    (msgs: ChatMessage[]) =>
      msgs
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    []
  );

  const sendMessage = useCallback(
    async (content: string) => {
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
              // malformed SSE line
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
    },
    [loading, messages, buildHistory]
  );

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
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/80 px-6 py-4 backdrop-blur-sm shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold">DBS GPT — Aria</h1>
              <p className="text-xs text-muted-foreground">
                Project intelligence · Live data · GPT-4o
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">Live</Badge>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setMessages([])}>
                New chat
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages / Empty state */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-3xl px-6 py-10"
          >
            {/* Hero */}
            <div className="rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#155e75_100%)] px-8 py-10 text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
              <Badge className="bg-white/12 text-[11px] text-white">Project Intelligence · Aria</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Ask anything about DBS projects, deadlines, team, or regulations.
              </h2>
            </div>

            {/* Starter prompts */}
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
  );
}
