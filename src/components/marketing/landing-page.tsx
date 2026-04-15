"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Layers3,
  LayoutDashboard,
  LineChart,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const platformPillars = [
  {
    icon: FolderOpen,
    title: "Project command center",
    description:
      "Search, filter, assign, and manage the full lifecycle of DBS projects from one structured workspace.",
    tone: "from-[#dce7ff] via-white to-[#f1f7ff]",
  },
  {
    icon: Brain,
    title: "AI-native workflow",
    description:
      "Bring regulations, precedent images, floor plans, and internal know-how into a unified AI layer.",
    tone: "from-[#e7f7ed] via-white to-[#f5fbf7]",
  },
  {
    icon: Users,
    title: "Role-based operations",
    description:
      "Admins, project managers, and collaborators each get the right level of visibility and control.",
    tone: "from-[#fff1db] via-white to-[#fff8ef]",
  },
];

const aiProducts = [
  {
    label: "DBS OPS MANUAL GPT",
    description:
      "Instant answers across Swiss regulations, DBS standards, SOPs, and calculation logic.",
    chip: "Operational AI",
  },
  {
    label: "Visual Gallery AI",
    description:
      "A precedent engine for renders, facades, materials, and design references with auto-tagging.",
    chip: "Visual Intelligence",
  },
  {
    label: "Planning AI",
    description:
      "Searchable plan intelligence for layouts, building depth, apartment mixes, and typology patterns.",
    chip: "Planning Intelligence",
  },
];

const roleCards = [
  {
    title: "Admin Workspace",
    description:
      "Govern the full platform, team permissions, workload visibility, and operational oversight.",
    bullets: ["Permissions and governance", "Portfolio-wide visibility", "Team capacity balancing"],
    accent: "bg-[#111827]",
  },
  {
    title: "Project Manager Workspace",
    description:
      "Track deadlines, resourcing, updates, and project-specific decisions without management overhead.",
    bullets: ["Delivery priorities", "Upcoming milestones", "AI-assisted coordination"],
    accent: "bg-[#0f766e]",
  },
  {
    title: "Collaborator Workspace",
    description:
      "Focus on assigned work, communicate quickly, and access the right project context instantly.",
    bullets: ["Assigned tasks and agenda", "Fast project search", "Chat, calls, and handoffs"],
    accent: "bg-[#7c3aed]",
  },
];

const liveMoments = [
  { label: "Projects in motion", value: "148", detail: "across study, execution, chantier, and closeout" },
  { label: "AI lookups this week", value: "382", detail: "regulations, standards, and precedent retrieval" },
  { label: "Deadlines coordinated", value: "27", detail: "tasks, milestones, and reviews aligned in agenda" },
];

interface LandingPageProps {
  hasSession: boolean;
}

export function LandingPage({ hasSession }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa_0%,#ffffff_34%,#f7f4ef_100%)] text-foreground">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_top_left,rgba(46,94,255,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(17,24,39,0.12),transparent_34%),radial-gradient(circle_at_65%_30%,rgba(15,118,110,0.12),transparent_28%)]" />

        <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#111827] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(17,24,39,0.18)]">
              DBS
            </div>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">Friday.com</p>
              <p className="text-xs text-muted-foreground">AI-native project workspace</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href={hasSession ? "/dashboard" : "/login"}>
              <Button variant="ghost" className="hidden sm:inline-flex">
                {hasSession ? "Open Workspace" : "Sign In"}
              </Button>
            </Link>
            <Link href={hasSession ? "/dashboard" : "/login"}>
              <Button className="rounded-full px-5">
                {hasSession ? "Go to Dashboard" : "Request Demo Access"}
              </Button>
            </Link>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-16 lg:px-10">
          <section className="grid gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-14">
            <div className="max-w-3xl">
              <Badge className="mb-5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-[#1f2937] shadow-sm">
                Built exclusively for Friday.com
              </Badge>
              <h1 className="font-display text-5xl font-semibold tracking-[-0.04em] text-[#111827] sm:text-6xl lg:text-7xl">
                A professional operating system for architecture delivery.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4b5563]">
                One platform for project search, delivery coordination, team collaboration, and AI-assisted knowledge retrieval.
                Designed to make DBS look structured, modern, and technically ahead of the market.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={hasSession ? "/dashboard" : "/login"}>
                  <Button size="xl" className="rounded-full bg-[#111827] px-7">
                    {hasSession ? "Enter Workspace" : "Open Demo Login"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/dashboard/ai/gpt">
                  <Button size="xl" variant="outline" className="rounded-full border-white/60 bg-white/70 px-7 backdrop-blur">
                    Explore AI Layer
                  </Button>
                </Link>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {liveMoments.map((item) => (
                  <Card
                    key={item.label}
                    className="border-white/70 bg-white/75 shadow-[0_20px_60px_rgba(17,24,39,0.06)] backdrop-blur"
                  >
                    <CardContent className="p-5">
                      <p className="text-3xl font-semibold tracking-tight text-[#111827]">{item.value}</p>
                      <p className="mt-2 text-sm font-medium text-[#111827]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="relative"
            >
              <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(46,94,255,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.18),transparent_35%)] blur-3xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/80 bg-white/80 p-4 shadow-[0_30px_80px_rgba(17,24,39,0.12)] backdrop-blur">
                <div className="rounded-[26px] border border-[#e5e7eb] bg-[#f8fafc] p-4">
                  <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">DBS Workspace Preview</p>
                      <p className="text-xs text-muted-foreground">Search, act, assign, and analyze in one system</p>
                    </div>
                    <Badge variant="success" className="rounded-full px-2.5 py-1 text-[11px]">
                      Live demo ready
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4">
                      <div className="flex items-center gap-2 rounded-2xl border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2.5 text-sm text-muted-foreground">
                        <Search className="h-4 w-4" />
                        Search “3.5 room projects in Sion”
                      </div>

                      <div className="mt-4 space-y-3">
                        {[
                          ["DBS283-10", "Condominium / MAE", "8 units / 2 deadlines this week"],
                          ["DBS328", "Villa / EXE", "Planning AI precedent available"],
                          ["DBS2024-66", "Residential / ETUDE", "Pending client review"],
                        ].map(([code, phase, detail]) => (
                          <div key={code} className="rounded-2xl border border-[#e5e7eb] bg-[#fcfcfd] p-3">
                            <div className="flex items-center justify-between">
                              <p className="font-mono text-xs text-muted-foreground">{code}</p>
                              <Badge variant="secondary" className="text-[10px]">
                                matched
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm font-medium text-[#111827]">{phase}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-[#dbe1ea] bg-[#111827] p-5 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-[#93c5fd]" />
                            <p className="text-sm font-semibold">AI workspace summary</p>
                          </div>
                          <Badge className="rounded-full bg-white/10 text-[10px] text-white">Today</Badge>
                        </div>
                        <p className="mt-4 text-2xl font-semibold leading-tight">
                          3 deadlines require attention and 2 precedent matches are ready for review.
                        </p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          {[
                            ["Delivery risk", "2 projects"],
                            ["AI recommendations", "5 actions"],
                            ["Pending assignments", "4 people"],
                            ["Recent decisions", "9 updates"],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs text-white/70">{label}</p>
                              <p className="mt-1 text-lg font-semibold">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4">
                          <div className="flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-[#0f766e]" />
                            <p className="text-sm font-semibold text-[#111827]">Coordination agenda</p>
                          </div>
                          <div className="mt-4 space-y-3">
                            {["Client review at 10:00", "Facade workshop at 14:00", "Permit checklist due Friday"].map((task) => (
                              <div key={task} className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#0f766e]" />
                                <p className="text-sm text-[#374151]">{task}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-3xl border border-[#e5e7eb] bg-white p-4">
                          <div className="flex items-center gap-2">
                            <LineChart className="h-4 w-4 text-[#1d4ed8]" />
                            <p className="text-sm font-semibold text-[#111827]">Workload snapshot</p>
                          </div>
                          <div className="mt-4 space-y-3">
                            {[
                              ["Execution", "78%"],
                              ["Planning", "62%"],
                              ["Reviews", "49%"],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{label}</span>
                                  <span>{value}</span>
                                </div>
                                <div className="h-2 rounded-full bg-[#eef2f7]">
                                  <div
                                    className="h-2 rounded-full bg-[linear-gradient(90deg,#2563eb,#0f766e)]"
                                    style={{ width: value }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {platformPillars.map((pillar, index) => (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <Card className={`h-full overflow-hidden border-white/80 bg-gradient-to-br ${pillar.tone} shadow-[0_18px_50px_rgba(17,24,39,0.05)]`}>
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <pillar.icon className="h-5 w-5 text-[#111827]" />
                    </div>
                    <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight text-[#111827]">
                      {pillar.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[#4b5563]">{pillar.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </section>

          <section className="rounded-[36px] border border-[#ebeef3] bg-white/85 p-8 shadow-[0_24px_70px_rgba(17,24,39,0.06)] backdrop-blur sm:p-10">
            <div className="max-w-2xl">
              <Badge variant="info" className="rounded-full px-3 py-1 text-[11px]">
                AI Layer
              </Badge>
              <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] text-[#111827]">
                Three AI products, one operational backbone.
              </h2>
              <p className="mt-4 text-base leading-8 text-[#4b5563]">
                The platform is not just project management with an AI tab. The AI layer is positioned as a working partner
                across compliance, precedent retrieval, and planning intelligence.
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {aiProducts.map((product) => (
                <Card key={product.label} className="h-full border-[#e7ebf1] bg-[#fcfcfd] shadow-none">
                  <CardContent className="p-6">
                    <Badge variant="secondary" className="rounded-full text-[10px] uppercase tracking-[0.18em]">
                      {product.chip}
                    </Badge>
                    <p className="mt-4 text-xl font-semibold tracking-tight text-[#111827]">{product.label}</p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{product.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[34px] bg-[#111827] p-8 text-white shadow-[0_24px_60px_rgba(17,24,39,0.18)] sm:p-10">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white">Role-based product design</Badge>
              <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em]">
                Not only for admins.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/75">
                The architecture is already role-aware. The frontend should make that visible, so the DBS client sees a product
                that scales from leadership oversight to day-to-day contributor execution.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  { icon: ShieldCheck, title: "Structured governance", detail: "Permissions, access control, and operational confidence." },
                  { icon: LayoutDashboard, title: "Focused dashboards", detail: "Different priorities surfaced for different jobs." },
                  { icon: MessageSquareText, title: "Faster collaboration", detail: "Chat, calls, activity, and agenda connected to project context." },
                ].map((item) => (
                  <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-[#93c5fd]" />
                      <p className="text-sm font-semibold">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm text-white/70">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {roleCards.map((role) => (
                <Card key={role.title} className="overflow-hidden border-[#e7ebf1] bg-white shadow-[0_18px_45px_rgba(17,24,39,0.05)]">
                  <CardContent className="p-0">
                    <div className="grid gap-0 md:grid-cols-[0.2fr_0.8fr]">
                      <div className={`${role.accent} min-h-full`} />
                      <div className="p-6">
                        <p className="text-xl font-semibold tracking-tight text-[#111827]">{role.title}</p>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{role.description}</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                          {role.bullets.map((bullet) => (
                            <Badge key={bullet} variant="outline" className="rounded-full border-[#d8dee8] bg-[#f8fafc] px-3 py-1 text-[11px]">
                              {bullet}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="rounded-[36px] border border-[#e7ebf1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-8 shadow-[0_18px_50px_rgba(17,24,39,0.05)] sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
              <div>
                <p className="max-w-2xl text-base leading-8 text-[#4b5563]">
                  Demo Only.(Static and Not Live For Use)
                </p>
              </div>

              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Link href={hasSession ? "/dashboard" : "/login"}>
                  <Button size="xl" className="rounded-full bg-[#111827] px-7">
                    {hasSession ? "Launch Workspace" : "Enter Demo"}
                  </Button>
                </Link>
                <Link href="/dashboard/ai/gallery">
                  <Button size="xl" variant="outline" className="rounded-full px-7">
                    Preview AI Showcase
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
