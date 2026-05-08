"use client";

import * as React from "react";
import { I } from "@/components/friday/icons";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high" | "critical";
  projectId: string | null;
  project: { id: string; code: string; title: string } | null;
  createdAt: string;
}

interface ProjectOpt {
  id: string;
  code: string;
  title: string;
}

// ─── Constants ────────────────────────────────────────────────────
const PRIORITIES = {
  low: { label: "Low", bg: "#e8e6df", fg: "#6b6a62", dot: "#a8a59d" },
  medium: { label: "Medium", bg: "#e8efe6", fg: "#3f6534", dot: "#6e9b5b" },
  high: { label: "High", bg: "#fdf2dd", fg: "#9c6810", dot: "#e9b850" },
  critical: { label: "Critical", bg: "#fde4dd", fg: "#9b2c1a", dot: "#dc4d2e" },
} as const;

type PriorityKey = keyof typeof PRIORITIES;

const STATUSES = [
  { key: "todo", label: "Not started", color: "#a8a59d", emptyMsg: "Nothing queued." },
  { key: "doing", label: "Working on it", color: "#e9b850", emptyMsg: "Nothing in progress." },
  { key: "done", label: "Done", color: "#6e9b5b", emptyMsg: "Nothing finished yet." },
] as const;

// ─── Date helpers ─────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const dd = startOfDay(d);
  const diff = Math.round((dd.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString("en", { weekday: "short" });
  if (diff < 0 && diff > -7) return `${Math.abs(diff)}d overdue`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function isOverdue(iso: string | null, status: string): boolean {
  if (!iso || status === "done") return false;
  return new Date(iso).getTime() < Date.now();
}

function dayDelta(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ─── Pill ─────────────────────────────────────────────────────────
function Pill({
  bg,
  fg,
  children,
}: {
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center px-2 rounded-full text-[10px] font-medium leading-none whitespace-nowrap"
      style={{ height: 18, background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

// ─── Dropdown primitives ──────────────────────────────────────────
function Dropdown({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="absolute z-30 bg-friday-surface border border-friday-border rounded p-1"
      style={{
        top: 36,
        right: 0,
        minWidth: wide ? 240 : 160,
        boxShadow: "0 10px 30px rgba(20,18,12,0.14)",
      }}
    >
      {children}
    </div>
  );
}

function DropdownItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2.5 py-1.5 border-0 cursor-pointer text-left text-[11.5px] text-friday-fg rounded-sm hover:bg-friday-surface-2",
        active ? "bg-friday-surface-2" : "bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

// ─── Header ───────────────────────────────────────────────────────
function TasksHeader({
  total,
  doing,
  overdue,
  view,
  setView,
}: {
  total: number;
  doing: number;
  overdue: number;
  view: "board" | "list";
  setView: (v: "board" | "list") => void;
}) {
  return (
    <div
      className="px-7 border-b border-friday-border-soft flex items-center gap-3.5 shrink-0"
      style={{ height: 60 }}
    >
      <div className="flex-1 min-w-0">
        <h1 className="font-display italic font-medium text-[24px] text-friday-fg m-0 -tracking-[0.3px] leading-[1.15]">
          My tasks
        </h1>
        <div className="text-[11.5px] text-friday-fg-muted mt-0.5">
          <span className="font-mono tracking-wide">{total}</span> tasks
          <span className="text-friday-fg-subtle mx-1.5">·</span>
          <span className="text-friday-fg font-medium">{doing} doing</span>
        </div>
      </div>
      {overdue > 0 ? (
        <div
          className="inline-flex items-center gap-1 px-2.5 rounded-full bg-friday-surface-2 border border-friday-border-soft font-mono text-[10.5px] text-friday-fg-muted tracking-wide"
          style={{ height: 22 }}
        >
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: "#dc4d2e" }}
          />
          {overdue} overdue
        </div>
      ) : null}
      <div
        className="flex h-[30px] border border-friday-border-soft rounded bg-friday-surface overflow-hidden"
      >
        {([
          { v: "board" as const, l: "Board" },
          { v: "list" as const, l: "List" },
        ]).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setView(o.v)}
            className={cn(
              "px-3 border-0 cursor-pointer text-[11.5px] font-medium inline-flex items-center gap-1.5",
              view === o.v
                ? "bg-friday-fg text-friday-bg"
                : "bg-transparent text-friday-fg-muted",
            )}
          >
            {o.v === "board" ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="5" height="16" rx="1" />
                <rect x="10" y="4" width="5" height="11" rx="1" />
                <rect x="17" y="4" width="4" height="7" rx="1" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Aria suggest banner ──────────────────────────────────────────
function AriaSuggest({
  overdueCount,
  onTriage,
  onDismiss,
}: {
  overdueCount: number;
  onTriage: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mx-7 mt-3.5 px-3.5 py-2.5 border border-friday-border-soft rounded flex items-center gap-2.5"
      style={{
        background:
          "linear-gradient(95deg, rgba(30,58,138,0.04), rgba(30,58,138,0.01))",
        borderLeft: "2px solid var(--friday-accent)",
      }}
    >
      <span
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center font-display italic font-medium text-[11px] shrink-0"
        style={{ background: "var(--friday-accent)", color: "#fff" }}
      >
        A
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[11.5px] text-friday-fg-muted">
          Aria suggests ·{" "}
        </span>
        <span
          className="text-[13.5px] text-friday-fg italic"
          style={{ fontFamily: "var(--font-friday-serif), Georgia, serif" }}
        >
          You have {overdueCount} overdue task
          {overdueCount === 1 ? "" : "s"}. Want me to triage?
        </span>
      </div>
      <button
        type="button"
        onClick={onTriage}
        className="h-[26px] px-3 bg-friday-fg text-friday-bg border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer"
      >
        Triage
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="bg-transparent border-0 p-1 cursor-pointer text-friday-fg-muted leading-none rounded-sm"
      >
        <I.X size={12} />
      </button>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────
function TaskComposer({
  projects,
  onSubmit,
}: {
  projects: ProjectOpt[];
  onSubmit: (input: {
    title: string;
    priority: PriorityKey;
    projectId: string | null;
    dueDate: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [priority, setPriority] = React.useState<PriorityKey>("medium");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [due, setDue] = React.useState<string>(dayDelta(3));
  const [priOpen, setPriOpen] = React.useState(false);
  const [projOpen, setProjOpen] = React.useState(false);
  const [dueOpen, setDueOpen] = React.useState(false);
  const priRef = React.useRef<HTMLDivElement>(null);
  const projRef = React.useRef<HTMLDivElement>(null);
  const dueRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (priRef.current && !priRef.current.contains(t)) setPriOpen(false);
      if (projRef.current && !projRef.current.contains(t)) setProjOpen(false);
      if (dueRef.current && !dueRef.current.contains(t)) setDueOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    await onSubmit({ title: title.trim(), priority, projectId, dueDate: due });
    setTitle("");
    setPriority("medium");
    setProjectId(null);
    setDue(dayDelta(3));
  };

  const projectLabel = projectId
    ? projects.find((p) => p.id === projectId)?.code ?? "—"
    : null;

  return (
    <div className="mx-7 mt-3.5 p-3 bg-friday-bg border border-friday-border-soft rounded-md flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Add a task — Enter to create"
        className="flex-1 h-8 px-3 border border-friday-border-soft focus:border-friday-border focus:bg-friday-bg rounded bg-friday-surface text-[13px] text-friday-fg outline-none"
      />

      <div ref={priRef} className="relative">
        <button
          type="button"
          onClick={() => setPriOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3 bg-friday-surface border border-friday-border-soft rounded cursor-pointer text-[11.5px] text-friday-fg"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: PRIORITIES[priority].dot }}
          />
          {PRIORITIES[priority].label}
          <I.ChevDown size={9} className="opacity-65" />
        </button>
        {priOpen ? (
          <Dropdown>
            {(Object.entries(PRIORITIES) as [PriorityKey, typeof PRIORITIES[PriorityKey]][]).map(
              ([k, p]) => (
                <DropdownItem
                  key={k}
                  active={k === priority}
                  onClick={() => {
                    setPriority(k);
                    setPriOpen(false);
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: p.dot }}
                  />
                  {p.label}
                </DropdownItem>
              ),
            )}
          </Dropdown>
        ) : null}
      </div>

      <div ref={projRef} className="relative">
        <button
          type="button"
          onClick={() => setProjOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3 bg-friday-surface border border-friday-border-soft rounded cursor-pointer text-[11.5px] text-friday-fg"
        >
          <I.Folder size={11} />
          {projectLabel ? (
            <span className="font-mono text-[10px] text-friday-fg-muted">
              {projectLabel}
            </span>
          ) : (
            <span className="text-friday-fg-muted">Project</span>
          )}
          <I.ChevDown size={9} className="opacity-65" />
        </button>
        {projOpen ? (
          <Dropdown wide>
            <DropdownItem
              active={projectId === null}
              onClick={() => {
                setProjectId(null);
                setProjOpen(false);
              }}
            >
              <span className="text-friday-fg-muted">No project</span>
            </DropdownItem>
            {projects.slice(0, 30).map((p) => (
              <DropdownItem
                key={p.id}
                active={projectId === p.id}
                onClick={() => {
                  setProjectId(p.id);
                  setProjOpen(false);
                }}
              >
                <span className="font-mono text-[9.5px] text-friday-fg-muted">
                  {p.code}
                </span>
                <span className="flex-1 ml-1.5">{p.title}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        ) : null}
      </div>

      <div ref={dueRef} className="relative">
        <button
          type="button"
          onClick={() => setDueOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3 bg-friday-surface border border-friday-border-soft rounded cursor-pointer text-[11.5px] text-friday-fg"
        >
          <I.Calendar size={11} />
          {fmtDue(due)}
          <I.ChevDown size={9} className="opacity-65" />
        </button>
        {dueOpen ? (
          <Dropdown>
            {[
              { l: "Today", d: dayDelta(0) },
              { l: "Tomorrow", d: dayDelta(1) },
              { l: "In 3 days", d: dayDelta(3) },
              { l: "Next week", d: dayDelta(7) },
              { l: "In 2 weeks", d: dayDelta(14) },
            ].map((o) => (
              <DropdownItem
                key={o.l}
                active={o.d === due}
                onClick={() => {
                  setDue(o.d);
                  setDueOpen(false);
                }}
              >
                {o.l}
                <span className="flex-1" />
                <span className="font-mono text-[9.5px] text-friday-fg-subtle">
                  {fmtDue(o.d)}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        ) : null}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        className={cn(
          "h-8 px-3.5 border-0 rounded text-[12px] font-medium inline-flex items-center gap-1.5",
          title.trim()
            ? "bg-friday-accent text-white cursor-pointer"
            : "bg-friday-surface-2 text-friday-fg-muted cursor-default",
        )}
      >
        <I.Plus size={12} />
        Add
      </button>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────
function StatusCircle({ status }: { status: Task["status"] }) {
  const color =
    status === "done" ? "#6e9b5b" : status === "doing" ? "#e9b850" : "#a8a59d";
  return (
    <span
      className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center p-0"
      style={{
        border: `1.5px solid ${color}`,
        background:
          status === "done" ? color : status === "doing" ? "#e9b85033" : "transparent",
      }}
    >
      {status === "done" ? (
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      ) : status === "doing" ? (
        <span
          className="w-1 h-1 rounded-full"
          style={{ background: "#e9b850" }}
        />
      ) : null}
    </span>
  );
}

function TaskCard({
  task,
  expanded,
  onCycle,
  onExpand,
  onDelete,
  onDescChange,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task;
  expanded: boolean;
  onCycle: () => void;
  onExpand: () => void;
  onDelete: () => void;
  onDescChange: (v: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const overdue = isOverdue(task.dueDate, task.status);
  const isDone = task.status === "done";
  const pri = PRIORITIES[task.priority] ?? PRIORITIES.medium;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative bg-friday-surface border rounded-md cursor-grab transition-[box-shadow,border-color,opacity] duration-150",
        expanded ? "border-friday-border" : "border-friday-border-soft",
        hover ? "shadow-[0_2px_8px_rgba(20,18,12,0.06)]" : "",
      )}
      style={{
        padding: "11px 12px",
        opacity: isDragging ? 0.4 : isDone ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCycle();
          }}
          aria-label="Cycle status"
          className="bg-transparent border-0 p-0 cursor-pointer"
        >
          <StatusCircle status={task.status} />
        </button>
        <div
          onClick={onExpand}
          className={cn(
            "flex-1 min-w-0 text-[12.5px] text-friday-fg leading-snug font-medium cursor-pointer",
            isDone ? "line-through" : "",
          )}
        >
          {task.title}
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="More"
            className="w-5 h-5 p-0 bg-transparent border-0 cursor-pointer text-friday-fg-muted rounded-sm flex items-center justify-center transition-opacity duration-150"
            style={{ opacity: hover || menuOpen ? 1 : 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="6" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18" cy="12" r="1.6" />
            </svg>
          </button>
          {menuOpen ? (
            <Dropdown>
              <DropdownItem
                onClick={() => {
                  setMenuOpen(false);
                  onExpand();
                }}
              >
                Edit
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <span style={{ color: "#9b2c1a" }}>Delete</span>
              </DropdownItem>
            </Dropdown>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Pill bg={pri.bg} fg={pri.fg}>
          <span
            className="w-1 h-1 rounded-full mr-1"
            style={{ background: pri.dot }}
          />
          {pri.label}
        </Pill>
        {task.dueDate ? (
          <Pill
            bg={overdue ? "#fde4dd" : "var(--friday-surface-2)"}
            fg={overdue ? "#9b2c1a" : "var(--friday-fg-muted)"}
          >
            <I.Calendar size={9} />
            <span className="ml-1">{fmtDue(task.dueDate)}</span>
          </Pill>
        ) : null}
        {task.project ? (
          <Pill bg="var(--friday-surface-2)" fg="var(--friday-fg-muted)">
            <span className="font-mono text-[9.5px] tracking-wide">
              {task.project.code}
            </span>
          </Pill>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2.5 pt-2.5 border-t border-friday-border-soft">
          <textarea
            defaultValue={task.description ?? ""}
            placeholder="Add a description…"
            className="w-full min-h-[60px] border border-friday-border-soft rounded p-2 bg-friday-bg text-[11.5px] text-friday-fg resize-y outline-none"
            style={{ lineHeight: 1.5 }}
            onBlur={(e) => {
              const next = e.target.value;
              if (next !== (task.description ?? "")) onDescChange(next);
            }}
          />
          <div className="mt-2 font-mono text-[9.5px] text-friday-fg-subtle tracking-wide">
            CREATED{" "}
            {Math.max(
              0,
              Math.round(
                (Date.now() - new Date(task.createdAt).getTime()) / 86400000,
              ),
            )}{" "}
            DAY
            {Math.max(
              0,
              Math.round(
                (Date.now() - new Date(task.createdAt).getTime()) / 86400000,
              ),
            ) === 1
              ? ""
              : "S"}{" "}
            AGO
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────
function Column({
  status,
  tasks,
  expandedId,
  onCycle,
  onExpand,
  onDelete,
  onDescChange,
  onDrop,
  dragId,
  onDragStartTask,
  onDragEndTask,
}: {
  status: (typeof STATUSES)[number];
  tasks: Task[];
  expandedId: string | null;
  onCycle: (t: Task) => void;
  onExpand: (id: string) => void;
  onDelete: (t: Task) => void;
  onDescChange: (t: Task, v: string) => void;
  onDrop: (statusKey: Task["status"]) => void;
  dragId: string | null;
  onDragStartTask: (t: Task) => void;
  onDragEndTask: () => void;
}) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(status.key);
      }}
      className="flex-1 min-w-0 flex flex-col rounded-md transition-colors duration-100"
      style={{
        background: over ? "rgba(30,58,138,0.025)" : "transparent",
      }}
    >
      <div className="h-9 px-3 bg-friday-surface-2 border border-friday-border-soft rounded-md mb-2.5 flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: status.color }}
        />
        <span className="text-[11.5px] text-friday-fg font-semibold tracking-wide">
          {status.label}
        </span>
        <span
          className="px-1.5 py-px rounded-md bg-friday-bg border border-friday-border-soft font-mono text-[9.5px] text-friday-fg-muted tracking-wide"
        >
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1" style={{ minHeight: 100 }}>
        {tasks.length === 0 && !over ? (
          <div
            className="px-4 border border-dashed border-friday-border-soft rounded-md text-center italic text-friday-fg-subtle"
            style={{
              fontFamily: "var(--font-friday-serif), Georgia, serif",
              fontSize: 13,
              padding: "32px 16px",
            }}
          >
            {status.emptyMsg}
          </div>
        ) : null}
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            expanded={expandedId === t.id}
            onCycle={() => onCycle(t)}
            onExpand={() => onExpand(t.id)}
            onDelete={() => onDelete(t)}
            onDescChange={(v) => onDescChange(t, v)}
            onDragStart={() => onDragStartTask(t)}
            onDragEnd={onDragEndTask}
            isDragging={dragId === t.id}
          />
        ))}
        {over && dragId ? (
          <div
            className="rounded-md"
            style={{
              height: 36,
              border: "1.5px dashed var(--friday-accent)",
              background: "rgba(30,58,138,0.04)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [projects, setProjects] = React.useState<ProjectOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<"board" | "list">("board");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [ariaDismissed, setAriaDismissed] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/projects?limit=100"),
      ]);
      if (tRes.ok) {
        const data = (await tRes.json()) as Task[];
        setTasks(data);
      }
      if (pRes.ok) {
        const data = (await pRes.json()) as
          | { projects: ProjectOpt[] }
          | ProjectOpt[];
        const list = Array.isArray(data) ? data : data.projects ?? [];
        setProjects(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onAdd = async (input: {
    title: string;
    priority: PriorityKey;
    projectId: string | null;
    dueDate: string;
  }) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const created = (await res.json()) as Task;
        setTasks((prev) => [...prev, created]);
        showToast("Task added");
      }
    } catch {
      showToast("Couldn't add task", "danger");
    }
  };

  const onCycle = async (task: Task) => {
    const order: Task["status"][] = ["todo", "doing", "done"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    showToast(STATUSES.find((s) => s.key === next)?.label ?? "Updated");
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    } catch {
      fetchAll();
    }
  };

  const onDelete = async (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    showToast("Task deleted");
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    } catch {
      fetchAll();
    }
  };

  const onDescChange = async (task: Task, description: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, description } : t)),
    );
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      showToast("Saved");
    } catch {
      // silent — re-fetch on next mount
    }
  };

  const onDropTo = async (statusKey: Task["status"]) => {
    if (!dragId) return;
    const task = tasks.find((t) => t.id === dragId);
    if (!task || task.status === statusKey) {
      setDragId(null);
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === dragId ? { ...t, status: statusKey } : t)),
    );
    showToast(STATUSES.find((s) => s.key === statusKey)?.label ?? "Moved");
    setDragId(null);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusKey }),
      });
    } catch {
      fetchAll();
    }
  };

  const total = tasks.length;
  const doing = tasks.filter((t) => t.status === "doing").length;
  const overdueCount = tasks.filter((t) =>
    isOverdue(t.dueDate, t.status),
  ).length;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-friday-bg">
      <TasksHeader
        total={total}
        doing={doing}
        overdue={overdueCount}
        view={view}
        setView={setView}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        {!ariaDismissed && overdueCount > 0 ? (
          <AriaSuggest
            overdueCount={overdueCount}
            onTriage={() =>
              showToast(`Aria · triaging ${overdueCount} tasks`)
            }
            onDismiss={() => setAriaDismissed(true)}
          />
        ) : null}

        <TaskComposer projects={projects} onSubmit={onAdd} />

        {loading ? (
          <div className="text-[12px] text-friday-fg-muted text-center py-10">
            Loading…
          </div>
        ) : view === "board" ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr",
              margin: "20px 28px 28px",
            }}
          >
            {STATUSES.map((s) => (
              <Column
                key={s.key}
                status={s}
                tasks={tasks.filter((t) => t.status === s.key)}
                expandedId={expandedId}
                onCycle={onCycle}
                onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onDelete={onDelete}
                onDescChange={onDescChange}
                onDrop={onDropTo}
                dragId={dragId}
                onDragStartTask={(t) => setDragId(t.id)}
                onDragEndTask={() => setDragId(null)}
              />
            ))}
          </div>
        ) : (
          <div
            className="border border-friday-border-soft rounded-md bg-friday-bg overflow-hidden"
            style={{ margin: "20px 28px 28px" }}
          >
            {tasks.map((t, i) => {
              const overdue = isOverdue(t.dueDate, t.status);
              return (
                <div
                  key={t.id}
                  className={cn(
                    "px-3.5 py-2.5 flex items-center gap-2.5",
                    i < tasks.length - 1
                      ? "border-b border-friday-border-soft"
                      : "",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onCycle(t)}
                    aria-label="Cycle status"
                    className="bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <StatusCircle status={t.status} />
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-[12.5px] text-friday-fg truncate",
                      t.status === "done" ? "line-through opacity-70" : "",
                    )}
                  >
                    {t.title}
                  </span>
                  <Pill
                    bg={PRIORITIES[t.priority]?.bg ?? PRIORITIES.medium.bg}
                    fg={PRIORITIES[t.priority]?.fg ?? PRIORITIES.medium.fg}
                  >
                    {PRIORITIES[t.priority]?.label ?? "Medium"}
                  </Pill>
                  {t.dueDate ? (
                    <Pill
                      bg={overdue ? "#fde4dd" : "var(--friday-surface-2)"}
                      fg={overdue ? "#9b2c1a" : "var(--friday-fg-muted)"}
                    >
                      {fmtDue(t.dueDate)}
                    </Pill>
                  ) : null}
                  {t.project ? (
                    <Pill bg="var(--friday-surface-2)" fg="var(--friday-fg-muted)">
                      <span className="font-mono text-[9.5px]">
                        {t.project.code}
                      </span>
                    </Pill>
                  ) : null}
                </div>
              );
            })}
            {tasks.length === 0 ? (
              <div
                className="text-center italic text-friday-fg-subtle"
                style={{
                  fontFamily: "var(--font-friday-serif), Georgia, serif",
                  fontSize: 13,
                  padding: "40px 16px",
                }}
              >
                Nothing on your plate. Quiet day.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
