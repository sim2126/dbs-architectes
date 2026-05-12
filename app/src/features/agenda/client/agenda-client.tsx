"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Circle,
  Flag,
  Users,
  Building2,
  Loader2,
  CalendarCheck,
  CalendarX,
  ExternalLink,
  Unlink,
  Link as LinkIcon,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, addMonths, subMonths } from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/ui/components/button";
import { Badge } from "@/ui/components/badge";
import { Card, CardContent } from "@/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/dialog";
import { Input } from "@/ui/components/input";
import { Label } from "@/ui/components/label";
import { Textarea } from "@/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/select";
import { cn } from "@/ui/utils";

interface AgendaItem {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  endDate?: string | null;
  type: string;
  priority: string;
  status: string;
  color?: string | null;
  allDay: boolean;
  googleEventId?: string | null;
  project?: { id: string; title: string; code: string } | null;
  user?: { id: string; name?: string | null; initials?: string | null } | null;
}

interface AgendaClientProps {
  initialItems: AgendaItem[];
  projects: { id: string; title: string; code: string }[];
  currentUserId: string;
}

const TYPE_COLORS = {
  task: "#3b82f6",
  deadline: "#ef4444",
  milestone: "#22c55e",
  meeting: "#f59e0b",
};

const TYPE_ICONS = {
  task: Circle,
  deadline: AlertCircle,
  milestone: CheckCircle2,
  meeting: Users,
};

const PRIORITY_COLORS = {
  low: "text-blue-500",
  medium: "text-amber-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

export function AgendaClient({ initialItems, projects, currentUserId }: AgendaClientProps) {
  const [items, setItems] = useState(initialItems);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [gcalLoading, setGcalLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: format(new Date(), "yyyy-MM-dd"),
    type: "task",
    priority: "medium",
    projectId: "",
    color: "#3b82f6",
  });

  // Check Google Calendar connection on mount
  useEffect(() => {
    fetch("/api/google/sync")
      .then((r) => r.json())
      .then((d) => setGcalConnected(!!d.connected))
      .catch(() => {});
  }, []);

  async function handleGcalConnect() {
    window.location.href = "/api/google/auth";
  }

  async function handleGcalDisconnect() {
    setGcalLoading(true);
    try {
      await fetch("/api/google/sync", { method: "DELETE" });
      setGcalConnected(false);
    } finally {
      setGcalLoading(false);
    }
  }

  async function handleSyncToggle(item: AgendaItem) {
    if (!gcalConnected) {
      handleGcalConnect();
      return;
    }
    setSyncingIds((s) => new Set(s).add(item.id));
    try {
      const res = await fetch("/api/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agendaItemId: item.id, sync: !item.googleEventId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, googleEventId: updated.googleEventId } : i)));
      }
    } finally {
      setSyncingIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad days to start from Monday
  const firstDayOfWeek = monthStart.getDay();
  const paddingDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const paddedDays = Array(paddingDays).fill(null);

  const getItemsForDay = (date: Date) =>
    items.filter((item) => isSameDay(new Date(item.date), date));

  const upcomingItems = items
    .filter((item) => new Date(item.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 10);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectId: form.projectId || null,
        }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems([...items, item]);
        setAddModalOpen(false);
        setForm({
          title: "",
          description: "",
          date: format(new Date(), "yyyy-MM-dd"),
          type: "task",
          priority: "medium",
          projectId: "",
          color: "#3b82f6",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground mt-1">
            Plan activities, deadlines and milestones
          </p>
        </div>
        <div className="flex items-center gap-3">
          {gcalConnected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-1.5 rounded-lg">
                <CalendarCheck className="w-3.5 h-3.5" />
                Google Calendar
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={handleGcalDisconnect}
                disabled={gcalLoading}
              >
                {gcalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={handleGcalConnect}
            >
              <CalendarX className="w-3.5 h-3.5" />
              Connect Google Calendar
            </Button>
          )}
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="w-4 h-4" />
            New Event
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-base font-semibold capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: enUS })}
                </h2>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day names */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {paddedDays.map((_, i) => (
                  <div key={`pad-${i}`} className="aspect-square" />
                ))}
                {days.map((day) => {
                  const dayItems = getItemsForDay(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDay = isToday(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(isSameDay(day, selectedDate!) ? null : day)}
                      className={cn(
                        "aspect-square rounded-lg p-1 text-xs transition-all relative flex flex-col items-center",
                        isSelected && "bg-foreground text-background",
                        isTodayDay && !isSelected && "bg-blue-50 dark:bg-blue-950/20 text-blue-600 font-bold",
                        !isSelected && !isTodayDay && "hover:bg-accent"
                      )}
                    >
                      <span className="text-xs font-medium">{format(day, "d")}</span>
                      <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
                        {dayItems.slice(0, 3).map((item, i) => (
                          <div
                            key={i}
                            className="w-1 h-1 rounded-full"
                            style={{ background: isSelected ? "white" : (TYPE_COLORS[item.type as keyof typeof TYPE_COLORS] || "#94a3b8") }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected day events */}
          <AnimatePresence>
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4"
              >
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3 capitalize">
                      {format(selectedDate, "EEEE d MMMM yyyy", { locale: enUS })}
                    </h3>
                    {getItemsForDay(selectedDate).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No events on this day
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {getItemsForDay(selectedDate).map((item) => {
                          const Icon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] || Circle;
                          const isSyncing = syncingIds.has(item.id);
                          return (
                            <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                              <Icon
                                className="w-4 h-4 mt-0.5 shrink-0"
                                style={{ color: TYPE_COLORS[item.type as keyof typeof TYPE_COLORS] }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{item.title}</p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                                )}
                                {item.project && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Building2 className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{item.project.title}</span>
                                  </div>
                                )}
                                {item.googleEventId && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <CalendarCheck className="w-3 h-3 text-green-500" />
                                    <span className="text-[10px] text-green-600">Synced to Google Calendar</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge variant="secondary" className="text-[10px] capitalize">
                                  {item.type}
                                </Badge>
                                <button
                                  onClick={() => handleSyncToggle(item)}
                                  disabled={isSyncing}
                                  title={item.googleEventId ? "Unsync from Google Calendar" : "Sync to Google Calendar"}
                                  className={cn(
                                    "p-1 rounded-md transition-colors",
                                    item.googleEventId
                                      ? "text-green-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      : "text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                                  )}
                                >
                                  {isSyncing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : item.googleEventId ? (
                                    <CalendarCheck className="w-3.5 h-3.5" />
                                  ) : (
                                    <LinkIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Upcoming events */}
        <div>
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Upcoming Events
              </h3>
              {upcomingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No upcoming events
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingItems.map((item) => {
                    const Icon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] || Circle;
                    const date = new Date(item.date);
                    const isOverdue = date < new Date() && item.status === "pending";
                    const isSyncing = syncingIds.has(item.id);

                    return (
                      <motion.div
                        key={item.id}
                        whileHover={{ x: 2 }}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border border-border cursor-default transition-colors hover:bg-muted/30",
                          isOverdue && "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10"
                        )}
                      >
                        <div
                          className="w-0.5 h-full rounded-full min-h-[40px]"
                          style={{ background: item.color || TYPE_COLORS[item.type as keyof typeof TYPE_COLORS] || "#94a3b8" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold line-clamp-1">{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {format(date, "d MMM", { locale: enUS })}
                            </span>
                            <span className={cn("text-[10px] font-medium capitalize", PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS])}>
                              <Flag className="w-2.5 h-2.5 inline mr-0.5" />
                              {item.priority}
                            </span>
                          </div>
                          {item.project && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {item.project.code}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleSyncToggle(item)}
                          disabled={isSyncing}
                          title={item.googleEventId ? "Synced to Google Calendar — click to unsync" : "Sync to Google Calendar"}
                          className={cn(
                            "p-1 rounded-md transition-colors shrink-0",
                            item.googleEventId
                              ? "text-green-500 hover:text-red-400"
                              : "text-muted-foreground/40 hover:text-blue-500"
                          )}
                        >
                          {isSyncing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : item.googleEventId ? (
                            <CalendarCheck className="w-3 h-3" />
                          ) : (
                            <LinkIcon className="w-3 h-3" />
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { label: "Task", type: "task", color: "#3b82f6" },
              { label: "Deadline", type: "deadline", color: "#ef4444" },
              { label: "Milestone", type: "milestone", color: "#22c55e" },
              { label: "Meeting", type: "meeting", color: "#f59e0b" },
            ].map((t) => (
              <div key={t.type} className="p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                </div>
                <p className="text-xl font-bold">
                  {items.filter((i) => i.type === t.type).length}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Event title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} - {p.title.slice(0, 30)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Event"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
