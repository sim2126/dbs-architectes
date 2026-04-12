"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Bot, User, Sparkles, Wrench,
  ChevronDown, RotateCcw, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

// ─── Starter prompts ──────────────────────────────────────────

const STARTER_PROMPTS = [
  { icon: "📊", label: "Portfolio overview", prompt: "Give me a portfolio health overview — total projects, phase distribution, and any stuck or blocked items." },
  { icon: "🚨", label: "Blocked projects", prompt: "Which projects are currently stuck or blocked? Show me the team and last update for each." },
  { icon: "📅", label: "Upcoming deadlines", prompt: "What deadlines and milestones are coming up in the next 2 weeks?" },
  { icon: "👥", label: "Team workload", prompt: "Show me a team workload breakdown — who is overloaded and who has capacity?" },
  { icon: "🏗️", label: "Chantier phase", prompt: "List all projects currently in the CHANTIER (construction) phase with their status and team." },
  { icon: "📝", label: "Recent activity", prompt: "What changed in the last 7 days? Summarize recent project updates and activity." },
];

// ─── Tool name display ────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_projects: "Searching project portfolio",
  get_project_details: "Fetching project details",
  get_project_thread: "Reading project thread",
  get_team_messages: "Reading team messages",
  get_agenda: "Checking agenda & deadlines",
  get_team_workload: "Analysing team workload",
  get_statistics: "Computing portfolio statistics",
  get_activity_log: "Loading activity log",
};

// ─── Markdown renderer ────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ ...props }) => (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full text-xs border border-border rounded-lg overflow-hidden" {...props} />
          </div>
        ),
        thead: ({ ...props }) => <thead className="bg-muted/50" {...props} />,
        th: ({ ...props }) => (
          <th className="px-3 py-2 text-left font-semibold text-muted-foreground border-b border-border text-[11px] uppercase tracking-wider" {...props} />
        ),
        td: ({ ...props }) => <td className="px-3 py-2 border-b border-border/50" {...props} />,
        tr: ({ ...props }) => <tr className="hover:bg-muted/20 transition-colors" {...props} />,
        code: ({ children, ...props }) => (
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
        ),
        blockquote: ({ ...props }) => (
          <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic my-2" {...props} />
        ),
        h3: ({ ...props }) => <h3 className="text-sm font-bold mt-4 mb-1.5" {...props} />,
        h2: ({ ...props }) => <h2 className="text-sm font-bold mt-4 mb-1.5" {...props} />,
        p: ({ ...props }) => <p className="text-sm leading-relaxed mb-2 last:mb-0" {...props} />,
        li: ({ ...props }) => <li className="text-sm leading-relaxed" {...props} />,
        ul: ({ ...props }) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal pl-4 space-y-1 my-2" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Message component ────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-foreground text-background px-4 py-2.5 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolCalls.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-[10px] text-violet-700 dark:text-violet-300 font-medium"
              >
                <Wrench className="w-2.5 h-2.5" />
                {TOOL_LABELS[tool] ?? tool}
              </span>
            ))}
          </div>
        )}
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 relative">
          {message.isStreaming && !message.content ? (
            <div className="flex items-center gap-1.5 py-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ delay: i * 0.15, repeat: Infinity, duration: 0.7 }}
                />
              ))}
            </div>
          ) : (
            <MarkdownContent content={message.content} />
          )}
          {!message.isStreaming && message.content && (
            <button
              onClick={copy}
              className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", isStreaming: true, toolCalls: [] };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);
    setActiveTools([]);

    // Build history for API (exclude current streaming message)
    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const allToolCalls: string[] = [];

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
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              );
            } else if (event.type === "tool_start" && event.tools) {
              setActiveTools(event.tools);
              event.tools.forEach((t) => {
                if (!allToolCalls.includes(t)) allToolCalls.push(t);
              });
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolCalls: [...allToolCalls] } : m
                )
              );
            } else if (event.type === "tool_result") {
              setActiveTools([]);
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
                    ? { ...m, content: `⚠️ Error: ${event.message}`, isStreaming: false }
                    : m
                )
              );
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ Failed to connect to agent: ${String(err)}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
      setActiveTools([]);
    }
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    setActiveTools([]);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm">Aria</h1>
            <p className="text-xs text-muted-foreground">DBS Project Intelligence Agent</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-200 dark:border-emerald-800">
            LIVE
          </span>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" /> New conversation
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 relative">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-bold mb-1">What would you like to know?</h2>
            <p className="text-sm text-muted-foreground text-center mb-8 max-w-sm">
              I have full visibility into the DBS project portfolio — phases, team, deadlines, threads, and activity.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full">
              {STARTER_PROMPTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendMessage(s.prompt)}
                  className="text-left p-3.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-foreground/20 transition-all group"
                >
                  <span className="text-lg block mb-1.5">{s.icon}</span>
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{s.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5 pb-4">
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MessageBubble message={msg} />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Active tool indicator */}
            <AnimatePresence>
              {activeTools.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="flex items-center gap-2 pl-10"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                    <Loader2 className="w-3 h-3 animate-spin text-violet-600 dark:text-violet-400" />
                    <span className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                      {TOOL_LABELS[activeTools[0]] ?? activeTools[0]}…
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div ref={bottomRef} />

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => scrollToBottom()}
              className="fixed bottom-24 right-8 w-8 h-8 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="border-t border-border px-6 py-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about projects, deadlines, team workload, blockers…"
                disabled={loading}
                rows={1}
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground transition-all disabled:opacity-50"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
            </div>
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              size="icon"
              className="h-11 w-11 rounded-xl shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 border-0 shadow-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Aria has read-only access to DBS project data · Powered by GPT-4o
          </p>
        </div>
      </div>
    </div>
  );
}
