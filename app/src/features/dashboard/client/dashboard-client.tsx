"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarClock, Clock3, Gauge, Sparkles, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import { FRIDAY_TOKENS, getPhaseColor } from "@/ui/tokens";
import { translatePhase, useT } from "@/i18n/translations";
import { formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────

export type RoleTier = "admin" | "lead" | "employee";

export interface KpiCard {
  label: string;
  value: number;
  sub: string;
  href: string;
  tone: "default" | "warn";
}

export type AttentionSeverity = "off_track" | "at_risk" | "stale" | "silent";

export interface AttentionItem {
  projectId: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  severity: AttentionSeverity;
  daysSinceStatus: number | null;
  lastAuthor: { name: string | null; initials: string | null } | null;
  lastSummary: string | null;
}

export type WorkloadLoad = "light" | "balanced" | "heavy" | "overloaded";

export interface TeamLoadItem {
  userId: string;
  name: string | null;
  email: string;
  initials: string | null;
  role: string;
  projectsActive: number;
  tasksOpen: number;
  tasksOverdue: number;
  agendaOverdue: number;
  load: WorkloadLoad;
  score: number;
}

export interface DashboardData {
  kpis: [KpiCard, KpiCard, KpiCard];
  todayFocus: Array<{
    id: string;
    title: string;
    date: string;
    type: string;
    priority: string;
    project: { code: string; title: string } | null;
  }>;
  whatChanged: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name?: string | null; initials?: string | null } | null;
    project: { code: string; title: string } | null;
  }>;
  starred: Array<{
    id: string;
    code: string;
    title: string;
    image?: string | null;
    phase: string;
    commune?: string | null;
    country?: string | null;
  }>;
  /** Manager-only — undefined for the employee tier. */
  needsAttention?: AttentionItem[];
  /** Manager-only — top N most-loaded teammates, undefined otherwise. */
  teamLoad?: TeamLoadItem[];
}

interface DashboardClientProps {
  user: { name?: string | null; role?: string | null; email?: string | null };
  tier: RoleTier;
  data: DashboardData;
}

// ── Helpers ───────────────────────────────────────────────────

const ROLE_LABEL: Record<RoleTier, string> = {
  admin: "Studio overview",
  lead: "Your portfolio",
  employee: "Your day",
};

function priorityTone(p: string) {
  if (p === "critical" || p === "high") return "bg-rose-400";
  if (p === "medium") return "bg-amber-400";
  return "bg-emerald-400";
}

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

// ── Component ─────────────────────────────────────────────────

export function DashboardClient({ user, tier, data }: DashboardClientProps) {
  const t = useT();
  const firstName = user.name?.split(" ")[0] || "there";
  const today = new Date();
  const dateLine = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1320px] mx-auto px-6 sm:px-8 py-8 sm:py-10 space-y-10">

        {/* ── Greeting ─────────────────────────────────────── */}
        <motion.div {...fade(0)} className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {ROLE_LABEL[tier]} · {dateLine}
          </p>
          <h1 className="font-display italic text-foreground leading-[1.05] text-4xl sm:text-5xl">
            {greetingByHour()},{" "}
            <span className="text-foreground">{firstName}.</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            {tier === "admin" && "A quiet picture of the studio. Three numbers worth looking at, then your day."}
            {tier === "lead"  && "Your projects, your team, what changed since you last looked."}
            {tier === "employee" && "What's on your plate today. The rest can wait."}
          </p>
        </motion.div>

        {/* ── 3 KPI cards ──────────────────────────────────── */}
        <motion.div {...fade(0.05)} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.kpis.map((kpi, i) => (
            <Link
              key={kpi.label + i}
              href={kpi.href}
              className="group block rounded-2xl border border-border bg-card hover:border-foreground/25 transition-colors px-5 py-5"
            >
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {kpi.label}
                </p>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
              </div>
              <p
                className={`font-display italic mt-3 leading-none tabular-nums ${
                  kpi.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-foreground"
                }`}
                style={{ fontSize: "44px", fontWeight: 500 }}
              >
                {kpi.value}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{kpi.sub}</p>
            </Link>
          ))}
        </motion.div>

        {/* ── Today's Focus + What Changed ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Today's Focus */}
          <motion.section {...fade(0.1)} className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Today
                </p>
                <h2 className="font-display italic text-foreground text-xl leading-tight mt-0.5">
                  Today&apos;s focus
                </h2>
              </div>
              <Link
                href="/dashboard/agenda"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Agenda
              </Link>
            </header>
            <div className="px-2 py-1">
              {data.todayFocus.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CalendarClock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground italic font-display">
                    Nothing on the calendar today.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.todayFocus.map((item) => (
                    <li key={item.id} className="px-3 py-3 hover:bg-muted/40 rounded-lg transition-colors">
                      <Link href="/dashboard/agenda" className="flex items-start gap-3">
                        <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${priorityTone(item.priority)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock3 className="w-3 h-3 text-muted-foreground/70" />
                            <span className="text-[11px] text-muted-foreground">{timeShort(item.date)}</span>
                            {item.project && (
                              <span className="text-[11px] text-muted-foreground/70 font-mono">
                                · {item.project.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.section>

          {/* What Changed */}
          <motion.section {...fade(0.14)} className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Since you last looked
                </p>
                <h2 className="font-display italic text-foreground text-xl leading-tight mt-0.5">
                  What changed
                </h2>
              </div>
              <Link
                href="/dashboard/activity"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Activity
              </Link>
            </header>
            <div className="px-2 py-1">
              {data.whatChanged.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Sparkles className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground italic font-display">
                    Nothing new — a quiet stretch.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.whatChanged.slice(0, 6).map((act) => (
                    <li key={act.id} className="px-3 py-3 hover:bg-muted/40 rounded-lg transition-colors">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-7 w-7 mt-0.5 shrink-0">
                          <AvatarFallback className="text-[10px] font-semibold bg-muted text-foreground">
                            {act.user?.initials || act.user?.name?.slice(0, 2).toUpperCase() || "·"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{act.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {act.project && (
                              <span className="text-[11px] font-mono text-muted-foreground/70">
                                {act.project.code}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.section>
        </div>

        {/* ── Manager-only: Needs attention + Team load ─── */}
        {(data.needsAttention && data.needsAttention.length > 0) || (data.teamLoad && data.teamLoad.length > 0) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.needsAttention && data.needsAttention.length > 0 && (
              <NeedsAttentionSection items={data.needsAttention} />
            )}
            {data.teamLoad && data.teamLoad.length > 0 && (
              <TeamLoadSection items={data.teamLoad} />
            )}
          </div>
        ) : null}

        {/* ── Starred projects (grayscale scroller) ───────── */}
        {data.starred.length > 0 && (
          <motion.section {...fade(0.18)} className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Starred
                </p>
                <h2 className="font-display italic text-foreground text-2xl leading-tight mt-0.5">
                  Projects you watch
                </h2>
              </div>
              <Link
                href="/dashboard/projects"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                All projects
              </Link>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {data.starred.map((p) => {
                const phaseColor = getPhaseColor(p.phase);
                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/projects/${p.id}`}
                    className="group shrink-0 w-60 rounded-2xl border border-border bg-card hover:border-foreground/25 transition-colors overflow-hidden"
                  >
                    <div className="relative aspect-[4/3] bg-muted/60 overflow-hidden">
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.title}
                          fill
                          sizes="240px"
                          className="object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-display italic text-3xl text-muted-foreground/40">
                            {p.code.slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <span
                        className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-background/90 backdrop-blur-sm text-foreground"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor }} />
                        {translatePhase(p.phase, t)}
                      </span>
                    </div>
                    <div className="px-3.5 py-3">
                      <p className="text-[10px] font-mono text-muted-foreground/80">{p.code}</p>
                      <p className="text-sm text-foreground leading-snug truncate mt-0.5">{p.title}</p>
                      {(p.commune || p.country) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {[p.commune, p.country].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.section>
        )}

        {data.starred.length === 0 && (
          <motion.section {...fade(0.18)} className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-8 text-center">
            <Star className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="font-display italic text-foreground text-lg">
              Nothing starred yet.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Star the projects you watch most — they&apos;ll appear here.
            </p>
            <Link
              href="/dashboard/projects"
              className="inline-block mt-3 text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Browse projects
            </Link>
          </motion.section>
        )}

        {/* ── DBS AI seam (quiet AI invocation) ─────────── */}
        <motion.div {...fade(0.22)} className="rounded-2xl bg-muted/40 border border-border/60 px-5 py-4 flex items-center gap-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border shrink-0">
            <Sparkles className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground font-medium">
              Ask DBS AI about your projects.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Grounded in your phases, your team, your last meetings — not a generic chatbot.
            </p>
          </div>
          <Link
            href="/dashboard/ai/gpt"
            className="text-xs font-medium text-foreground border border-border bg-card px-3 py-1.5 rounded-full hover:border-foreground/40 transition-colors shrink-0"
          >
            Open DBS AI
          </Link>
        </motion.div>

      </div>
    </div>
  );
}

// ── Needs attention ──────────────────────────────────────────────────
// PM-dashboard widget. Surfaces projects whose latest status update is
// off_track / at_risk, or whose status is stale or silent. Severity sets
// the dot colour; the row links straight into the project detail.

const SEVERITY_META: Record<
  AttentionSeverity,
  { label: string; tone: "rose" | "amber" | "slate"; dot: string }
> = {
  off_track: { label: "Off track", tone: "rose",  dot: FRIDAY_TOKENS.health.offTrack.color },
  at_risk:   { label: "At risk",   tone: "amber", dot: FRIDAY_TOKENS.health.atRisk.color },
  stale:     { label: "Stale",     tone: "slate", dot: FRIDAY_TOKENS.fgSubtle },
  silent:    { label: "No status", tone: "slate", dot: FRIDAY_TOKENS.fgSubtle },
};

const SEVERITY_PILL_CLASS: Record<"rose" | "amber" | "slate", string> = {
  rose:  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  slate: "bg-muted text-muted-foreground",
};

function NeedsAttentionSection({ items }: { items: AttentionItem[] }) {
  return (
    <motion.section {...fade(0.18)} className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Pulse
          </p>
          <h2 className="font-display italic text-foreground text-xl leading-tight mt-0.5">
            Needs attention
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="w-3 h-3" />
          {items.length}
        </span>
      </header>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const meta = SEVERITY_META[item.severity];
          return (
            <li key={item.projectId} className="px-5 py-3">
              <Link
                href={`/dashboard/projects/${item.projectId}#status`}
                className="group flex items-start gap-3"
              >
                <span
                  className="w-2 h-2 rounded-full mt-2 shrink-0"
                  style={{ background: meta.dot }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium tracking-wide ${SEVERITY_PILL_CLASS[meta.tone]}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {item.code}
                    </span>
                    <span className="text-sm text-foreground truncate group-hover:underline underline-offset-2 min-w-0">
                      {item.title}
                    </span>
                  </div>
                  {item.lastSummary ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                      {item.lastSummary}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic mt-1">
                      No status update yet — chase the project lead for a pulse.
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-muted-foreground/80">
                    {item.daysSinceStatus === null ? (
                      <span>Silent — never posted</span>
                    ) : item.daysSinceStatus === 0 ? (
                      <span>Updated today</span>
                    ) : (
                      <span>
                        Updated {item.daysSinceStatus} day{item.daysSinceStatus === 1 ? "" : "s"} ago
                      </span>
                    )}
                    {item.lastAuthor?.name && (
                      <span className="text-muted-foreground/70">
                        · by {item.lastAuthor.name}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

// ── Compact team load ────────────────────────────────────────────────
// Pairs with /dashboard/team-workload. Shows the top 5 most-loaded
// teammates with their open task / overdue counts and a load pill.

const LOAD_PILL_CLASS: Record<WorkloadLoad, string> = {
  light:      "bg-muted text-muted-foreground",
  balanced:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  heavy:      "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  overloaded: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const LOAD_LABEL: Record<WorkloadLoad, string> = {
  light: "Light",
  balanced: "Balanced",
  heavy: "Heavy",
  overloaded: "Overloaded",
};

function TeamLoadSection({ items }: { items: TeamLoadItem[] }) {
  return (
    <motion.section {...fade(0.18)} className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Capacity
          </p>
          <h2 className="font-display italic text-foreground text-xl leading-tight mt-0.5">
            Team load
          </h2>
        </div>
        <Link
          href="/dashboard/team-workload"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Gauge className="w-3 h-3" />
          Full view
        </Link>
      </header>
      <ul className="divide-y divide-border/60">
        {items.map((m) => {
          const initials = m.initials ?? m.name?.slice(0, 2)?.toUpperCase() ?? "·";
          const displayName = m.name ?? m.email;
          return (
            <li key={m.userId} className="px-5 py-3 flex items-center gap-3">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px] font-semibold bg-muted text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{displayName}</p>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">
                  {m.projectsActive} project{m.projectsActive === 1 ? "" : "s"} ·{" "}
                  {m.tasksOpen} task{m.tasksOpen === 1 ? "" : "s"}
                  {m.tasksOverdue + m.agendaOverdue > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      {" "}· {m.tasksOverdue + m.agendaOverdue} overdue
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2 py-px rounded-full text-[10px] font-medium tracking-wide shrink-0 ${LOAD_PILL_CLASS[m.load]}`}
              >
                {LOAD_LABEL[m.load]}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
