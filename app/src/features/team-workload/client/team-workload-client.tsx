"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, PHASE_COLORS } from "@/ui/utils";
import type {
  TeamMemberWorkload,
  TeamWorkloadData,
  WorkloadLoadLevel,
} from "../domain/types";

// Friday-tone palette for load buckets. Keeps the architect's-blue
// accent for the balanced default and shifts toward warning ochre /
// alarm crimson as workload climbs.
const LOAD_META: Record<
  WorkloadLoadLevel,
  { label: string; bg: string; fg: string; dot: string }
> = {
  light:      { label: "Light",      bg: "var(--friday-surface-2)", fg: "var(--friday-fg-muted)", dot: "#a8a59d" },
  balanced:   { label: "Balanced",   bg: "#e8efe6",                  fg: "#3f6534",                  dot: "#22a06b" },
  heavy:      { label: "Heavy",      bg: "#f5ecd9",                  fg: "#7a5a14",                  dot: "#c4994a" },
  overloaded: { label: "Overloaded", bg: "rgba(226, 68, 92, 0.10)",  fg: "#a82038",                  dot: "#e2445c" },
};

const HEALTH_DOT: Record<string, string> = {
  on_track: "#22a06b",
  at_risk: "#c4994a",
  off_track: "#e2445c",
};

function InitialsAvatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-friday-surface-2 text-friday-fg font-mono shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials}
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Admin",
  admin: "Admin",
  director: "Director",
  manager: "Manager",
  project_manager: "Manager",
  employee: "Member",
  collaborator: "Member",
  intern: "Intern",
  viewer: "Viewer",
};

type SortKey = "score" | "name" | "projects" | "overdue";

export function TeamWorkloadClient({ data }: { data: TeamWorkloadData }) {
  const [query, setQuery] = useState("");
  const [loadFilter, setLoadFilter] = useState<"" | WorkloadLoadLevel>("");
  const [sort, setSort] = useState<SortKey>("score");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = data.members.filter((m) => {
      if (loadFilter && m.load !== loadFilter) return false;
      if (!q) return true;
      return (
        (m.user.name ?? "").toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        m.projects.some((p) => p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
      );
    });
    if (sort === "name") {
      rows = [...rows].sort((a, b) =>
        (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email),
      );
    } else if (sort === "projects") {
      rows = [...rows].sort((a, b) => b.projects.length - a.projects.length);
    } else if (sort === "overdue") {
      rows = [...rows].sort(
        (a, b) =>
          b.tasks.overdue + b.agenda.overdue - (a.tasks.overdue + a.agenda.overdue),
      );
    }
    return rows;
  }, [data.members, query, loadFilter, sort]);

  const counts = useMemo(() => {
    const c: Record<WorkloadLoadLevel, number> = {
      light: 0,
      balanced: 0,
      heavy: 0,
      overloaded: 0,
    };
    for (const m of data.members) c[m.load] += 1;
    return c;
  }, [data.members]);

  return (
    <div className="min-h-full bg-friday-bg">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-friday-fg-muted">
              Studio operations
            </p>
            <h1 className="font-display italic text-[34px] text-friday-fg tracking-tight m-0 leading-tight">
              Team workload
            </h1>
            <p className="text-[12.5px] text-friday-fg-muted mt-1 m-0 leading-relaxed max-w-2xl">
              Who is carrying what right now. Score weighs active project
              assignments, open tasks, overdue items, and the week's calendar.
              Generated&nbsp;{new Date(data.generatedAt).toLocaleString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "short",
              })}.
            </p>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          {(Object.keys(LOAD_META) as WorkloadLoadLevel[]).map((lvl) => {
            const meta = LOAD_META[lvl];
            const active = loadFilter === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setLoadFilter(active ? "" : lvl)}
                className={cn(
                  "border rounded px-4 py-3 text-left transition-colors",
                  active
                    ? "border-friday-fg"
                    : "border-friday-border-soft hover:border-friday-fg/40",
                )}
                style={active ? { background: meta.bg } : undefined}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-friday-fg-muted">
                    {meta.label}
                  </span>
                  <span
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: meta.dot }}
                  />
                </div>
                <div className="font-display italic text-[26px] tracking-tight text-friday-fg leading-none">
                  {counts[lvl]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or project…"
            className="flex-1 min-w-[220px] h-9 px-3 bg-friday-bg text-friday-fg border border-friday-border-soft rounded text-[12.5px] focus:outline-none focus:border-friday-accent"
          />
          <div className="flex items-center gap-2 text-[11.5px] text-friday-fg-muted">
            <span>Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 pl-2 pr-7 bg-friday-bg text-friday-fg border border-friday-border-soft rounded text-[12px] cursor-pointer appearance-none"
            >
              <option value="score">Most loaded</option>
              <option value="overdue">Most overdue</option>
              <option value="projects">Most projects</option>
              <option value="name">A → Z</option>
            </select>
          </div>
          {loadFilter && (
            <button
              type="button"
              onClick={() => setLoadFilter("")}
              className="h-9 px-3 text-[11.5px] text-friday-fg-muted hover:text-friday-fg border border-friday-border-soft rounded"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Empty / no-match */}
        {filtered.length === 0 ? (
          <div className="border border-dashed border-friday-border rounded px-6 py-10 text-center">
            <p className="font-display italic text-friday-fg-muted m-0">
              {data.members.length === 0
                ? "No active team members yet."
                : "No one matches the current filters."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((m) => (
              <MemberCard key={m.user.id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberCard({ m }: { m: TeamMemberWorkload }) {
  const initials = m.user.initials ?? m.user.name?.slice(0, 2)?.toUpperCase() ?? "·";
  const displayName = m.user.name ?? m.user.email;
  const meta = LOAD_META[m.load];

  return (
    <div className="border border-friday-border-soft rounded bg-friday-surface overflow-hidden">
      <div
        className="grid items-center gap-3 px-4 py-3"
        style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.6fr) 130px" }}
      >
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <InitialsAvatar initials={initials} />
          <div className="min-w-0">
            <p className="text-[13px] text-friday-fg m-0 truncate font-medium">
              {displayName}
            </p>
            <p className="font-mono text-[10.5px] text-friday-fg-subtle m-0 truncate">
              {m.user.email} · {ROLE_LABEL[m.user.role] ?? m.user.role}
            </p>
          </div>
        </div>

        {/* Tasks */}
        <Stat
          label="Tasks"
          primary={`${m.tasks.open}`}
          secondary={
            m.tasks.overdue > 0
              ? `${m.tasks.overdue} overdue`
              : m.tasks.dueThisWeek > 0
                ? `${m.tasks.dueThisWeek} this week`
                : "no rush"
          }
          tone={m.tasks.overdue > 0 ? "warn" : "default"}
        />

        {/* Agenda */}
        <Stat
          label="Agenda"
          primary={`${m.agenda.next7days + m.agenda.overdue}`}
          secondary={
            m.agenda.overdue > 0
              ? `${m.agenda.overdue} overdue`
              : `${m.agenda.next7days} next 7 days`
          }
          tone={m.agenda.overdue > 0 ? "warn" : "default"}
        />

        {/* Projects (chips) */}
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle font-semibold m-0 mb-1">
            Active projects · {m.projects.length}
          </p>
          {m.projects.length === 0 ? (
            <p className="text-[11.5px] text-friday-fg-subtle italic m-0">
              None active
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {m.projects.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/projects/${p.id}`}
                  className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-friday-border-soft text-[10.5px] text-friday-fg font-mono hover:border-friday-fg/40 transition-colors"
                  title={`${p.title} · ${p.phase}`}
                >
                  <span
                    className="w-[5px] h-[5px] rounded-full"
                    style={{ background: PHASE_COLORS[p.phase] ?? "#a8a59d" }}
                  />
                  {p.code}
                </Link>
              ))}
              {m.projects.length > 6 && (
                <span className="text-[10.5px] text-friday-fg-subtle px-1 py-0.5">
                  +{m.projects.length - 6}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Load + latest status */}
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-px rounded-full text-[10.5px] font-medium tracking-wide"
            style={{ background: meta.bg, color: meta.fg }}
          >
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{ background: meta.dot }}
            />
            {meta.label}
          </span>
          {m.latestStatus ? (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] text-friday-fg-subtle font-mono">
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{ background: HEALTH_DOT[m.latestStatus.health] ?? "#a8a59d" }}
              />
              {m.latestStatus.projectCode}
              <span className="text-friday-fg-subtle/70">
                · {relative(m.latestStatus.createdAt)}
              </span>
            </span>
          ) : (
            <span className="text-[10.5px] text-friday-fg-subtle italic">
              no recent status
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle font-semibold m-0 mb-0.5">
        {label}
      </p>
      <p className="text-[18px] font-display italic text-friday-fg m-0 leading-none">
        {primary}
      </p>
      <p
        className={cn(
          "text-[10.5px] m-0 mt-1 truncate",
          tone === "warn" ? "text-[#a82038]" : "text-friday-fg-subtle",
        )}
      >
        {secondary}
      </p>
    </div>
  );
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  return `${months} mo ago`;
}
