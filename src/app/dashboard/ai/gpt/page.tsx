"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Bot,
  User,
  BookOpen,
  Calculator,
  FileText,
  Building2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  "What are the VSS standards for residential parking?",
  "Calculate the maximum usable area (SP max) for an 800m² plot",
  "How many housing units are required by type in a condominium?",
  "RCCZ regulations for building heights in Sion",
  "PROCAP requirements for accessibility",
  "DBS standard apartment dimensions for 3.5 rooms",
];

const FEATURES = [
  {
    icon: BookOpen,
    title: "Swiss Regulations",
    desc: "VSS, RCCZ, local and national standards",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
  },
  {
    icon: Building2,
    title: "DBS Standards",
    desc: "Apartment dimensions, heights, best practices",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  {
    icon: Calculator,
    title: "Automatic Calculations",
    desc: "SP max., parking, utilization indices",
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/20",
  },
  {
    icon: FileText,
    title: "PROCAP & Accessibility",
    desc: "Universal access standards",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
  },
];

export default function DBSGPTPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Simulate AI response (in production, call Claude API)
    await new Promise((r) => setTimeout(r, 1500));

    const responses: Record<string, string> = {
      default: `As DBS OPS MANUAL GPT, I can help you with:\n\n**Applicable regulations:**\n- VSS (Swiss road standards)\n- RCCZ (Sion municipal regulations)\n- PROCAP (Accessibility)\n\n**DBS internal standards:**\n- 2.5-room apartment: min. 52m²\n- 3.5-room apartment: min. 68m²\n- 4.5-room apartment: min. 88m²\n\nFor specific calculations, provide your project data (municipality, plot dimensions, utilization index).`,
      parking: `**Parking Calculation (VSS 40 281):**\n\nFor residential use:\n- 1 space/apartment (standard)\n- 0.8 spaces/apt in zones served by public transport\n\nFor commercial use:\n- 1 space/50m² of sales area\n\n**Possible reductions:**\n- Good public transport access: -20%\n- City center: -30%\n\nWould you like me to calculate the exact number for your project?`,
    };

    const isParking =
      content.toLowerCase().includes("parking") ||
      content.toLowerCase().includes("parcheggi");
    const response = isParking ? responses.parking : responses.default;

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-foreground rounded-xl">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="text-lg font-bold">DBS OPS MANUAL GPT</h1>
              <p className="text-xs text-muted-foreground">
                AI trained on Swiss regulations · v5.1
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              Online
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto p-6">
              {/* Welcome */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-foreground rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-background" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">DBS OPS MANUAL</h2>
                  <p className="text-muted-foreground">
                    This GPT helps employees understand the company's SOPs and Swiss building regulations
                  </p>
                </div>

                {/* Features */}
                <div className="grid grid-cols-2 gap-3">
                  {FEATURES.map((f) => (
                    <div
                      key={f.title}
                      className="p-4 rounded-xl border border-border hover:border-muted-foreground/30 transition-colors"
                    >
                      <div className={`inline-flex p-2 rounded-lg ${f.bg} mb-3`}>
                        <f.icon className={`w-4 h-4 ${f.color}`} />
                      </div>
                      <p className="text-sm font-semibold">{f.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Suggested questions:
                  </p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent transition-colors text-sm group flex items-center gap-2"
                      >
                        <span className="flex-1">{s}</span>
                        <Send className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-center">
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Hi DBS (Italian)
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Hi DBS (English)
                  </Button>
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-background" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-foreground text-background rounded-br-sm"
                          : "bg-muted rounded-bl-sm"
                      }`}
                    >
                      <div
                        className="whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                            .replace(/\n/g, "<br/>")
                            .replace(/- (.*)/g, "• $1"),
                        }}
                      />
                    </div>
                    {msg.role === "user" && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs bg-muted">
                          {session?.user.name?.slice(0, 2).toUpperCase() || "ME"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </motion.div>
                ))}
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-background" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1 items-center h-4">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -4, 0] }}
                            transition={{ repeat: Infinity, delay: i * 0.15, duration: 0.6 }}
                            className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input area */}
          <div className="p-4 border-t border-border bg-background">
            <div className="max-w-3xl mx-auto flex gap-3">
              <Textarea
                placeholder="Ask something... (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[48px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                size="icon"
                className="h-12 w-12 shrink-0"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              DBS GPT · Model trained on Swiss regulations and DBS standards
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
