"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/friday/avatar";
import { FridayPageHeader } from "@/components/friday/page-header";
import { I } from "@/components/friday/icons";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { id: string; name: string | null; initials: string; image: string | null };
  project: { id: string; title: string; code: string } | null;
}

export interface PersonOption {
  id: string;
  name: string;
  initials: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  code: string;
}

interface ActivityClientProps {
  initialActivities: ActivityItem[];
  people: PersonOption[];
  projects: ProjectOption[];
}

// ─── Type vocabulary ──────────────────────────────────────────────
// Map the real DB activity-type values onto a glyph + display label.
// Unknown types fall back to a generic dot.
type TypeMeta = { label: string; glyph: TypeGlyphKind };
type TypeGlyphKind =
  | "joined"
  | "comment"
  | "upload"
  | "approve"
  | "phase"
  | "meeting"
  | "task"
  | "insight"
  | "thread"
  | "default";

const TYPE_META: Record<string, TypeMeta> = {
  PROJECT_CREATED: { label: "Project created", glyph: "phase" },
  PROJECT_UPDATED: { label: "Project updated", glyph: "phase" },
  PROJECT_DELETED: { label: "Project deleted", glyph: "phase" },
  USER_JOINED: { label: "Joined", glyph: "joined" },
  USER_UPDATED: { label: "User updated", glyph: "joined" },
  FILE_UPLOADED: { label: "Uploaded", glyph: "upload" },
  COMMENT: { label: "Commented", glyph: "comment" },
  THREAD_CREATED: { label: "Thread", glyph: "thread" },
  MEETING: { label: "Meeting", glyph: "meeting" },
  TASK_DONE: { label: "Task done", glyph: "task" },
  INSIGHT_SAVED: { label: "Insight", glyph: "insight" },
};

function metaFor(type: string): TypeMeta {
  return TYPE_META[type] ?? { label: type, glyph: "default" };
}

function TypeGlyph({
  kind,
  size = 12,
  className,
}: {
  kind: TypeGlyphKind;
  size?: number;
  className?: string;
}) {
  const sw = 1.6;
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (kind) {
    case "joined":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 19c.7-3.5 3.5-5 6-5s5.3 1.5 6 5" />
          <path d="M18 7v6M15 10h6" />
        </svg>
      );
    case "comment":
      return (
        <svg {...props}>
          <path d="M21 12c0 4.4-4 8-9 8-1.4 0-2.8-.3-4-.8L3 20l.9-4.5C3.3 14.3 3 13.2 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
        </svg>
      );
    case "upload":
      return (
        <svg {...props}>
          <path d="M12 4v12M6 10l6-6 6 6M4 20h16" />
        </svg>
      );
    case "approve":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l3 3 5-6" />
        </svg>
      );
    case "phase":
      return (
        <svg {...props}>
          <circle cx="6" cy="7" r="2.2" />
          <circle cx="6" cy="17" r="2.2" />
          <circle cx="18" cy="7" r="2.2" />
          <path d="M6 9.2v5.6M8 7h6c1.5 0 2 1 2 2v8" />
        </svg>
      );
    case "meeting":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="M16 10l5-3v10l-5-3z" />
        </svg>
      );
    case "task":
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 12.5l3 3 5-6" />
        </svg>
      );
    case "insight":
      return (
        <svg {...props}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        </svg>
      );
    case "thread":
      return (
        <svg {...props}>
          <path d="M5 9h14M5 15h14M9 5L7.5 19M16.5 5L15 19" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

// ─── Date helpers ─────────────────────────────────────────────────
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date, now: Date): string {
  const today = startOfDay(now);
  const dd = startOfDay(d);
  const diff = Math.round((today.getTime() - dd.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function relTime(d: Date, now: Date): string {
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function fullStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Filter chip + dropdown ───────────────────────────────────────
function FilterChip({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const active = !!value;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11px] font-medium transition-colors duration-150 cursor-pointer border",
          active
            ? "bg-friday-fg text-friday-bg border-friday-fg"
            : open
              ? "bg-friday-surface border-friday-border-soft text-friday-fg"
              : "bg-friday-bg border-friday-border-soft text-friday-fg hover:border-friday-fg-muted",
        )}
      >
        <span className={active ? "text-friday-bg" : "text-friday-fg-muted"}>
          {label}
        </span>
        {value ? <span className="text-friday-bg">· {value}</span> : null}
        <I.ChevDown
          size={9}
          className={cn(
            "opacity-65 transition-transform duration-150",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open ? (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-50 min-w-[220px] p-1 bg-friday-bg border border-friday-border rounded-md max-h-[320px] overflow-y-auto"
          style={{ boxShadow: "0 12px 28px rgba(20,18,12,0.14)" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DropdownItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full text-left px-2.5 py-1.5 rounded-sm bg-transparent border-0 cursor-pointer text-[11.5px] text-friday-fg",
        active ? "bg-friday-surface-3" : "hover:bg-friday-surface",
      )}
    >
      {children}
    </button>
  );
}

function DateRangeChip({
  range,
  setRange,
  open,
  onToggle,
}: {
  range: number;
  setRange: (n: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const label = range === 30 ? "30d" : range === 7 ? "7d" : range === 1 ? "Today" : "Custom";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11px] text-friday-fg font-medium cursor-pointer border border-friday-border-soft",
          open ? "bg-friday-surface" : "bg-friday-bg",
        )}
      >
        <I.Calendar size={11} className="opacity-70" />
        {label}
      </button>
      {open ? (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-50 min-w-[200px] p-1 bg-friday-bg border border-friday-border rounded-md"
          style={{ boxShadow: "0 12px 28px rgba(20,18,12,0.14)" }}
        >
          {[
            { v: 1, l: "Today" },
            { v: 7, l: "Last 7 days" },
            { v: 30, l: "Last 30 days" },
          ].map((o) => (
            <DropdownItem key={o.v} active={range === o.v} onClick={() => setRange(o.v)}>
              {o.l}
            </DropdownItem>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Activity item ────────────────────────────────────────────────
function ActivityRow({
  it,
  now,
  onProject,
  onPerson,
}: {
  it: ActivityItem;
  now: Date;
  onProject: (p: ProjectOption) => void;
  onPerson: (p: PersonOption) => void;
}) {
  const [stampHover, setStampHover] = React.useState(false);
  const meta = metaFor(it.type);
  const created = new Date(it.createdAt);

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 -mx-1 rounded-sm hover:bg-friday-surface transition-colors duration-150 border-b border-friday-border-soft">
      <div className="shrink-0 relative" style={{ width: 28, height: 28 }}>
        <Avatar initials={it.user.initials} size={28} imageUrl={it.user.image} />
        <span
          className="absolute -right-0.5 -bottom-0.5 inline-flex items-center justify-center rounded-full"
          style={{
            width: 14,
            height: 14,
            background: "var(--friday-bg)",
            border: "1.5px solid var(--friday-bg)",
          }}
        >
          <span
            className="inline-flex items-center justify-center rounded-full bg-friday-surface-2 text-friday-fg-muted"
            style={{
              width: 12,
              height: 12,
              border: "1px solid var(--friday-border-soft)",
            }}
          >
            <TypeGlyph kind={meta.glyph} size={7.5} />
          </span>
        </span>
      </div>

      <div
        className="flex-1 min-w-0 text-[12.5px] text-friday-fg leading-snug whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ fontFamily: "var(--font-friday-sans), system-ui, sans-serif" }}
      >
        <button
          type="button"
          onClick={() =>
            onPerson({
              id: it.user.id,
              name: it.user.name ?? it.user.initials,
              initials: it.user.initials,
            })
          }
          className="bg-transparent border-0 p-0 cursor-pointer text-friday-fg-subtle font-medium hover:text-friday-fg"
        >
          {it.user.name ?? it.user.initials}
        </button>{" "}
        <span className="text-friday-fg">{it.description}</span>
        {it.project ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => onProject(it.project!)}
              className="bg-transparent border-0 p-0 cursor-pointer font-mono text-[11.5px] text-friday-fg font-medium tracking-wide hover:underline"
            >
              <span className="text-friday-fg-subtle mr-1">{it.project.code}</span>
              {it.project.title}
            </button>
          </>
        ) : null}
      </div>

      <div
        className="relative shrink-0"
        onMouseEnter={() => setStampHover(true)}
        onMouseLeave={() => setStampHover(false)}
      >
        <span
          className="font-mono text-[10.5px] text-friday-fg-subtle tracking-wide tabular-nums"
        >
          {relTime(created, now)}
        </span>
        {stampHover ? (
          <div
            className="absolute bottom-[calc(100%+6px)] right-0 z-10 px-2 py-1 rounded-sm whitespace-nowrap text-[10px] tracking-wide"
            style={{
              background: "var(--friday-fg)",
              color: "var(--friday-bg)",
              boxShadow: "0 4px 12px rgba(20,18,12,0.18)",
            }}
          >
            {fullStamp(created)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Day group ────────────────────────────────────────────────────
function DayGroup({
  label,
  items,
  isToday,
  now,
  onProject,
  onPerson,
}: {
  label: string;
  items: ActivityItem[];
  isToday: boolean;
  now: Date;
  onProject: (p: ProjectOption) => void;
  onPerson: (p: PersonOption) => void;
}) {
  return (
    <div className="mb-6">
      <div
        className="flex items-baseline gap-2.5 py-2 sticky top-0 z-[2]"
        style={{
          background:
            "linear-gradient(to bottom, var(--friday-bg) 65%, rgba(250,250,248,0))",
        }}
      >
        <h3
          className={cn(
            "text-[9.5px] font-semibold uppercase tracking-[0.22em] m-0",
            isToday ? "text-friday-fg" : "text-friday-fg-muted",
          )}
        >
          {label}
        </h3>
        <span className="font-mono text-[10px] text-friday-fg-subtle tracking-wide">
          {items.length === 0 ? "0 events" : items.length === 1 ? "1 event" : `${items.length} events`}
        </span>
        <span className="flex-1 h-px bg-friday-border-soft ml-1.5" />
      </div>
      {items.length === 0 ? (
        <div className="py-3.5 px-1 text-[14px] italic text-friday-fg-subtle font-display">
          Quiet day.
        </div>
      ) : (
        items.map((it) => (
          <ActivityRow
            key={it.id}
            it={it}
            now={now}
            onProject={onProject}
            onPerson={onPerson}
          />
        ))
      )}
    </div>
  );
}

// ─── Project drawer ───────────────────────────────────────────────
function ProjectDrawer({
  project,
  onClose,
}: {
  project: ProjectOption | null;
  onClose: () => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    if (!project) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 transition-opacity duration-200 z-40",
          project ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{ background: "rgba(20,18,12,0.32)" }}
      />
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[41] flex flex-col bg-friday-bg border-l border-friday-border transition-transform duration-200 ease-out",
          project ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          width: 440,
          maxWidth: "90vw",
          boxShadow: "-12px 0 32px rgba(20,18,12,0.10)",
        }}
      >
        {project ? (
          <>
            <div className="p-5 border-b border-friday-border-soft flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-friday-fg-subtle tracking-wide mb-1">
                  {project.code}
                </div>
                <h2 className="font-display italic font-medium text-[22px] text-friday-fg m-0 tracking-tight">
                  {project.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="bg-transparent border-0 p-1.5 cursor-pointer text-friday-fg-muted hover:text-friday-fg leading-none"
              >
                <I.X size={16} />
              </button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto">
              <div
                className="rounded mb-4 flex items-center justify-center font-display italic text-[16px] text-friday-fg-subtle"
                style={{
                  aspectRatio: "4/3",
                  background: "linear-gradient(135deg, #ece6d8 0%, #d4cdb9 100%)",
                }}
              >
                Project preview
              </div>
              <p className="text-[13px] text-friday-fg-muted leading-relaxed m-0 font-serif-friday">
                Open the full project to see plans, threads, meetings, tasks, and the AI seam.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="mt-4 h-8 px-3.5 bg-friday-fg text-friday-bg border-0 rounded-[3px] text-[12px] font-medium cursor-pointer tracking-wide"
              >
                Open project →
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

// ─── Person overlay ───────────────────────────────────────────────
function PersonOverlay({
  person,
  onClose,
}: {
  person: PersonOption | null;
  onClose: () => void;
}) {
  if (!person) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(20,18,12,0.32)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] p-6 bg-friday-bg border border-friday-border rounded-md text-center"
        style={{ boxShadow: "0 24px 60px rgba(20,18,12,0.18)" }}
      >
        <div className="flex justify-center mb-3">
          <Avatar initials={person.initials} size={56} />
        </div>
        <h3 className="font-display italic font-medium text-[22px] text-friday-fg m-0 tracking-tight">
          {person.name}
        </h3>
        <p className="text-[11px] text-friday-fg-muted mt-1 mb-4 tracking-wide">
          DBS member
        </p>
        <button
          type="button"
          onClick={onClose}
          className="h-[30px] px-3.5 bg-friday-fg text-friday-bg border-0 rounded-[3px] text-[11.5px] font-medium cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main client component ───────────────────────────────────────
export function ActivityClient({
  initialActivities,
  people,
  projects,
}: ActivityClientProps) {
  const [now] = React.useState(() => new Date());
  const [activities, setActivities] = React.useState<ActivityItem[]>(initialActivities);
  const [loading, setLoading] = React.useState(false);
  const [filters, setFilters] = React.useState<{
    project: string | null;
    person: string | null;
    type: string | null;
  }>({ project: null, person: null, type: null });
  const [range, setRange] = React.useState(30);
  const [dropdown, setDropdown] = React.useState<string | null>(null);
  const [drawerProject, setDrawerProject] = React.useState<ProjectOption | null>(null);
  const [personOverlay, setPersonOverlay] = React.useState<PersonOption | null>(null);

  // Fetch when filters change (after the initial render)
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (filters.project) params.set("projectId", filters.project);
    if (filters.person) params.set("userId", filters.person);
    if (filters.type) params.set("type", filters.type);
    fetch(`/api/activity?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setActivities(data.activities ?? []);
      })
      .catch(() => showToast("Couldn't load activity", "danger"))
      .finally(() => setLoading(false));
  }, [filters]);

  // Apply date range client-side (the API doesn't accept a since= param yet).
  const filtered = React.useMemo(() => {
    const cutoff = now.getTime() - range * 86400000;
    return activities.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
  }, [activities, range, now]);

  // Group by day, pre-seed empty days within range
  const grouped = React.useMemo(() => {
    const groups = new Map<string, { date: Date; items: ActivityItem[] }>();
    for (let i = 0; i < range; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      groups.set(dayKey(d), { date: d, items: [] });
    }
    for (const a of filtered) {
      const created = new Date(a.createdAt);
      const k = dayKey(created);
      if (!groups.has(k)) groups.set(k, { date: created, items: [] });
      groups.get(k)!.items.push(a);
    }
    return Array.from(groups.values()).sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  }, [filtered, range, now]);

  const totalEvents = filtered.length;
  const todayKey = dayKey(now);

  const subtitle =
    range === 30
      ? `Last 30 days · ${totalEvents} events`
      : range === 7
        ? `Last 7 days · ${totalEvents} events`
        : `Today · ${totalEvents} events`;

  const projectName = filters.project
    ? projects.find((p) => p.id === filters.project)?.title ?? null
    : null;
  const personName = filters.person
    ? people.find((p) => p.id === filters.person)?.name ?? null
    : null;
  const typeLabel = filters.type ? metaFor(filters.type).label : null;

  const allTypes = Object.keys(TYPE_META);

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-friday-bg h-full"
      onClick={() => setDropdown(null)}
    >
      <div
        className="px-7 pt-5 pb-3 border-b border-friday-border-soft shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <FridayPageHeader
          title="My activity"
          subtitle={subtitle}
          actions={
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <FilterChip
                label="Project"
                value={projectName}
                open={dropdown === "project"}
                onToggle={() => setDropdown(dropdown === "project" ? null : "project")}
              >
                <DropdownItem
                  active={!filters.project}
                  onClick={() => {
                    setFilters({ ...filters, project: null });
                    setDropdown(null);
                  }}
                >
                  All projects
                </DropdownItem>
                <div className="h-px bg-friday-border-soft my-1" />
                {projects.map((p) => (
                  <DropdownItem
                    key={p.id}
                    active={filters.project === p.id}
                    onClick={() => {
                      setFilters({ ...filters, project: p.id });
                      setDropdown(null);
                    }}
                  >
                    <span className="font-mono text-[9.5px] text-friday-fg-subtle mr-2">
                      {p.code}
                    </span>
                    {p.title}
                  </DropdownItem>
                ))}
              </FilterChip>

              <FilterChip
                label="Person"
                value={personName}
                open={dropdown === "person"}
                onToggle={() => setDropdown(dropdown === "person" ? null : "person")}
              >
                <DropdownItem
                  active={!filters.person}
                  onClick={() => {
                    setFilters({ ...filters, person: null });
                    setDropdown(null);
                  }}
                >
                  All people
                </DropdownItem>
                <div className="h-px bg-friday-border-soft my-1" />
                {people.map((p) => (
                  <DropdownItem
                    key={p.id}
                    active={filters.person === p.id}
                    onClick={() => {
                      setFilters({ ...filters, person: p.id });
                      setDropdown(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Avatar initials={p.initials} size={16} />
                      {p.name}
                    </span>
                  </DropdownItem>
                ))}
              </FilterChip>

              <FilterChip
                label="Type"
                value={typeLabel}
                open={dropdown === "type"}
                onToggle={() => setDropdown(dropdown === "type" ? null : "type")}
              >
                <DropdownItem
                  active={!filters.type}
                  onClick={() => {
                    setFilters({ ...filters, type: null });
                    setDropdown(null);
                  }}
                >
                  All types
                </DropdownItem>
                <div className="h-px bg-friday-border-soft my-1" />
                {allTypes.map((tk) => (
                  <DropdownItem
                    key={tk}
                    active={filters.type === tk}
                    onClick={() => {
                      setFilters({ ...filters, type: tk });
                      setDropdown(null);
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <TypeGlyph kind={metaFor(tk).glyph} size={12} />
                      {metaFor(tk).label}
                    </span>
                  </DropdownItem>
                ))}
              </FilterChip>

              <span className="w-px h-[18px] bg-friday-border-soft mx-1" />

              <DateRangeChip
                range={range}
                setRange={(v) => {
                  setRange(v);
                  setDropdown(null);
                }}
                open={dropdown === "range"}
                onToggle={() => setDropdown(dropdown === "range" ? null : "range")}
              />
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[720px] mx-auto px-7 pt-5 pb-15">
          {loading ? (
            <div className="text-[12px] text-friday-fg-muted py-6 text-center">
              Loading…
            </div>
          ) : (
            grouped.map((g) => (
              <DayGroup
                key={dayKey(g.date)}
                label={dayLabel(g.date, now)}
                items={g.items}
                isToday={dayKey(g.date) === todayKey}
                now={now}
                onProject={(p) => setDrawerProject(p)}
                onPerson={(p) => setPersonOverlay(p)}
              />
            ))
          )}
        </div>
      </div>

      <ProjectDrawer
        project={drawerProject}
        onClose={() => setDrawerProject(null)}
      />
      <PersonOverlay
        person={personOverlay}
        onClose={() => setPersonOverlay(null)}
      />
    </div>
  );
}
