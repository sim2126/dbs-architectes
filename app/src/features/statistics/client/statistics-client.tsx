"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FolderOpen,
  Users,
  TrendingUp,
  Activity,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import { cn } from "@/ui/utils";
import { FRIDAY_TOKENS, getPhaseColor } from "@/ui/tokens";

interface ProjectLite {
  id: string;
  phase: string;
  category: string;
  country?: string | null;
  userIds: string[];
}
interface UserLite {
  id: string;
  name: string;
  initials: string;
  country?: string | null;
}

interface StatisticsClientProps {
  projects: ProjectLite[];
  users: UserLite[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Residenziale: FRIDAY_TOKENS.chart.category.residential,
  Commerciale: FRIDAY_TOKENS.chart.category.commercial,
  Industriale: FRIDAY_TOKENS.chart.category.industrial,
  Mista: FRIDAY_TOKENS.chart.category.mixed,
  Hospitality: FRIDAY_TOKENS.chart.category.hospitality,
  Ristrutturazione: FRIDAY_TOKENS.chart.category.renovation,
};

const COUNTRY_LABEL: Record<string, string> = {
  CH: "🇨🇭 Switzerland",
  IT: "🇮🇹 Italy",
  IN: "🇮🇳 India",
  UA: "🇺🇦 Ukraine",
  FR: "🇫🇷 France",
  DE: "🇩🇪 Germany",
};

export function StatisticsClient({ projects, users }: StatisticsClientProps) {
  const [country, setCountry] = useState<string>("ALL");

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.country && set.add(p.country));
    return Array.from(set).sort();
  }, [projects]);

  const filteredProjects = useMemo(
    () => (country === "ALL" ? projects : projects.filter((p) => p.country === country)),
    [projects, country]
  );

  const filteredUsers = useMemo(() => {
    if (country === "ALL") return users;
    // Team = users assigned to ≥1 project in this country
    const assignedIds = new Set<string>();
    filteredProjects.forEach((p) => p.userIds.forEach((u) => assignedIds.add(u)));
    return users.filter((u) => assignedIds.has(u.id) || u.country === country);
  }, [users, filteredProjects, country]);

  const stats = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const completedProjects = filteredProjects.filter((p) => p.phase === "TERMINATO").length;
    const stuckProjects = filteredProjects.filter((p) => p.phase === "STUCK").length;
    const activeProjects = totalProjects - completedProjects - stuckProjects;
    const teamMembers = filteredUsers.length;
    const avgPerPerson = teamMembers > 0 ? (totalProjects / teamMembers).toFixed(1) : "0";
    return { totalProjects, activeProjects, completedProjects, stuckProjects, teamMembers, avgPerPerson };
  }, [filteredProjects, filteredUsers]);

  const phaseDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjects.forEach((p) => {
      counts[p.phase] = (counts[p.phase] || 0) + 1;
    });
    return Object.entries(counts).map(([phase, count]) => ({ phase, count }));
  }, [filteredProjects]);

  const userWorkload = useMemo(() => {
    const countsById: Record<string, { active: number; stuck: number; completed: number }> = {};
    for (const u of filteredUsers) countsById[u.id] = { active: 0, stuck: 0, completed: 0 };
    for (const p of filteredProjects) {
      for (const uid of p.userIds) {
        if (!countsById[uid]) continue;
        if (p.phase === "TERMINATO") countsById[uid].completed++;
        else if (p.phase === "STUCK") countsById[uid].stuck++;
        else countsById[uid].active++;
      }
    }
    return filteredUsers.map((u) => {
      const c = countsById[u.id] ?? { active: 0, stuck: 0, completed: 0 };
      return {
        name: u.initials,
        fullName: u.name,
        active: c.active,
        stuck: c.stuck,
        completed: c.completed,
        total: c.active + c.stuck + c.completed,
      };
    });
  }, [filteredProjects, filteredUsers]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjects.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredProjects]);

  const pieData = phaseDistribution.map((d) => ({
    name: d.phase,
    value: d.count,
    color: getPhaseColor(d.phase),
  }));

  const barData = userWorkload
    .filter((u) => u.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Statistics & Workload</h1>
          <p className="text-muted-foreground mt-1">
            Performance overview and project distribution
            {country !== "ALL" && ` · ${COUNTRY_LABEL[country] ?? country}`}
          </p>
        </div>

        {/* Country filter */}
        <div className="flex items-center gap-1.5 p-1 bg-muted rounded-xl">
          <Globe className="w-4 h-4 ml-2 text-muted-foreground" />
          <button
            onClick={() => setCountry("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              country === "ALL"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All countries
          </button>
          {availableCountries.map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                country === c
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {COUNTRY_LABEL[c] ?? c}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Total Projects",
            value: stats.totalProjects,
            sub: `${stats.completedProjects} completed · ${stats.stuckProjects} stuck`,
            icon: FolderOpen,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/20",
          },
          {
            title: "Active Team",
            value: stats.teamMembers,
            sub: country === "ALL" ? "Members with assigned projects" : "Working on this country",
            icon: Users,
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/20",
          },
          {
            title: "Avg. Projects",
            value: stats.avgPerPerson,
            sub: "Projects per person",
            icon: TrendingUp,
            color: "text-purple-600",
            bg: "bg-purple-50 dark:bg-purple-950/20",
          },
          {
            title: "Active Projects",
            value: stats.activeProjects,
            sub: "In progress (excl. STUCK/TERMINATO)",
            icon: Activity,
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950/20",
          },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardContent className="p-5">
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <p className="text-3xl font-bold">{card.value}</p>
                <p className="text-sm font-medium mt-0.5">{card.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workload per Person</CardTitle>
              <p className="text-xs text-muted-foreground">
                {country === "ALL"
                  ? "Projects assigned to each team member"
                  : `Load on the ${COUNTRY_LABEL[country] ?? country} portfolio`}
              </p>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No workload in this country.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} margin={{ bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--background)",
                      }}
                      formatter={(value, name) => [
                        value,
                        name === "active" ? "Active" : name === "stuck" ? "Stuck" : "Completed",
                      ]}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "active" ? "Active" : value === "stuck" ? "Stuck" : "Completed"
                      }
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar dataKey="active" stackId="a" fill={FRIDAY_TOKENS.chart.active} />
                    <Bar dataKey="stuck" stackId="a" fill={FRIDAY_TOKENS.chart.stuck} />
                    <Bar dataKey="completed" stackId="a" fill={FRIDAY_TOKENS.chart.completed} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phase Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">
                Overview of projects by phase
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--background)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: item.color }}
                    />
                    <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                    <span className="text-xs font-semibold ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Category breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No categories.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {categoryData.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: CATEGORY_COLORS[cat.name] || FRIDAY_TOKENS.chart.fallback,
                      }}
                    />
                    <div>
                      <p className="text-sm font-semibold">{cat.name}</p>
                      <p className="text-2xl font-bold mt-0.5">{cat.value}</p>
                      <p className="text-xs text-muted-foreground">
                        {stats.totalProjects > 0
                          ? `${((cat.value / stats.totalProjects) * 100).toFixed(0)}% of total`
                          : "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Team detail */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userWorkload
                .filter((u) => u.total > 0 || country === "ALL")
                .sort((a, b) => b.total - a.total)
                .map((u) => {
                  const maxTotal = Math.max(...userWorkload.map((x) => x.total), 1);
                  return (
                    <div
                      key={u.fullName}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs bg-foreground text-background">
                          {u.name}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.fullName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{
                                width: `${(u.active / maxTotal) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {u.total}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-blue-600 font-medium">{u.active} active</p>
                          <p className="text-xs text-muted-foreground">
                            {u.completed} done{u.stuck > 0 ? ` · ${u.stuck} stuck` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
