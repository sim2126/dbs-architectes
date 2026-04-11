"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  FolderOpen,
  Plus,
  Edit3,
  Trash2,
  LogIn,
  User,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { id: string; name: string | null; initials: string; image: string | null };
  project: { id: string; title: string; code: string } | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  PROJECT_CREATED: { label: "Project Created", icon: Plus, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  PROJECT_UPDATED: { label: "Project Updated", icon: Edit3, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  PROJECT_DELETED: { label: "Project Deleted", icon: Trash2, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  USER_JOINED: { label: "User Joined", icon: LogIn, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  USER_UPDATED: { label: "User Updated", icon: User, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  FILE_UPLOADED: { label: "File Uploaded", icon: FolderOpen, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, icon: Activity, color: "text-muted-foreground", bg: "bg-muted/30" };
}

function groupByDate(activities: ActivityItem[]) {
  const groups: Record<string, ActivityItem[]> = {};
  for (const a of activities) {
    const date = new Date(a.createdAt).toLocaleDateString("it-CH", { day: "numeric", month: "long", year: "numeric" });
    if (!groups[date]) groups[date] = [];
    groups[date].push(a);
  }
  return Object.entries(groups);
}

export function ActivityView() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchActivities = useCallback(async (p = 1, type = "", q = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (type) params.set("type", type);
      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();
      let items: ActivityItem[] = data.activities ?? [];
      if (q) {
        const lower = q.toLowerCase();
        items = items.filter(
          (a) =>
            a.description.toLowerCase().includes(lower) ||
            (a.user.name?.toLowerCase().includes(lower)) ||
            (a.project?.title.toLowerCase().includes(lower)) ||
            (a.project?.code.toLowerCase().includes(lower))
        );
      }
      setActivities(items);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities(page, typeFilter, search);
  }, [page, typeFilter, search, fetchActivities]);

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchActivities(page, typeFilter, search);
  }

  const grouped = groupByDate(activities);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 bg-foreground/5 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Activity Log</h1>
            <p className="text-sm text-muted-foreground">{total} total events</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search events..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>
            Search
          </Button>
        </div>
        <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">No activity found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {grouped.map(([date, items], gi) => (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.05 }}
                >
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Clock className="w-3 h-3" />
                      {date}
                    </div>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">{items.length} events</span>
                  </div>

                  {/* Events */}
                  <div className="space-y-2 pl-1 border-l-2 border-border ml-1">
                    {items.map((activity, idx) => {
                      const cfg = getTypeConfig(activity.type);
                      const Icon = cfg.icon;
                      return (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="relative flex items-start gap-4 ml-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group"
                        >
                          {/* Timeline dot */}
                          <div className="absolute -left-[21px] top-5 w-3 h-3 rounded-full bg-background border-2 border-border group-hover:border-foreground/30 transition-colors" />

                          {/* Type icon */}
                          <div className={cn("flex items-center justify-center w-9 h-9 rounded-xl shrink-0", cfg.bg)}>
                            <Icon className={cn("w-4 h-4", cfg.color)} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug">{activity.description}</p>
                                {activity.project && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <FolderOpen className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                      {activity.project.code} — {activity.project.title}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="outline" className={cn("text-xs border-0", cfg.bg, cfg.color)}>
                                  {cfg.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={activity.user.image || ""} />
                                <AvatarFallback className="text-[9px] bg-foreground text-background">
                                  {activity.user.initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{activity.user.name ?? activity.user.initials}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0">
          <p className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
