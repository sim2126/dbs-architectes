"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  Calculator,
  ExternalLink,
  FileSearch,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface SourceCard {
  label: string;
  type: string;
  detail: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: string[];
  sources?: SourceCard[];
  followUps?: string[];
}

const PROMPT_GROUPS = [
  {
    title: "Regulations",
    icon: BookOpen,
    prompts: [
      "What are the VSS standards for residential parking?",
      "Explain RCCZ building height constraints in Sion.",
      "Summarize PROCAP accessibility requirements for common areas.",
    ],
  },
  {
    title: "Calculations",
    icon: Calculator,
    prompts: [
      "Calculate the maximum usable area for an 800 m2 plot.",
      "Estimate parking requirements for a 12-unit residential project.",
      "What apartment mix is required for a typical condominium?",
    ],
  },
  {
    title: "DBS Standards",
    icon: Building2,
    prompts: [
      "What are the DBS minimum sizes for 3.5-room apartments?",
      "Which internal standards apply to apartment heights?",
      "Which DBS SOP applies before permit submission?",
    ],
  },
];

const TRUSTED_SOURCES: SourceCard[] = [
  { label: "VSS 40 281", type: "Swiss standard", detail: "Parking, mobility, and access logic" },
  { label: "RCCZ Sion", type: "Municipal regulation", detail: "Planning, height, and urban rules" },
  { label: "PROCAP", type: "Accessibility", detail: "Universal access and inclusive design" },
  { label: "DBS OPS Manual", type: "Internal knowledge", detail: "SOPs, standards, and project heuristics" },
];

function getResponse(input: string): Omit<Message, "id" | "role"> {
  const normalized = input.toLowerCase();

  if (normalized.includes("parking")) {
    return {
      content: "Parking requirements overview",
      blocks: [
        "For residential projects, the usual starting point is one space per apartment, then adjust according to transport access and urban context.",
        "For DBS workflow, the useful AI output is not only a raw number. It should also explain the assumptions, reductions, and the regulation source used.",
        "To produce a final answer for a real project, the AI should request municipality, apartment count, commercial surface if any, and public transport conditions.",
      ],
      sources: [
        { label: "VSS 40 281", type: "Swiss standard", detail: "Parking calculation framework" },
        { label: "DBS OPS Manual", type: "Internal knowledge", detail: "Project calculation workflow" },
      ],
      followUps: [
        "Run a parking estimate for 12 apartments",
        "What reductions apply in city-center locations?",
      ],
    };
  }

  if (normalized.includes("procap") || normalized.includes("access")) {
    return {
      content: "Accessibility compliance summary",
      blocks: [
        "The answer should separate common-area accessibility, unit accessibility, and circulation requirements so the user can act on the result immediately.",
        "For client-facing output, DBS GPT should cite the relevant source, explain the design implication, and point to the internal standard or precedent if available.",
        "The most convincing experience in demo mode is showing both the regulation source and the operational next step for the team.",
      ],
      sources: [
        { label: "PROCAP", type: "Accessibility", detail: "Inclusive access requirements" },
        { label: "DBS OPS Manual", type: "Internal knowledge", detail: "Internal design checklist" },
      ],
      followUps: [
        "Summarize circulation-width requirements",
        "Show common-area accessibility checklist",
      ],
    };
  }

  if (normalized.includes("3.5") || normalized.includes("apartment")) {
    return {
      content: "DBS standards summary",
      blocks: [
        "DBS GPT should answer apartment questions as a structured standards card, not only chat text.",
        "For 3.5-room units, the platform can present minimum area, typical layout guidance, and any internal exceptions or project notes.",
        "This is where the product becomes AI-native: it combines regulations, DBS practice, and precedent retrieval in one response.",
      ],
      sources: [
        { label: "DBS OPS Manual", type: "Internal knowledge", detail: "Apartment sizing standards" },
        { label: "Planning AI", type: "Cross-tool link", detail: "Relevant plan precedents and apartment mixes" },
      ],
      followUps: [
        "Find relevant 3.5-room precedents",
        "Compare DBS standard sizes by apartment type",
      ],
    };
  }

  return {
    content: "Operational response generated",
    blocks: [
      "DBS OPS MANUAL GPT is positioned as an operational copilot for regulations, calculations, and internal know-how.",
      "In production, each answer should combine a concise summary, cited sources, and suggested next actions for the project team.",
      "The most persuasive demo pattern is: answer, evidence, then workflow recommendation.",
    ],
    sources: [
      { label: "DBS OPS Manual", type: "Internal knowledge", detail: "Operational workflow guidance" },
      { label: "Swiss regulations stack", type: "Knowledge base", detail: "VSS, RCCZ, PROCAP and related standards" },
    ],
    followUps: [
      "Show source-backed compliance answer format",
      "What project data should the AI ask for next?",
    ],
  };
}

export default function DBSGPTPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiMode, setApiMode] = useState<"live" | "demo" | "unknown">("unknown");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(0);

  const quickPrompts = useMemo(() => PROMPT_GROUPS.flatMap((group) => group.prompts).slice(0, 5), []);

  function createMessageId(role: Message["role"]) {
    messageSequence.current += 1;
    return `${role}-${messageSequence.current}`;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check API availability on mount
  useEffect(() => {
    if (!API_URL) { setApiMode("demo"); return; }
    fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => setApiMode(r.ok ? "live" : "demo"))
      .catch(() => setApiMode("demo"));
  }, []);

  async function callLiveAPI(content: string): Promise<Omit<Message, "id" | "role">> {
    // Submit task
    const submitRes = await fetch(`${API_URL}/api/agents/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        project_id: null,
        thread_id: `gpt-${session?.user?.email ?? "anon"}`,
      }),
    });

    if (!submitRes.ok) throw new Error("submit_failed");
    const { task_id } = await submitRes.json();

    // Poll until done (max 60s)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(`${API_URL}/api/agents/tasks/${task_id}`);
      if (!pollRes.ok) continue;
      const data = await pollRes.json();

      if (data.status === "SUCCESS" && data.result) {
        const result = data.result;
        return {
          content: result.response ?? result.final_response ?? "Response received",
          blocks: result.blocks ?? [],
          sources: result.sources ?? [],
          followUps: result.follow_ups ?? result.followUps ?? [],
        };
      }
      if (data.status === "FAILURE") throw new Error("agent_failed");
    }
    throw new Error("timeout");
  }

  async function sendMessage(content: string) {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: createMessageId("user"),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      let response: Omit<Message, "id" | "role">;

      if (apiMode === "live") {
        try {
          response = await callLiveAPI(content);
        } catch {
          // Fallback to demo if live call fails
          response = getResponse(content);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 900));
        response = getResponse(content);
      }

      setMessages((prev) => [
        ...prev,
        { id: createMessageId("assistant"), role: "assistant", ...response },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_30%,#f7f7f8_100%)]">
      <div className="border-b border-border bg-background/80 px-6 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">DBS OPS MANUAL GPT</h1>
              <p className="text-xs text-muted-foreground">
                Swiss regulations, DBS standards, calculations, and operational SOPs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">
              Source-backed responses
            </Badge>
            {apiMode === "live" ? (
              <Badge variant="success" className="text-xs">
                Live API
              </Badge>
            ) : apiMode === "demo" ? (
              <Badge variant="secondary" className="text-xs">
                Demo mode
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Connecting…
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border-white/80 bg-white/85 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">Trusted knowledge stack</p>
              </div>
              <div className="mt-4 space-y-3">
                {TRUSTED_SOURCES.map((source) => (
                  <div key={source.label} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{source.label}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {source.type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{source.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/80 bg-white/85 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
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
                          className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
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

        <div className="flex min-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto p-6">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-4xl"
              >
                <div className="rounded-[30px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#155e75_100%)] p-8 text-white shadow-[0_28px_70px_rgba(15,23,42,0.2)]">
                  <Badge className="bg-white/12 text-[11px] text-white">Operational AI for DBS</Badge>
                  <h2 className="mt-5 text-4xl font-semibold tracking-tight">
                    Ask regulations, calculations, internal standards, and process questions from one place.
                  </h2>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75">
                    The demo is designed to show a production-grade answer format: clear response, evidence, and a next-step recommendation for the team.
                  </p>

                  <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {[
                      {
                        title: "Source-backed",
                        body: "Every answer should point to the regulation or DBS knowledge source used.",
                      },
                      {
                        title: "Action-oriented",
                        body: "The AI explains what to do next, not only what the rule says.",
                      },
                      {
                        title: "Cross-linked",
                        body: "Responses can point into planning precedents and visual references.",
                      },
                    ].map((item) => (
                      <div key={item.title} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-2 text-xs leading-6 text-white/72">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {quickPrompts.map((prompt) => (
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
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl space-y-6">
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.role === "assistant" && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[86%] rounded-[26px] px-4 py-4 ${
                          message.role === "user"
                            ? "bg-foreground text-background"
                            : "border border-border bg-white shadow-sm"
                        }`}
                      >
                        {message.role === "user" ? (
                          <p className="text-sm leading-7">{message.content}</p>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{message.content}</p>
                              <div className="mt-3 space-y-3">
                                {message.blocks?.map((block) => (
                                  <p key={block} className="text-sm leading-7 text-muted-foreground">
                                    {block}
                                  </p>
                                ))}
                              </div>
                            </div>

                            {message.sources && (
                              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/30">
                                <div className="mb-3 flex items-center gap-2">
                                  <BookOpen className="h-4 w-4 text-blue-600" />
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Sources consulted
                                  </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {message.sources.map((source) => (
                                    <div key={source.label} className="rounded-2xl border border-border bg-white p-3 dark:bg-background">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">{source.label}</p>
                                        <Badge variant="outline" className="text-[10px]">
                                          {source.type}
                                        </Badge>
                                      </div>
                                      <p className="mt-1 text-xs leading-6 text-muted-foreground">{source.detail}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {message.followUps && (
                              <div className="flex flex-wrap gap-2">
                                {message.followUps.map((followUp) => (
                                  <button
                                    key={followUp}
                                    onClick={() => sendMessage(followUp)}
                                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                                  >
                                    {followUp}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {message.role === "user" && (
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-muted text-xs">
                            {session?.user.name?.slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-[26px] border border-border bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating a source-backed response
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          <div className="border-t border-border bg-background/90 p-4">
            <div className="mx-auto max-w-4xl">
              <div className="flex gap-3">
                <Textarea
                  placeholder="Ask regulations, standards, calculations, or operational workflow questions"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[56px] max-h-[140px] resize-none rounded-2xl border-white/80 bg-white"
                  rows={1}
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  size="icon"
                  className="h-14 w-14 rounded-2xl"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Demo answer format: summary, evidence, and recommended next action.
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Hi DBS knowledge links
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Cross-tool AI recommendations
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
