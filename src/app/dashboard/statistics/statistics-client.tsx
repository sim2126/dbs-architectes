"use client";

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
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PHASE_COLORS } from "@/lib/utils";

interface StatisticsClientProps {
  stats: {
    totalProjects: number;
    activeProjects: number;
    teamMembers: number;
    avgPerPerson: string;
  };
  phaseDistribution: { phase: string; count: number }[];
  userWorkload: Array<{
    name: string;
    fullName: string;
    active: number;
    stuckTerminated: number;
    total: number;
  }>;
  categoryData: { name: string; value: number }[];
}

const CATEGORY_COLORS = {
  Residenziale: "#3b82f6",
  Commerciale: "#f59e0b",
  Industriale: "#8b5cf6",
};

export function StatisticsClient({
  stats,
  phaseDistribution,
  userWorkload,
  categoryData,
}: StatisticsClientProps) {
  const pieData = phaseDistribution.map((d) => ({
    name: d.phase,
    value: d.count,
    color: PHASE_COLORS[d.phase] || "#94a3b8",
  }));

  const barData = userWorkload
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistics & Workload</h1>
        <p className="text-muted-foreground mt-1">
          Performance overview and project distribution
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Total Projects",
            value: stats.totalProjects,
            sub: `${stats.totalProjects - stats.activeProjects} completed`,
            icon: FolderOpen,
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/20",
          },
          {
            title: "Active Team",
            value: stats.teamMembers,
            sub: "Members with assigned projects",
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
            transition={{ delay: i * 0.1 }}
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
        {/* Workload per person */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workload per Person</CardTitle>
              <p className="text-xs text-muted-foreground">
                Total number of projects assigned to each team member
              </p>
            </CardHeader>
            <CardContent>
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
                      name === "active" ? "Active Projects" : "Stuck/Terminated",
                    ]}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "active" ? "Active Projects" : "Stuck/Terminated"
                    }
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="active" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar
                    dataKey="stuckTerminated"
                    stackId="a"
                    fill="#e5e7eb"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Phase distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phase Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">
                General overview of all projects by phase
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
                    <span className="text-xs text-muted-foreground truncate">
                      {item.name}
                    </span>
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
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {categoryData.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      background:
                        CATEGORY_COLORS[cat.name as keyof typeof CATEGORY_COLORS] ||
                        "#94a3b8",
                    }}
                  />
                  <div>
                    <p className="text-sm font-semibold">{cat.name}</p>
                    <p className="text-2xl font-bold mt-0.5">{cat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {((cat.value / stats.totalProjects) * 100).toFixed(0)}% of total
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team overview table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userWorkload
                .sort((a, b) => b.total - a.total)
                .map((u) => (
                  <div
                    key={u.name}
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
                              width: `${
                                stats.totalProjects > 0
                                  ? (u.active / Math.max(...userWorkload.map((x) => x.total), 1)) *
                                    100
                                  : 0
                              }%`,
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
                        <p className="text-xs text-muted-foreground">{u.stuckTerminated} done</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
