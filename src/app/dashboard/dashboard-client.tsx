"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/friday/avatar";
import { I } from "@/components/friday/icons";
import { PhasePill } from "@/components/friday/phase-pill";
import { StatusDot } from "@/components/friday/status-dot";
import { EmptyState } from "@/components/friday/empty-state";
import { Skeleton } from "@/components/friday/skeleton";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
export interface DashboardKpi {
  active: number;
  terminato: number;
  inProgress: number;
  stuck: number;
  deadlines14d: number;
  highPriority: number;
}

export interface DashboardTask {
  id: string;
  title: string;
  code: string | null;
  projectId: string | null;
  priority: "high" | "medium" | "low" | "critical";
  dueLabel: string;
  state: "todo" | "doing" | "done";
}

export interface DashboardActivity {
  id: string;
  who: string;
  initials: string;
  description: string;
  code: string | null;
  projectId: string | null;
  projectTitle: string | null;
  ago: string;
}

export interface DashboardStarred {
  id: string;
  code: string;
  title: string;
  phase: string | null;
  workStatus: string | null;
  image: string | null;
}

interface DashboardClientProps {
  greetingName: string;
  todayLabel: string;
  kpi: DashboardKpi;
  tasks: DashboardTask[];
  activity: DashboardActivity[];
  starred: DashboardStarred[];
}

// ─── Hero ─────────────────────────────────────────────────────────
function DashHero({
  name,
  date,
  activeCount,
  stuckCount,
  onStuckClick,
}: {
  name: string;
  date: string;
  activeCount: number;
  stuckCount: number;
  onStuckClick: () => void;
}) {
  return (
    <div className="h-24 flex items-center gap-4 px-7 border-b border-friday-border-soft">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <h1 className="font-display italic font-medium text-[28px] text-friday-fg m-0 -tracking-[0.5px] leading-[1.15]">
          Buongiorno, {name}.
        </h1>
        <span className="text-[13px] text-friday-fg-muted">
          Friday · {date}
        </span>
      </div>
      <button
        type="button"
        onClick={onStuckClick}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-friday-surface-2 border border-friday-border-soft text-[12.5px] text-friday-fg cursor-pointer hover:border-friday-border hover:bg-friday-surface transition-colors duration-150"
      >
        <span className="text-friday-fg">{activeCount} active projects</span>
        {stuckCount > 0 ? (
          <>
            <span className="text-friday-fg-subtle">·</span>
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: "#b91c1c" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#ef4444" }}
              />
              {stuckCount} stuck
            </span>
          </>
        ) : null}
      </button>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────
function KpiCard({
  eyebrow,
  value,
  sublabel,
  accent,
  onClick,
}: {
  eyebrow: string;
  value: number | string;
  sublabel: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-friday-surface border border-friday-border-soft rounded p-4 flex flex-col gap-2 text-left transition-colors duration-150",
        onClick ? "cursor-pointer hover:border-friday-border hover:bg-friday-surface" : "cursor-default",
      )}
    >
      <div className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-semibold">
        {eyebrow}
      </div>
      <div
        className="text-[28px] font-semibold tabular-nums -tracking-[0.6px] leading-none"
        style={{ color: accent ? "#b91c1c" : "var(--friday-fg)" }}
      >
        {value}
      </div>
      <div className="text-[12px] text-friday-fg-muted leading-snug">
        {sublabel}
      </div>
    </button>
  );
}

// ─── Card primitives ──────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-friday-surface border border-friday-border-soft rounded overflow-hidden flex flex-col">
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-3.5 py-3 border-b border-friday-border-soft text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-semibold">
      <span className="flex-1">{children}</span>
    </div>
  );
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5 border-t border-friday-border-soft bg-friday-bg">
      {children}
    </div>
  );
}

// ─── Today's focus ────────────────────────────────────────────────
const PRIORITY: Record<string, string> = {
  critical: "#ef4444",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#a8a59d",
};

function TaskRow({
  task,
  onCycle,
  onOpen,
  isLast,
}: {
  task: DashboardTask;
  onCycle: (t: DashboardTask) => void;
  onOpen: (t: DashboardTask) => void;
  isLast: boolean;
}) {
  const isToday = task.dueLabel === "Today";
  const dueColor = isToday
    ? "#b91c1c"
    : task.state === "done"
      ? "var(--friday-fg-subtle)"
      : "var(--friday-fg-muted)";
  const stateGlyph =
    task.state === "done" ? (
      <I.Check size={9.5} strokeWidth={2.5} className="text-friday-fg" />
    ) : task.state === "doing" ? (
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--friday-accent)" }}
      />
    ) : null;

  return (
    <div
      onClick={() => onOpen(task)}
      className={cn(
        "flex items-center gap-3 h-9 px-3.5 cursor-pointer transition-colors duration-150 hover:bg-friday-surface-2",
        isLast ? "" : "border-b border-friday-border-soft",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle(task);
        }}
        className="w-4 h-4 rounded-full shrink-0 border-[1.5px] flex items-center justify-center p-0 cursor-pointer transition-transform duration-100 hover:scale-105"
        style={{
          borderColor:
            task.state === "done"
              ? "var(--friday-fg)"
              : task.state === "doing"
                ? "var(--friday-accent)"
                : "var(--friday-border)",
          background:
            task.state === "done" ? "var(--friday-surface-2)" : "transparent",
        }}
        aria-label="Cycle status"
      >
        {stateGlyph}
      </button>

      <span
        className={cn(
          "flex-1 min-w-0 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis -tracking-[0.05px]",
          task.state === "done"
            ? "text-friday-fg-subtle line-through"
            : "text-friday-fg",
        )}
      >
        {task.title}
      </span>

      {task.code ? (
        <span className="font-mono text-[10px] text-friday-fg-muted tracking-wide px-1.5 py-0.5 shrink-0 border border-friday-border-soft rounded-sm whitespace-nowrap">
          {task.code}
        </span>
      ) : null}

      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: PRIORITY[task.priority] ?? PRIORITY.low }}
      />

      <span
        className={cn(
          "text-[11.5px] whitespace-nowrap shrink-0 min-w-[60px] text-right",
          isToday ? "font-medium" : "",
        )}
        style={{ color: dueColor }}
      >
        {task.dueLabel}
      </span>
    </div>
  );
}

function TodaysFocus({
  initial,
  onViewAll,
  onOpenTask,
}: {
  initial: DashboardTask[];
  onViewAll: () => void;
  onOpenTask: (t: DashboardTask) => void;
}) {
  const [tasks, setTasks] = React.useState<DashboardTask[]>(initial);

  const cycle = (task: DashboardTask) => {
    const next: DashboardTask["state"] =
      task.state === "todo" ? "doing" : task.state === "doing" ? "done" : "todo";
    setTasks((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, state: next } : t)),
    );
    if (next === "done") {
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }).catch(() => {});
      showToast(`Task completed${task.code ? ` · ${task.code}` : ""}`);
    }
  };

  return (
    <Card>
      <CardHeader>Today&apos;s focus</CardHeader>
      {tasks.length === 0 ? (
        <EmptyState
          title="Nothing on your plate today."
          description="Take five. Or pull up tomorrow's tasks if you're feeling ambitious."
        />
      ) : (
        <>
          <div>
            {tasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                onCycle={cycle}
                onOpen={onOpenTask}
                isLast={i === tasks.length - 1}
              />
            ))}
          </div>
          <CardFooter>
            <button
              type="button"
              onClick={onViewAll}
              className="bg-transparent border-0 p-0 cursor-pointer text-[12px] text-friday-fg-muted font-medium -tracking-[0.05px] inline-flex items-center gap-1.5 hover:text-friday-accent transition-colors duration-150"
            >
              View all tasks <I.ArrowRight size={11} />
            </button>
          </CardFooter>
        </>
      )}
    </Card>
  );
}

// ─── What changed ─────────────────────────────────────────────────
function ActivityRow({
  a,
  onOpen,
  isLast,
}: {
  a: DashboardActivity;
  onOpen: (a: DashboardActivity) => void;
  isLast: boolean;
}) {
  return (
    <div
      onClick={() => onOpen(a)}
      className={cn(
        "flex items-center gap-2.5 px-3.5 h-11 cursor-pointer transition-colors duration-150 hover:bg-friday-surface-2",
        isLast ? "" : "border-b border-friday-border-soft",
      )}
    >
      <Avatar initials={a.initials} size={24} />
      <div className="flex-1 min-w-0 text-[12px] leading-snug whitespace-nowrap overflow-hidden text-ellipsis">
        <span className="text-friday-fg-subtle">{a.who} </span>
        <span className="text-friday-fg">{a.description}</span>
        {a.code ? (
          <>
            {" "}
            <span className="font-mono text-[10.5px] text-friday-fg-muted tracking-wide">
              [{a.code}]
            </span>
          </>
        ) : null}
        {a.projectTitle ? (
          <>
            {" "}
            <span className="font-display italic font-medium text-[13px] text-friday-fg -tracking-[0.1px]">
              {a.projectTitle}
            </span>
          </>
        ) : null}
      </div>
      <span className="text-[11px] text-friday-fg-subtle whitespace-nowrap shrink-0">
        {a.ago}
      </span>
    </div>
  );
}

function WhatChanged({
  activity,
  onOpen,
}: {
  activity: DashboardActivity[];
  onOpen: (a: DashboardActivity) => void;
}) {
  return (
    <Card>
      <CardHeader>What changed</CardHeader>
      {activity.length === 0 ? (
        <EmptyState
          title="Quiet week."
          description="Nothing's moved in the studio over the last few days."
        />
      ) : (
        <div>
          {activity.map((a, i) => (
            <ActivityRow
              key={a.id}
              a={a}
              onOpen={onOpen}
              isLast={i === activity.length - 1}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Starred scroller ─────────────────────────────────────────────
function StarCard({
  p,
  focused,
  onOpen,
}: {
  p: DashboardStarred;
  focused: boolean;
  onOpen: (p: DashboardStarred) => void;
}) {
  const [hover, setHover] = React.useState(false);
  const w = 200;
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shrink-0 bg-transparent border-0 p-0 text-left cursor-pointer outline-none rounded transition-shadow duration-100"
      style={{
        width: w,
        boxShadow: focused
          ? "0 0 0 2px var(--friday-bg), 0 0 0 4px var(--friday-accent-ring)"
          : "none",
      }}
    >
      <div
        className="rounded-[3px] overflow-hidden bg-friday-surface-2 border border-friday-border-soft relative"
        style={{ width: w, height: w * 0.75 }}
      >
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.title}
            className="w-full h-full object-cover transition-transform duration-300"
            style={{
              filter: "grayscale(1) contrast(1.02)",
              transform: hover ? "scale(1.02)" : "scale(1)",
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-friday-fg-subtle font-display italic text-sm">
            {p.title}
          </div>
        )}
        <div
          className="absolute top-2 left-2 font-mono text-[9.5px] tracking-wide px-1.5 py-0.5 rounded-sm"
          style={{ background: "rgba(26,26,24,0.72)", color: "#fafaf8" }}
        >
          {p.code}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <span className="text-[13px] text-friday-fg font-medium -tracking-[0.05px] truncate">
          {p.title}
        </span>
        <div className="flex items-center gap-1.5">
          {p.phase ? <PhasePill phase={p.phase} size="sm" /> : null}
          <StatusDot status={p.workStatus} />
        </div>
      </div>
    </button>
  );
}

function StarredScroller({
  starred,
  onOpen,
}: {
  starred: DashboardStarred[];
  onOpen: (p: DashboardStarred) => void;
}) {
  const [focusIdx, setFocusIdx] = React.useState(-1);

  const onKey = (e: React.KeyboardEvent) => {
    if (focusIdx < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, starred.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setFocusIdx(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onOpen(starred[focusIdx]);
    }
  };

  if (starred.length === 0) {
    return (
      <Card>
        <CardHeader>Starred</CardHeader>
        <div className="flex items-center gap-3.5 px-5 py-5 text-[12.5px] text-friday-fg-muted">
          <span className="font-display italic text-base text-friday-fg">
            Star a project to see it here
          </span>
          <I.ArrowRight size={14} className="text-friday-fg-muted" />
        </div>
      </Card>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => focusIdx < 0 && setFocusIdx(0)}
      className="outline-none"
    >
      <div className="flex items-baseline gap-2.5 pb-2.5">
        <span className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-semibold">
          Starred
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-friday-fg-subtle">
          {focusIdx >= 0
            ? "← → navigate · ↵ open · esc blur"
            : `${starred.length} starred`}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {starred.map((p, i) => (
          <StarCard
            key={p.code}
            p={p}
            focused={focusIdx === i}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Aria seam ────────────────────────────────────────────────────
const ARIA_CHIPS = [
  { q: "Who's overloaded?", icon: "users" },
  { q: "Stuck projects?", icon: "alert" },
  { q: "What changed this week?", icon: "activity" },
] as const;

function AriaSeam({ onAsk }: { onAsk: (q: string) => void }) {
  const [val, setVal] = React.useState("");
  const [focus, setFocus] = React.useState(false);

  const submit = (q: string) => {
    onAsk(q);
  };

  return (
    <div className="bg-friday-surface-2 border border-friday-border-soft rounded p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-3.5">
        <div className="w-7 h-7 rounded-full bg-friday-surface border border-friday-border flex items-center justify-center shrink-0">
          <I.Sparkle size={14} className="text-friday-accent" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-semibold">
            Aria · DBS GPT
          </span>
          <span className="font-display italic font-medium text-base text-friday-fg -tracking-[0.2px]">
            Ask anything about DBS.
          </span>
        </div>
        <div className="flex-1" />
        <div
          className={cn(
            "flex items-center gap-1.5 h-[34px] pl-3 pr-1.5 min-w-[320px] flex-[0_1_380px] bg-friday-surface rounded transition-[border-color,box-shadow] duration-150 border",
            focus ? "border-friday-accent" : "border-friday-border",
          )}
          style={{
            boxShadow: focus
              ? "0 0 0 2px var(--friday-bg), 0 0 0 4px var(--friday-accent-ring)"
              : "none",
          }}
        >
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && val.trim()) submit(val);
            }}
            placeholder="Portfolio stats by phase…"
            className="flex-1 border-0 outline-none bg-transparent text-[12.5px] text-friday-fg h-full"
          />
          <button
            type="button"
            onClick={() => submit(val || "Portfolio stats by phase")}
            className="inline-flex items-center gap-1.5 h-[26px] px-2.5 bg-friday-accent text-white border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer tracking-wide hover:opacity-90"
          >
            Ask
            <I.ArrowRight size={11} color="#ffffff" />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 pl-[42px] flex-wrap">
        {ARIA_CHIPS.map((c) => (
          <button
            key={c.q}
            type="button"
            onClick={() => submit(c.q)}
            className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full cursor-pointer text-[11.5px] text-friday-fg -tracking-[0.05px] transition-colors duration-150 border bg-transparent border-friday-border-soft hover:bg-friday-surface hover:border-friday-border"
          >
            {c.icon === "users" ? (
              <I.Users size={11} className="text-friday-fg-muted" />
            ) : c.icon === "alert" ? (
              <I.AlertSmall size={11} className="text-friday-fg-muted" />
            ) : (
              <I.Activity size={11} className="text-friday-fg-muted" />
            )}
            {c.q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Project drawer ───────────────────────────────────────────────
function ProjectDrawer({
  project,
  onClose,
}: {
  project: DashboardStarred | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [enter, setEnter] = React.useState(false);

  React.useEffect(() => {
    if (!project) {
      setEnter(false);
      return;
    }
    const r = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(r);
  }, [project]);

  React.useEffect(() => {
    if (!project) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  if (!project) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex justify-end transition-colors duration-200"
      style={{
        background: enter ? "rgba(26,26,24,0.32)" : "rgba(26,26,24,0)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-friday-surface border-l border-friday-border h-full flex flex-col transition-[transform,opacity] duration-200 ease-out"
        style={{
          width: 520,
          maxWidth: "92vw",
          boxShadow: "0 0 40px rgba(20,18,12,0.12)",
          transform: enter ? "translateX(0)" : "translateX(20px)",
          opacity: enter ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-friday-border-soft">
          <span className="font-mono text-[10.5px] text-friday-fg-muted">
            {project.code}
          </span>
          <span className="font-display italic font-medium text-[18px] text-friday-fg -tracking-[0.2px] flex-1 min-w-0 truncate">
            {project.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-0 p-1 cursor-pointer text-friday-fg-muted hover:text-friday-fg leading-none"
          >
            <I.X size={14} />
          </button>
        </div>
        <div className="flex-1 p-5 text-[12.5px] text-friday-fg-muted leading-relaxed">
          <div className="flex flex-col gap-3">
            <Skeleton width="70%" height={12} />
            <Skeleton width="90%" height={9} />
            <Skeleton width="85%" height={9} />
            <Skeleton width="60%" height={9} />
            <div className="h-2" />
            <span className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-subtle font-semibold">
              Project detail
            </span>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              className="self-start mt-2 h-8 px-3.5 bg-friday-fg text-friday-bg border-0 rounded-[3px] text-[12px] font-medium cursor-pointer tracking-wide"
            >
              Open project →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────
export function DashboardClient({
  greetingName,
  todayLabel,
  kpi,
  tasks,
  activity,
  starred,
}: DashboardClientProps) {
  const router = useRouter();
  const [drawer, setDrawer] = React.useState<DashboardStarred | null>(null);

  const totalForPct = kpi.active + kpi.terminato;
  const pct = totalForPct > 0 ? Math.round((kpi.terminato / totalForPct) * 100) : 0;
  const inProgressLabel =
    kpi.inProgress > 0 ? "MAE, CHANTIER, EXE" : "Nothing in flight";

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <DashHero
        name={greetingName}
        date={todayLabel}
        activeCount={kpi.active}
        stuckCount={kpi.stuck}
        onStuckClick={() => router.push("/dashboard/projects?filter=stuck")}
      />

      <div className="px-7 py-5 flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            eyebrow="Terminato"
            value={kpi.terminato}
            sublabel={`${pct}% of portfolio`}
            onClick={() => router.push("/dashboard/projects?phase=TERMINATO")}
          />
          <KpiCard
            eyebrow="In progress"
            value={kpi.inProgress}
            sublabel={inProgressLabel}
            onClick={() => router.push("/dashboard/projects?filter=in-progress")}
          />
          <KpiCard
            eyebrow="Deadlines (next 14d)"
            value={kpi.deadlines14d}
            sublabel={
              kpi.highPriority > 0
                ? `${kpi.highPriority} high priority`
                : "No urgent items"
            }
            accent
            onClick={() => router.push("/dashboard/agenda")}
          />
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "3fr 2fr" }}>
          <TodaysFocus
            initial={tasks}
            onViewAll={() => router.push("/dashboard/tasks")}
            onOpenTask={(t) => {
              if (t.projectId) router.push(`/dashboard/projects/${t.projectId}`);
              else router.push("/dashboard/tasks");
            }}
          />
          <WhatChanged
            activity={activity}
            onOpen={(a) => {
              if (a.projectId) router.push(`/dashboard/projects/${a.projectId}`);
            }}
          />
        </div>

        <div>
          <StarredScroller starred={starred} onOpen={(p) => setDrawer(p)} />
        </div>

        <AriaSeam
          onAsk={(q) =>
            router.push(`/dashboard/ai/gpt?q=${encodeURIComponent(q)}`)
          }
        />
      </div>

      <ProjectDrawer project={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
