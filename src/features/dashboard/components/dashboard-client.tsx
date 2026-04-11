"use client";

import { motion } from "framer-motion";
import {
  FolderOpen,
  Users,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Building2,
  BarChart3,
  Sparkles,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { PHASE_COLORS } from "@/shared/lib/utils";

interface DashboardClientProps {
  user: { name?: string | null; role?: string; email?: string };
  stats: {
    projectCount: number;
    userCount: number;
    assignedCount: number;
    unassignedCount: number;
    phaseStats: { phase: string; count: number }[];
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name?: string | null; initials?: string | null } | null;
    project: { title: string; code: string } | null;
  }>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function DashboardClient({ user, stats, recentActivity }: DashboardClientProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const pieData = stats.phaseStats.map((s) => ({
    name: s.phase,
    value: s.count,
    color: PHASE_COLORS[s.phase] || "#94a3b8",
  }));

  const avgPerPerson =
    stats.userCount > 0
      ? (stats.assignedCount / stats.userCount).toFixed(1)
      : "0";

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {user.name?.split(" ")[0] || "User"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s an overview of your DBS platform
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/projects">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              All Projects
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* Stats cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          {
            title: "Total Projects",
            value: stats.projectCount,
            sub: `${stats.assignedCount} assigned, ${stats.unassignedCount} unassigned`,
            icon: FolderOpen,
            href: "/dashboard/projects",
            color: "text-blue-600",
            bg: "bg-blue-50 dark:bg-blue-950/20",
          },
          {
            title: "Active Team",
            value: stats.userCount,
            sub: "Members with assigned projects",
            icon: Users,
            href: "/dashboard/users",
            color: "text-emerald-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/20",
          },
          {
            title: "Avg. Projects",
            value: avgPerPerson,
            sub: "Projects per person",
            icon: TrendingUp,
            href: "/dashboard/statistics",
            color: "text-purple-600",
            bg: "bg-purple-50 dark:bg-purple-950/20",
          },
          {
            title: "Active Phases",
            value: stats.phaseStats.length,
            sub: "Project phases in progress",
            icon: BarChart3,
            href: "/dashboard/statistics",
            color: "text-amber-600",
            bg: "bg-amber-50 dark:bg-amber-950/20",
          },
        ].map((card) => (
          <motion.div key={card.title} variants={itemVariants}>
            <Link href={card.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="mt-3">
                    <p className="text-3xl font-bold">{card.value}</p>
                    <p className="text-sm font-medium mt-0.5">{card.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phase Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
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
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 min-w-[140px]">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {item.name}
                      </span>
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
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent activity
                </p>
              ) : (
                recentActivity.slice(0, 6).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px] bg-muted">
                        {activity.user?.initials || activity.user?.name?.slice(0, 2).toUpperCase() || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground line-clamp-2">
                        {activity.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(activity.createdAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="text-base font-semibold mb-3">AI Workflow</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              href: "/dashboard/ai/gpt",
              icon: Sparkles,
              title: "DBS OPS MANUAL GPT",
              desc: "AI trained on Swiss regulations, calculations and internal operational guidelines",
              color: "from-blue-500/10 to-purple-500/10",
            },
            {
              href: "/dashboard/ai/gallery",
              icon: Building2,
              title: "Visual Gallery AI",
              desc: "AI-powered visual repository of every 3D render and facade produced by DBS",
              color: "from-emerald-500/10 to-teal-500/10",
            },
            {
              href: "/dashboard/ai/planning",
              icon: FolderOpen,
              title: "Planning AI",
              desc: "Every floor plan, site plan and layout drawn by DBS — vectorized and searchable",
              color: "from-amber-500/10 to-orange-500/10",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`p-4 rounded-xl border border-border bg-gradient-to-br ${item.color} cursor-pointer transition-shadow hover:shadow-md`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <item.icon className="w-5 h-5 text-foreground" />
                  <span className="text-sm font-semibold">{item.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
