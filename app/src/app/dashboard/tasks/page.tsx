"use client";

// Legacy Tasks surface backed by task-compatible WorkItems.
// Each user has their own list, grouped by status: Todo / Doing / Done.
// Optional link to a project surfaces the task on the project view too.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Target,
  Trash2,
  AlertOctagon,
  ArrowUpCircle,
  ChevronDown,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { cn } from "@/ui/utils";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high" | "critical";
  projectId: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  project?: { id: string; code: string; title: string } | null;
}

interface ProjectOption {
  id: string;
  code: string;
  title: string;
}

const STATUS_COLUMNS: Array<{ key: Task["status"]; label: string; color: string }> = [
  { key: "todo", label: "Not Started", color: "bg-slate-400" },
  { key: "doing", label: "Working on it", color: "bg-amber-500" },
  { key: "done", label: "Done", color: "bg-emerald-500" },
];

const PRIORITY_DOT: Record<Task["priority"], string> = {
  critical: "bg-red-600",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Task["priority"]>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/projects?limit=100"),
      ]);
      const taskData = (await tasksRes.json()) as Task[];
      setTasks(Array.isArray(taskData) ? taskData : []);
      if (projectsRes.ok) {
        const projData = (await projectsRes.json()) as Array<{
          id: string;
          code: string;
          title: string;
        }>;
        setProjects(
          (Array.isArray(projData) ? projData : []).map((p) => ({
            id: p.id,
            code: p.code,
            title: p.title,
          })),
        );
      }
    } catch (err) {
      console.error("[tasks] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createTask = async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          priority: newPriority,
          dueDate: newDueDate || undefined,
          projectId: newProjectId || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as Task;
      setTasks((prev) => [...prev, created]);
      setNewTitle("");
      setNewDueDate("");
      setNewProjectId("");
      setNewPriority("medium");
      inputRef.current?.focus();
    } catch (err) {
      console.error("[tasks] create failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as Task;
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error("[tasks] update failed:", err);
      fetchAll();
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[tasks] delete failed:", err);
      fetchAll();
    }
  };

  const grouped = useMemo(() => {
    const buckets: Record<Task["status"], Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) buckets[t.status].push(t);
    return buckets;
  }, [tasks]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-card/70 px-6 py-3.5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" />
          <h1 className="text-sm font-semibold">My Tasks</h1>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-b border-border bg-card/40 px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createTask();
            }}
            placeholder="Add a task — Enter to create"
            className="flex-1 min-w-[240px] rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as Task["priority"])}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs max-w-[180px]"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.code}] {p.title.slice(0, 40)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
          />
          <button
            onClick={createTask}
            disabled={!newTitle.trim() || creating}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3.5 text-xs font-semibold text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add task
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {STATUS_COLUMNS.map((col) => (
                <div key={col.key} className="rounded-2xl border border-border bg-muted/30 p-3">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className={cn("h-2 w-2 rounded-full", col.color)} />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {col.label}
                    </h2>
                    <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
                      {grouped[col.key].length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {grouped[col.key].length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                          {col.key === "todo" ? "Nothing queued." : col.key === "doing" ? "Nothing in progress." : "Nothing finished yet."}
                        </div>
                      ) : (
                        grouped[col.key].map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onUpdate={updateTask}
                            onDelete={deleteTask}
                          />
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = task.dueDate && task.status !== "done" && isPast(new Date(task.dueDate));

  const cycle = (current: Task["status"]) => {
    if (current === "todo") return "doing";
    if (current === "doing") return "done";
    return "todo";
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md",
        task.status === "done" && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => onUpdate(task.id, { status: cycle(task.status) })}
          className="mt-0.5 shrink-0 transition-transform hover:scale-110"
          title={`Mark ${cycle(task.status)}`}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : task.status === "doing" ? (
            <ArrowUpCircle className="h-4 w-4 text-amber-500" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              task.status === "done" && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[task.priority])} />
              {PRIORITY_LABEL[task.priority]}
            </span>
            {task.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  overdue
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {overdue && <AlertOctagon className="h-2.5 w-2.5" />}
                {format(new Date(task.dueDate), "d MMM")}
              </span>
            )}
            {task.project && (
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {task.project.code}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Details"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 overflow-hidden border-t border-border pt-2"
          >
            <textarea
              value={task.description ?? ""}
              onChange={(e) => onUpdate(task.id, { description: e.target.value })}
              placeholder="Add description…"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-foreground/20"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
