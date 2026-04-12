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
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PHASE_COLORS } from "@/lib/utils";
import { useT, translatePhase } from "@/lib/translations";

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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const ROLE_CONFIG: Record<
  string,
  {
    label: string;
    summary: string;
    icon: React.ElementType;
    accent: string;
    badge: "default" | "info" | "success" | "warning" | "secondary" | "purple";
  }
> = {
  super_admin: {
    label: "Executive Workspace",
    summary: "Cross-team visibility, governance, and portfolio control.",
    icon: ShieldCheck,
    accent: "from-slate-950 via-slate-900 to-slate-800",
    badge: "default",
  },
  admin: {
    label: "Admin Workspace",
    summary: "Operations oversight, permissions, and delivery health.",
    icon: ShieldCheck,
    accent: "from-slate-950 via-slate-900 to-slate-800",
    badge: "default",
  },
  project_manager: {
    label: "Project Manager Workspace",
    summary: "Priorities, deadlines, delivery pacing, and coordination.",
    icon: TimerReset,
    accent: "from-teal-800 via-teal-700 to-cyan-700",
    badge: "success",
  },
  collaborator: {
    label: "Collaborator Workspace",
    summary: "Assigned work, project context, and quick collaboration.",
    icon: CheckCircle2,
    accent: "from-violet-800 via-violet-700 to-indigo-700",
    badge: "purple",
  },
  viewer: {
    label: "Workspace Overview",
    summary: "A clear snapshot of the DBS platform and current activity.",
    icon: BarChart3,
    accent: "from-slate-900 via-slate-800 to-slate-700",
    badge: "secondary",
  },
};

function getPriorityTone(priority: string) {
  if (priority === "critical" || priority === "high") {
    return "bg-red-50 text-red-600 dark:bg-red-950/20";
  }
  if (priority === "medium") {
    return "bg-amber-50 text-amber-600 dark:bg-amber-950/20";
  }
  return "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20";
}

export function DashboardClient({
  user,
  stats,
  recentActivity,
  upcomingAgenda,
}: DashboardClientProps) {
  const t = useT();
  const roleConfig = ROLE_CONFIG[user.role || "viewer"] || ROLE_CONFIG.viewer;
  const RoleIcon = roleConfig.icon;

  const pieData = stats.phaseStats.map((s) => ({
    name: translatePhase(s.phase, t),
    value: s.count,
    color: PHASE_COLORS[s.phase] || "#94a3b8",
  }));

  const avgPerPerson =
    stats.userCount > 0
      ? (stats.assignedCount / stats.userCount).toFixed(1)
      : "0";

  const aiActions = [
    `${stats.blockedProjects} blocked projects need review`,
    `${stats.unassignedCount} projects still need ownership`,
    `${upcomingAgenda.length} upcoming agenda items are already sequenced`,
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
      >
        <div
          className={`relative overflow-hidden rounded-[32px] bg-gradient-to-br ${roleConfig.accent} p-8 text-white shadow-[0_28px_70px_rgba(15,23,42,0.24)]`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 backdrop-blur-sm">
                <RoleIcon className="h-5 w-5" />
              </div>
              <div>
                <Badge variant={roleConfig.badge} className="border-0 bg-white/14 text-[11px] text-white">
                  {roleConfig.label}
                </Badge>
                <p className="mt-2 text-sm text-white/70">{roleConfig.summary}</p>
              </div>
            </div>

            <h1 className="mt-8 text-4xl font-semibold tracking-tight">
              {user.name?.split(" ")[0] || "User"}, {t("dashboard.greeting")}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
              This dashboard prioritizes delivery decisions, AI-assisted actions, and coordination signals before users dive into individual modules.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: t("dashboard.total_portfolio"), value: stats.projectCount, detail: t("dashboard.tracked_projects") },
                { label: t("dashboard.active_delivery"), value: stats.activeProjects, detail: t("dashboard.in_progress") },
                { label: t("dashboard.at_risk"), value: stats.blockedProjects, detail: t("dashboard.blocked_delayed") },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                  <p className="text-3xl font-semibold">{item.value}</p>
                  <p className="mt-2 text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-white/70">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Card className="border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Today at a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">AI recommendations</p>
              </div>
              <div className="mt-3 space-y-2">
                {aiActions.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 text-blue-500" />
                    <p className="text-xs leading-6 text-blue-800 dark:text-blue-200">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/dashboard/projects">
                <motion.div whileHover={{ y: -2 }} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-5 text-sm font-semibold">Open project portfolio</p>
                  <p className="mt-1 text-xs text-muted-foreground">Search, assign, and move delivery forward.</p>
                </motion.div>
              </Link>
              <Link href="/dashboard/agenda">
                <motion.div whileHover={{ y: -2 }} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-5 text-sm font-semibold">Review agenda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sequence milestones, tasks, and review moments.</p>
                </motion.div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {[
          {
            title: t("dashboard.total_projects"),
            value: stats.projectCount,
            sub: `${stats.assignedCount} assigned, ${stats.unassignedCount} unassigned`,
            icon: FolderOpen,
            href: "/dashboard/projects",
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/20",
          },
          {
            title: t("dashboard.active_team"),
            value: stats.userCount,
            sub: t("dashboard.users_available"),
            icon: Users,
            href: "/dashboard/users",
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/20",
          },
          {
            title: t("dashboard.avg_load"),
            value: avgPerPerson,
            sub: t("dashboard.assigned_per_teammate"),
            icon: TrendingUp,
            href: "/dashboard/statistics",
            color: "text-purple-600",
            bg: "bg-purple-50 dark:bg-purple-950/20",
          },
          {
            title: t("dashboard.blocked"),
            value: stats.blockedProjects,
            sub: t("dashboard.projects_stuck"),
            icon: AlertTriangle,
            href: "/dashboard/statistics",
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950/20",
          },
        ].map((card) => (
          <motion.div key={card.title} variants={itemVariants}>
            <Link href={card.href}>
              <Card className="group cursor-pointer border-border bg-card transition-shadow hover:shadow-md dark:hover:shadow-none dark:hover:border-foreground/20">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`rounded-lg p-2 ${card.bg}`}>
                      <card.icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-3">
                    <p className="text-3xl font-bold">{card.value}</p>
                    <p className="mt-0.5 text-sm font-medium">{card.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.phase_distribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                        background: "var(--background)",
                        boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="min-w-[170px] space-y-2">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                      <span className="flex-1 truncate text-xs text-muted-foreground">{item.name}</span>
                      <span className="text-xs font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="h-full border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.upcoming_agenda")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingAgenda.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.no_upcoming")}</p>
              ) : (
                upcomingAgenda.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getPriorityTone(item.priority)}`}>
                        {item.priority}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          <span>{new Date(item.date).toLocaleDateString("en-GB")}</span>
                        </div>
                        {item.project && (
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{item.project.code}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Work status breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="mt-6"
      >
        <Card className="border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dashboard.tasks_by_status")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const STATUS_META = [
                { key: "todo",      label: t("status.not_started"),   color: "#c4c4cf" },
                { key: "doing",     label: t("status.working_on_it"), color: "#fdab3d" },
                { key: "stuck",     label: t("status.stuck"),         color: "#e2445c" },
                { key: "completed", label: t("status.done"),          color: "#00c875" },
              ];
              const rows = STATUS_META.map((s) => ({
                ...s,
                count: stats.workStatusStats.find((w) => w.status === s.key)?.count ?? 0,
              }));
              const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
              return (
                <div className="space-y-3">
                  {/* Bar chart */}
                  <div className="flex h-6 w-full overflow-hidden rounded-full">
                    {rows.map((r) =>
                      r.count > 0 ? (
                        <div
                          key={r.key}
                          style={{
                            width: `${(r.count / total) * 100}%`,
                            background: r.color,
                          }}
                          title={`${r.label}: ${r.count}`}
                        />
                      ) : null
                    )}
                  </div>
                  {/* Legend rows */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {rows.map((r) => (
                      <div key={r.key} className="flex items-center gap-2">
                        <div className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.color }} />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] text-muted-foreground">{r.label}</p>
                          <p className="text-sm font-bold leading-tight">{r.count}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </motion.div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="h-full border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.recent_activity")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.no_recent_activity")}</p>
              ) : (
                recentActivity.slice(0, 6).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px] bg-muted">
                        {activity.user?.initials || activity.user?.name?.slice(0, 2).toUpperCase() || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs text-foreground">{activity.description}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="mb-3 text-base font-semibold">{t("dashboard.ai_workflow")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                href: "/dashboard/ai/gpt",
                icon: Sparkles,
                title: "DBS OPS MANUAL GPT",
                desc: t("dashboard.gpt_desc"),
                color: "from-blue-500/10 to-cyan-500/10",
              },
              {
                href: "/dashboard/ai/gallery",
                icon: Building2,
                title: "Visual Gallery AI",
                desc: t("dashboard.gallery_desc"),
                color: "from-emerald-500/10 to-teal-500/10",
              },
              {
                href: "/dashboard/ai/planning",
                icon: FolderOpen,
                title: "Planning AI",
                desc: t("dashboard.planning_desc"),
                color: "from-amber-500/10 to-orange-500/10",
              },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className={`cursor-pointer rounded-2xl border border-border bg-gradient-to-br ${item.color} p-5 transition-shadow hover:shadow-lg`}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <item.icon className="h-5 w-5 text-foreground" />
                    <span className="text-sm font-semibold">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
