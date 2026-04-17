"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  Users,
  Activity,
  MapPin,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PHASE_COLORS, COUNTRIES } from "@/lib/utils";
import { useT, translatePhase } from "@/lib/translations";
import { formatDistanceToNow } from "date-fns";

interface DashboardClientProps {
  user: { name?: string | null; role?: string; email?: string };
  stats: {
    projectCount: number;
    activeProjects: number;
    userCount: number;
    assignedCount: number;
    unassignedCount: number;
    blockedProjects: number;
    phaseStats: { phase: string; count: number }[];
    workStatusStats: { status: string; count: number }[];
    regionStats: { country: string; count: number }[];
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name?: string | null; initials?: string | null } | null;
    project: { title: string; code: string } | null;
  }>;
  upcomingAgenda: Array<{
    id: string;
    title: string;
    date: string;
    priority: string;
    project: { title: string; code: string } | null;
  }>;
}

const ROLE_CONFIG: Record<string, { label: string; accent: string; icon: React.ElementType }> = {
  super_admin:     { label: "Executive",      accent: "from-slate-950 to-slate-800",         icon: ShieldCheck },
  admin:           { label: "Admin",          accent: "from-slate-950 to-slate-800",         icon: ShieldCheck },
  director:        { label: "Director",       accent: "from-blue-950 to-indigo-900",         icon: TrendingUp  },
  manager:         { label: "Manager",        accent: "from-teal-900 to-cyan-800",           icon: TimerReset  },
  project_manager: { label: "Project Mgr",   accent: "from-teal-900 to-cyan-800",           icon: TimerReset  },
  employee:        { label: "Employee",       accent: "from-violet-900 to-indigo-800",       icon: CheckCircle2},
  collaborator:    { label: "Collaborator",   accent: "from-violet-900 to-indigo-800",       icon: CheckCircle2},
  intern:          { label: "Intern",         accent: "from-slate-800 to-slate-700",         icon: BarChart3   },
  viewer:          { label: "Viewer",         accent: "from-slate-800 to-slate-700",         icon: BarChart3   },
};

const STATUS_META = [
  { key: "todo",      label: "Not Started",   color: "#c4c4cf" },
  { key: "doing",     label: "Working on it", color: "#fdab3d" },
  { key: "stuck",     label: "Stuck",         color: "#e2445c" },
  { key: "completed", label: "Done",          color: "#00c875" },
];

function getPriorityColor(p: string) {
  if (p === "critical" || p === "high") return "bg-red-500";
  if (p === "medium") return "bg-amber-400";
  return "bg-emerald-400";
}

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] },
});

export function DashboardClient({ user, stats, recentActivity, upcomingAgenda }: DashboardClientProps) {
  const t = useT();
  const role = user.role || "viewer";
  const rc = ROLE_CONFIG[role] || ROLE_CONFIG.viewer;
  const RoleIcon = rc.icon;
  const firstName = user.name?.split(" ")[0] || "User";

  const pieData = stats.phaseStats.map((s) => ({
    name: translatePhase(s.phase, t),
    value: s.count,
    color: PHASE_COLORS[s.phase] || "#94a3b8",
  }));

  const statusRows = STATUS_META.map((s) => ({
    ...s,
    count: stats.workStatusStats.find((w) => w.status === s.key)?.count ?? 0,
  }));
  const statusTotal = statusRows.reduce((sum, r) => sum + r.count, 0) || 1;

  const avgLoad = stats.userCount > 0 ? (stats.assignedCount / stats.userCount).toFixed(1) : "0";

  const aiSignals = [
    { icon: AlertTriangle, text: `${stats.blockedProjects} blocked project${stats.blockedProjects !== 1 ? "s" : ""} need review`, urgent: stats.blockedProjects > 0 },
    { icon: Users,         text: `${stats.unassignedCount} project${stats.unassignedCount !== 1 ? "s" : ""} still need ownership`, urgent: stats.unassignedCount > 2 },
    { icon: CalendarClock, text: `${upcomingAgenda.length} agenda item${upcomingAgenda.length !== 1 ? "s" : ""} sequenced and upcoming`, urgent: false },
  ];

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">

        {/* ── Row 1: Hero banner ── */}
        <motion.div {...fade(0)} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${rc.accent} p-6`}>
          {/* Subtle noise overlay */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")" }} />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Left: identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
                  <RoleIcon className="w-3.5 h-3.5 text-white/80" />
                </div>
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">{rc.label}</span>
              </div>
              <h1 className="text-2xl font-semibold text-white leading-tight">
                {firstName}, {t("dashboard.greeting")}
              </h1>
              <p className="mt-1 text-sm text-white/50 leading-relaxed max-w-lg">
                Portfolio snapshot as of today. {stats.blockedProjects > 0 && <span className="text-amber-300 font-medium">{stats.blockedProjects} project{stats.blockedProjects > 1 ? "s" : ""} need attention.</span>}
              </p>
            </div>

            {/* Right: inline KPIs */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap">
              {[
                { label: "Projects",    value: stats.projectCount,   icon: FolderOpen  },
                { label: "Active",      value: stats.activeProjects, icon: Activity    },
                { label: "Team",        value: stats.userCount,      icon: Users       },
                { label: "Blocked",     value: stats.blockedProjects,icon: AlertTriangle, warn: stats.blockedProjects > 0 },
              ].map((kpi) => (
                <div key={kpi.label} className="flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-xl bg-white/8 border border-white/10 min-w-[64px]">
                  <span className={`text-xl font-bold ${kpi.warn ? "text-amber-300" : "text-white"}`}>{kpi.value}</span>
                  <span className="text-[10px] text-white/50 font-medium tracking-wide">{kpi.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Row 2: 4 metric cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t("dashboard.total_projects"),  value: stats.projectCount,    sub: `${stats.unassignedCount} unassigned`, icon: FolderOpen,    href: "/dashboard/projects",   accent: "#3b82f6" },
            { label: t("dashboard.active_delivery"), value: stats.activeProjects,  sub: "currently in progress",              icon: Activity,      href: "/dashboard/projects",   accent: "#10b981" },
            { label: t("dashboard.active_team"),     value: stats.userCount,       sub: `avg load ${avgLoad}×`,               icon: Users,         href: "/dashboard/users",      accent: "#8b5cf6" },
            { label: t("dashboard.blocked"),         value: stats.blockedProjects, sub: "projects in STUCK phase",            icon: AlertTriangle, href: "/dashboard/statistics", accent: "#f59e0b", warn: stats.blockedProjects > 0 },
          ].map((card, i) => (
            <motion.div key={card.label} {...fade(0.06 * i)}>
              <Link href={card.href}>
                <div className="group relative bg-card border border-border rounded-xl p-5 hover:shadow-md hover:border-foreground/15 transition-all cursor-pointer overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 rounded-t-xl" style={{ background: card.accent }} />
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: card.accent + "18" }}>
                      <card.icon className="w-4 h-4" style={{ color: card.accent }} />
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>
                  <p className={`text-3xl font-bold leading-none ${card.warn ? "text-amber-500" : ""}`}>{card.value}</p>
                  <p className="text-sm font-medium text-foreground mt-1.5">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* ── Row 3: Phase chart | AI signals | Agenda ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px_320px] gap-4">

          {/* Phase distribution */}
          <motion.div {...fade(0.12)}>
            <div className="bg-card border border-border rounded-xl p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">{t("dashboard.phase_distribution")}</p>
                <Link href="/dashboard/statistics" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  Details <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", border: "1px solid var(--border)", background: "var(--background)", fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="flex-1 text-xs text-muted-foreground truncate">{item.name}</span>
                      <span className="text-xs font-bold tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* AI signals */}
          <motion.div {...fade(0.16)}>
            <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-sm font-semibold">AI Signals</p>
              </div>
              <div className="flex-1 space-y-2">
                {aiSignals.map((sig, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${sig.urgent ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40" : "bg-muted/40"}`}>
                    <sig.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${sig.urgent ? "text-amber-500" : "text-muted-foreground"}`} />
                    <p className={`text-xs leading-relaxed ${sig.urgent ? "text-amber-700 dark:text-amber-300 font-medium" : "text-muted-foreground"}`}>{sig.text}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/dashboard/projects" className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-accent transition-colors group">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Projects</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link href="/dashboard/agenda" className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-accent transition-colors group">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Agenda</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Upcoming agenda */}
          <motion.div {...fade(0.2)}>
            <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">{t("dashboard.upcoming_agenda")}</p>
                <Link href="/dashboard/agenda" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex-1 space-y-2.5 overflow-hidden">
                {upcomingAgenda.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                    <CalendarClock className="w-8 h-8 text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground">{t("dashboard.no_upcoming")}</p>
                  </div>
                ) : (
                  upcomingAgenda.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${getPriorityColor(item.priority)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug truncate">{item.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock3 className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{new Date(item.date).toLocaleDateString("en-GB")}</span>
                          {item.project && <span className="text-[10px] text-muted-foreground font-mono">{item.project.code}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Row 4: Work status breakdown ── */}
        <motion.div {...fade(0.24)}>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">{t("dashboard.tasks_by_status")}</p>
              <span className="text-xs text-muted-foreground">{statusTotal} total</span>
            </div>
            <div className="flex h-3 w-full rounded-full overflow-hidden gap-px mb-4">
              {statusRows.map((r) => r.count > 0 && (
                <div key={r.key} style={{ width: `${(r.count / statusTotal) * 100}%`, background: r.color }} title={`${r.label}: ${r.count}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statusRows.map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: r.color }} />
                  <div>
                    <p className="text-sm font-bold leading-none">{r.count}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.label}</p>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">{Math.round((r.count / statusTotal) * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Row 5: Activity | AI Workflow ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Recent activity */}
          <motion.div {...fade(0.28)}>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">{t("dashboard.recent_activity")}</p>
                <Link href="/dashboard/activity" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">{t("dashboard.no_recent_activity")}</p>
              ) : (
                <div className="space-y-0">
                  {recentActivity.slice(0, 6).map((act, i) => (
                    <div key={act.id} className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
                      <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[9px] font-bold bg-muted text-foreground">
                          {act.user?.initials || act.user?.name?.slice(0, 2).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug line-clamp-1">{act.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {act.project && <span className="text-[10px] font-mono text-muted-foreground">{act.project.code}</span>}
                          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* AI Workflow */}
          <motion.div {...fade(0.32)}>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{t("dashboard.ai_workflow")}</p>
              </div>
              <div className="space-y-2">
                {[
                  { href: "/dashboard/ai/gpt",      icon: Bot,        title: "DBS OPS Manual GPT",  desc: t("dashboard.gpt_desc"),      accent: "#3b82f6" },
                  { href: "/dashboard/ai/gallery",   icon: Building2,  title: "Visual Gallery AI",   desc: t("dashboard.gallery_desc"),  accent: "#10b981" },
                  { href: "/dashboard/ai/planning",  icon: BarChart3,  title: "Planning AI",         desc: t("dashboard.planning_desc"), accent: "#f59e0b" },
                ].map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className="group flex items-center gap-3 px-3 py-3 rounded-xl border border-border hover:border-foreground/15 hover:bg-accent/50 transition-all cursor-pointer">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: item.accent + "15" }}>
                        <item.icon className="w-4 h-4" style={{ color: item.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{item.desc}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Row 6: Regional portfolio ── */}
        {stats.regionStats.length > 0 && (
          <motion.div {...fade(0.36)}>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Regional Portfolio</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {COUNTRIES.map((c) => {
                  const stat = stats.regionStats.find((r) => r.country === c.value);
                  const pct = stat ? Math.round((stat.count / (stats.projectCount || 1)) * 100) : 0;
                  return (
                    <div key={c.value} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                      <span className="text-3xl leading-none shrink-0">{c.flag}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold">{c.label}</p>
                          <span className="text-sm font-bold">{stat?.count ?? 0}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-foreground/30 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{pct}% of portfolio</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
