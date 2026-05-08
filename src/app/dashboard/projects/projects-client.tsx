"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProjectsMapView } from "@/components/projects/projects-map";
import { I } from "@/components/friday/icons";
import { Avatar } from "@/components/friday/avatar";
import { AvatarStack } from "@/components/friday/avatar-stack";
import { PhasePill } from "@/components/friday/phase-pill";
import { StatusDot } from "@/components/friday/status-dot";
import { Skeleton } from "@/components/friday/skeleton";
import { EmptyState } from "@/components/friday/empty-state";
import { Button } from "@/components/friday/button";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
export interface ProjectRow {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string | null;
  country: string | null;
  year: number | null;
  commune: string | null;
  image: string | null;
  updatedAt: string;
  starred: boolean;
  lead: { initials: string; name: string } | null;
  team: { initials: string; name: string }[];
}

interface ProjectsClientProps {
  initialProjects: ProjectRow[];
  canEdit: boolean;
}

// ─── Filter groups (DB vocabulary — what's in prisma.project.phase) ──
const FILTER_GROUPS = {
  phase: [
    { key: "ETUDE/AP", label: "Étude / AP" },
    { key: "CONCORSO", label: "Concorso" },
    { key: "MAE", label: "MAE" },
    { key: "CHANTIER", label: "Chantier" },
    { key: "EXE/DG/DV/3D", label: "EXE / DG / DV" },
    { key: "TERMINATO", label: "Terminato" },
    { key: "STUCK", label: "Stuck" },
  ],
  status: [
    { key: "todo", label: "To do" },
    { key: "doing", label: "Working on it" },
    { key: "stuck", label: "Stuck" },
    { key: "completed", label: "Done" },
  ],
  country: [
    { key: "CH", label: "Switzerland" },
    { key: "IT", label: "Italy" },
    { key: "IN", label: "India" },
    { key: "UA", label: "Ukraine" },
  ],
  year: [] as { key: number; label: string }[],
} as const;

const VIEWS = [
  { key: "table", label: "Table" },
  { key: "grid", label: "Grid" },
  { key: "map", label: "Map" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// ─── Date helper ──────────────────────────────────────────────────
function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-CH", { day: "numeric", month: "short" });
}

const STAR_GOLD = "#c69a3a";

// ─── Star button ──────────────────────────────────────────────────
function StarButton({
  active,
  onClick,
  size = 14,
  alwaysVisible,
}: {
  active: boolean;
  onClick: () => void;
  size?: number;
  alwaysVisible?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Unstar" : "Star"}
      className={cn(
        "bg-transparent border-0 p-1 cursor-pointer leading-none transition-[opacity,transform,color] duration-150 hover:scale-110",
        alwaysVisible || active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      style={{ color: active ? STAR_GOLD : "var(--friday-fg-subtle)" }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={active ? STAR_GOLD : "none"}
        stroke={active ? STAR_GOLD : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 4z" />
      </svg>
    </button>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────
function FilterChip({
  label,
  active,
  onToggle,
  onRemove,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 h-[26px] rounded-full text-[11.5px] -tracking-[0.05px] transition-colors duration-150 border shrink-0",
        active
          ? "bg-friday-accent border-friday-accent text-white pl-2.5 pr-1 font-medium"
          : "bg-transparent border-friday-border-soft text-friday-fg hover:bg-friday-surface-2 hover:border-friday-border px-2.5",
      )}
    >
      <span>{label}</span>
      {active ? (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full ml-0.5 hover:bg-white/20"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <I.X size={10} />
        </span>
      ) : null}
    </button>
  );
}

// ─── Filter dropdown (add filter) ─────────────────────────────────
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { key: string | number; label: string }[];
  selected: (string | number)[];
  onToggle: (k: string | number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-[26px] pl-2.5 pr-2 rounded-full bg-transparent text-[11.5px] text-friday-fg-muted -tracking-[0.05px] cursor-pointer hover:text-friday-fg hover:border-friday-fg-muted transition-colors duration-150 border border-dashed border-friday-border shrink-0"
      >
        <I.Plus size={10} />
        <span>{label}</span>
      </button>
      {open ? (
        <div
          className="absolute top-8 left-0 z-30 bg-friday-surface border border-friday-border rounded p-1.5 min-w-[200px]"
          style={{ boxShadow: "0 8px 24px rgba(20,18,12,0.10)" }}
        >
          {options.map((o) => {
            const isSel = selected.includes(o.key);
            return (
              <button
                key={String(o.key)}
                type="button"
                onClick={() => onToggle(o.key)}
                className={cn(
                  "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-sm bg-transparent border-0 cursor-pointer text-[12px] text-friday-fg text-left transition-colors duration-150 hover:bg-friday-surface-2",
                  isSel ? "bg-friday-surface-2" : "",
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-sm border-[1.5px] inline-flex items-center justify-center shrink-0",
                    isSel
                      ? "bg-friday-accent border-friday-accent"
                      : "bg-transparent border-friday-border",
                  )}
                >
                  {isSel ? (
                    <I.Check size={9} color="#ffffff" strokeWidth={2.5} />
                  ) : null}
                </span>
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Search input ─────────────────────────────────────────────────
function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 h-8 pl-3 pr-2 min-w-[240px] rounded border border-friday-border-soft hover:border-friday-border focus-within:border-friday-accent transition-colors duration-150 bg-transparent focus-within:bg-friday-surface">
      <I.Search size={12} className="text-friday-fg-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter projects…"
        className="flex-1 border-0 outline-none bg-transparent text-[12.5px] text-friday-fg h-full w-[180px]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="bg-transparent border-0 p-0.5 cursor-pointer text-friday-fg-muted leading-none"
        >
          <I.X size={11} />
        </button>
      ) : null}
    </div>
  );
}

// ─── View toggle ──────────────────────────────────────────────────
function ViewIcon({
  kind,
  size = 13,
  className,
}: {
  kind: "table" | "grid" | "map";
  size?: number;
  className?: string;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  if (kind === "table")
    return (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 10h18M3 16h18M9 4v16" />
      </svg>
    );
  if (kind === "grid")
    return (
      <svg {...props}>
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
    );
  return (
    <svg {...props}>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16M15 6v16" />
    </svg>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = React.useState({ x: 0, w: 0, ready: false });

  React.useEffect(() => {
    const el = refs.current[value];
    if (!el) return;
    setBar({ x: el.offsetLeft, w: el.offsetWidth, ready: true });
  }, [value]);

  return (
    <div className="relative flex items-center">
      {VIEWS.map((v) => {
        const active = value === v.key;
        return (
          <button
            key={v.key}
            ref={(el) => {
              refs.current[v.key] = el;
            }}
            type="button"
            onClick={() => onChange(v.key)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 bg-transparent border-0 cursor-pointer text-[12.5px] -tracking-[0.05px] transition-colors duration-150",
              active
                ? "text-friday-fg font-medium"
                : "text-friday-fg-muted hover:text-friday-fg",
            )}
          >
            <ViewIcon kind={v.key} />
            <span>{v.label}</span>
          </button>
        );
      })}
      <div
        className="absolute -bottom-px h-0.5 bg-friday-accent transition-[left,width] duration-200 ease-out"
        style={{ left: bar.x, width: bar.w }}
      />
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────
type Filters = {
  phase: string[];
  status: string[];
  country: string[];
  year: number[];
};

function ProjectsToolbar({
  search,
  setSearch,
  view,
  setView,
  filters,
  setFilters,
  count,
  starredCount,
  yearOptions,
  canCreate,
}: {
  search: string;
  setSearch: (v: string) => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  count: number;
  starredCount: number;
  yearOptions: { key: number; label: string }[];
  canCreate: boolean;
}) {
  const allFilters: { group: keyof Filters; key: string | number; label: string }[] = [];
  (Object.entries(filters) as [keyof Filters, (string | number)[]][]).forEach(
    ([group, vals]) => {
      const opts =
        group === "year"
          ? yearOptions
          : (FILTER_GROUPS[group] as readonly { key: string | number; label: string }[]);
      vals.forEach((v) => {
        const opt = opts.find((o) => o.key === v);
        if (opt) allFilters.push({ group, key: v, label: opt.label });
      });
    },
  );

  const toggleFilter = (group: keyof Filters, key: string | number) => {
    setFilters((f) => {
      const next = { ...f };
      const cur = (next[group] as (string | number)[]) || [];
      next[group] = (
        cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]
      ) as never;
      return next;
    });
  };

  return (
    <div className="bg-friday-bg border-b border-friday-border-soft shrink-0">
      <div className="flex items-center gap-3 px-7 pt-3.5 pb-2.5">
        <div className="flex items-baseline gap-3 flex-1 min-w-0">
          <h1 className="font-display italic font-medium text-[26px] text-friday-fg m-0 -tracking-[0.5px] leading-none">
            Projects
          </h1>
          <span className="text-[12px] text-friday-fg-muted whitespace-nowrap">
            {count} {count === 1 ? "project" : "projects"}
            <span className="text-friday-fg-subtle"> · </span>
            <span style={{ color: STAR_GOLD }}>★</span> {starredCount} starred
          </span>
        </div>

        <SearchInput value={search} onChange={setSearch} />

        <ViewToggle value={view} onChange={setView} />

        {canCreate ? (
          <Button
            kind="primary"
            size="sm"
            leading={<I.Plus size={11} color="#ffffff" />}
            onClick={() => showToast("New project draft")}
          >
            Add project
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 px-7 pb-3 flex-wrap">
        {allFilters.map((f) => (
          <FilterChip
            key={`${f.group}:${f.key}`}
            label={f.label}
            active
            onToggle={() => toggleFilter(f.group, f.key)}
            onRemove={() => toggleFilter(f.group, f.key)}
          />
        ))}

        <FilterDropdown
          label="Phase"
          options={FILTER_GROUPS.phase as unknown as { key: string; label: string }[]}
          selected={filters.phase}
          onToggle={(k) => toggleFilter("phase", k)}
        />
        <FilterDropdown
          label="Status"
          options={FILTER_GROUPS.status as unknown as { key: string; label: string }[]}
          selected={filters.status}
          onToggle={(k) => toggleFilter("status", k)}
        />
        <FilterDropdown
          label="Country"
          options={FILTER_GROUPS.country as unknown as { key: string; label: string }[]}
          selected={filters.country}
          onToggle={(k) => toggleFilter("country", k)}
        />
        <FilterDropdown
          label="Year"
          options={yearOptions}
          selected={filters.year}
          onToggle={(k) => toggleFilter("year", k as number)}
        />

        {allFilters.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              setFilters({ phase: [], status: [], country: [], year: [] })
            }
            className="bg-transparent border-0 px-1.5 h-[26px] text-[11.5px] text-friday-fg-muted hover:text-friday-fg cursor-pointer transition-colors duration-150 -tracking-[0.05px]"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Placeholder hero ─────────────────────────────────────────────
function PlaceholderHero({ code, label }: { code: string; label: string }) {
  const hash = code.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
  const angle = (hash % 90) - 45;
  const stop = 24 + (hash % 30);
  return (
    <div
      className="w-full h-full relative bg-friday-surface-3 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(${angle}deg, var(--friday-surface-3) 0%, var(--friday-surface-2) ${stop}%, var(--friday-surface) 100%)`,
        }}
      />
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <line
          x1="0"
          y1={70 + (hash % 30)}
          x2="200"
          y2={70 + (hash % 30)}
          stroke="var(--friday-border)"
          strokeWidth="0.5"
        />
        <line
          x1={40 + (hash % 60)}
          y1="0"
          x2={40 + (hash % 60)}
          y2="150"
          stroke="var(--friday-border)"
          strokeWidth="0.5"
        />
        <circle
          cx={50 + (hash % 100)}
          cy={60 + (hash % 30)}
          r="22"
          stroke="var(--friday-border)"
          strokeWidth="0.5"
          fill="none"
        />
      </svg>
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display italic font-medium text-friday-fg-subtle whitespace-nowrap text-center max-w-[80%] overflow-hidden text-ellipsis -tracking-[0.3px]"
        style={{ fontSize: 24 }}
      >
        {label}
      </span>
    </div>
  );
}

function HeroImg({
  p,
  grayscale = true,
}: {
  p: ProjectRow;
  grayscale?: boolean;
}) {
  if (p.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={p.image}
        alt={p.title}
        className="w-full h-full object-cover"
        style={{ filter: grayscale ? "grayscale(1) contrast(1.02)" : "none" }}
      />
    );
  }
  return <PlaceholderHero code={p.code} label={p.title} />;
}

// ─── Table view ───────────────────────────────────────────────────
const TABLE_COLS = "36px 110px minmax(220px, 1fr) 180px 110px 70px 110px 110px 90px";

function ProjectsTable({
  rows,
  onOpen,
  onStar,
}: {
  rows: ProjectRow[];
  onOpen: (p: ProjectRow) => void;
  onStar: (p: ProjectRow) => void;
}) {
  return (
    <div className="flex-1 overflow-auto bg-friday-bg">
      <div className="min-w-[1100px]">
        <div
          className="grid sticky top-0 z-[5] items-center h-8 px-7 border-b border-friday-border bg-friday-bg text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-semibold"
          style={{ gridTemplateColumns: TABLE_COLS }}
        >
          <span />
          <span>Code</span>
          <span>Title</span>
          <span>Phase</span>
          <span>Status</span>
          <span>Lead</span>
          <span>Region</span>
          <span>Team</span>
          <span className="text-right">Updated</span>
        </div>

        {rows.map((p) => (
          <div
            key={p.code}
            onClick={() => onOpen(p)}
            className="group grid items-center h-11 px-7 border-b border-friday-border-soft hover:bg-friday-surface-2 cursor-pointer transition-colors duration-150"
            style={{ gridTemplateColumns: TABLE_COLS }}
          >
            <StarButton
              active={p.starred}
              onClick={() => onStar(p)}
              alwaysVisible={p.starred}
              size={14}
            />
            <span className="font-mono text-[10.5px] text-friday-fg-muted tracking-wide">
              {p.code}
            </span>
            <span className="text-[13px] text-friday-fg font-medium -tracking-[0.05px] truncate">
              {p.title}
            </span>
            <PhasePill phase={p.phase} compact />
            <StatusDot status={p.workStatus} withLabel />
            {p.lead ? (
              <Avatar initials={p.lead.initials} size={20} />
            ) : (
              <span className="text-[11.5px] text-friday-fg-subtle">—</span>
            )}
            <span className="text-[11.5px] text-friday-fg-muted truncate">
              {p.commune ?? "—"}
            </span>
            {p.team.length > 0 ? (
              <AvatarStack
                members={p.team.slice(0, 3).map((t) => t.initials)}
                extra={Math.max(0, p.team.length - 3)}
                size={20}
              />
            ) : (
              <span className="text-[11.5px] text-friday-fg-subtle">—</span>
            )}
            <span className="text-[11px] text-friday-fg-subtle text-right whitespace-nowrap">
              {relTime(p.updatedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Grid view ────────────────────────────────────────────────────
function ProjectCard({
  p,
  onOpen,
  onStar,
}: {
  p: ProjectRow;
  onOpen: (p: ProjectRow) => void;
  onStar: (p: ProjectRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      className="flex flex-col bg-friday-surface border border-friday-border-soft hover:border-friday-border rounded overflow-hidden cursor-pointer text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(20,18,12,0.06)]"
    >
      <div
        className="relative w-full overflow-hidden bg-friday-surface-3"
        style={{ aspectRatio: "4 / 3" }}
      >
        <HeroImg p={p} />
        <div className="absolute top-2 left-2">
          <PhasePill phase={p.phase} compact />
        </div>
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          style={{ background: "rgba(26,26,24,0.78)" }}
        >
          <StatusDot status={p.workStatus} />
          <span
            className="text-[10px] tracking-wide"
            style={{ color: "#fafaf8" }}
          >
            {(p.workStatus ?? "—").toString()}
          </span>
        </div>
        {p.team.length > 0 ? (
          <div className="absolute bottom-2 left-2">
            <AvatarStack
              members={p.team.slice(0, 3).map((t) => t.initials)}
              extra={Math.max(0, p.team.length - 3)}
              size={22}
            />
          </div>
        ) : null}
        <div className="absolute bottom-1 right-1">
          <StarButton
            active={p.starred}
            onClick={() => onStar(p)}
            alwaysVisible={p.starred}
            size={16}
          />
        </div>
      </div>
      <div className="p-3 flex flex-col gap-1">
        <span className="font-mono text-[10px] text-friday-fg-subtle tracking-wide">
          {p.code}
        </span>
        <span className="font-display italic font-medium text-[16px] text-friday-fg -tracking-[0.2px] leading-tight truncate">
          {p.title}
        </span>
        <span className="text-[11px] text-friday-fg-muted">
          {p.commune ?? "—"}
          {p.year ? (
            <>
              <span className="text-friday-fg-subtle"> · </span>
              {p.year}
            </>
          ) : null}
        </span>
      </div>
    </button>
  );
}

function ProjectsGrid({
  rows,
  onOpen,
  onStar,
}: {
  rows: ProjectRow[];
  onOpen: (p: ProjectRow) => void;
  onStar: (p: ProjectRow) => void;
}) {
  return (
    <div className="flex-1 overflow-auto bg-friday-bg px-7 py-5">
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {rows.map((p) => (
          <ProjectCard key={p.code} p={p} onOpen={onOpen} onStar={onStar} />
        ))}
      </div>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="flex-1 overflow-hidden bg-friday-bg">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid items-center h-11 px-7 border-b border-friday-border-soft"
          style={{ gridTemplateColumns: TABLE_COLS }}
        >
          <Skeleton w={14} h={14} rounded={2} />
          <Skeleton w={84} h={9} />
          <Skeleton w="70%" h={11} />
          <Skeleton w={110} h={9} rounded={999} />
          <Skeleton w={70} h={9} />
          <Skeleton w={20} h={20} rounded={20} />
          <Skeleton w={70} h={9} />
          <Skeleton w={70} h={20} rounded={20} />
          <Skeleton w={50} h={9} />
        </div>
      ))}
    </div>
  );
}

// ─── Project drawer ───────────────────────────────────────────────
function ProjectDrawer({
  project,
  onClose,
}: {
  project: ProjectRow | null;
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
      style={{ background: enter ? "rgba(26,26,24,0.32)" : "rgba(26,26,24,0)" }}
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
        <div className="w-full h-[200px] relative bg-friday-surface-3 shrink-0">
          <HeroImg p={project} grayscale={false} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-7 h-7 rounded-full border-0 cursor-pointer flex items-center justify-center"
            style={{ background: "rgba(26,26,24,0.72)", color: "#fafaf8" }}
          >
            <I.X size={13} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-2.5">
          <span className="font-mono text-[10.5px] text-friday-fg-muted tracking-wide">
            {project.code}
          </span>
          <span className="font-display italic font-medium text-[22px] text-friday-fg -tracking-[0.3px]">
            {project.title}
          </span>
          <div className="flex items-center gap-2">
            <PhasePill phase={project.phase} />
            <StatusDot status={project.workStatus} withLabel />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-friday-fg-muted">
            <span>
              {project.commune ?? "—"}
              {project.country ? `, ${project.country}` : ""}
            </span>
            {project.year ? (
              <>
                <span className="text-friday-fg-subtle">·</span>
                <span>{project.year}</span>
              </>
            ) : null}
          </div>
          <div className="mt-2 pt-3 border-t border-friday-border-soft flex items-center gap-3">
            {project.team.length > 0 ? (
              <AvatarStack
                members={project.team.slice(0, 4).map((t) => t.initials)}
                extra={Math.max(0, project.team.length - 4)}
                size={22}
              />
            ) : null}
            <span className="flex-1" />
            <Button
              kind="primary"
              size="sm"
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
            >
              Open project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────
export function ProjectsClient({
  initialProjects,
  canEdit,
}: ProjectsClientProps) {
  const [projects, setProjects] = React.useState<ProjectRow[]>(initialProjects);
  const [view, setView] = React.useState<ViewKey>("table");
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>({
    phase: [],
    status: [],
    country: [],
    year: [],
  });
  const [drawer, setDrawer] = React.useState<ProjectRow | null>(null);

  const yearOptions = React.useMemo(() => {
    const years = new Set<number>();
    projects.forEach((p) => {
      if (p.year) years.add(p.year);
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ key: y, label: String(y) }));
  }, [projects]);

  const rows = React.useMemo(() => {
    let r = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.commune?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filters.phase.length) r = r.filter((p) => filters.phase.includes(p.phase));
    if (filters.status.length)
      r = r.filter((p) => filters.status.includes(p.workStatus ?? ""));
    if (filters.country.length)
      r = r.filter((p) => filters.country.includes(p.country ?? ""));
    if (filters.year.length)
      r = r.filter((p) => p.year != null && filters.year.includes(p.year));
    return r;
  }, [projects, search, filters]);

  const starredCount = projects.filter((p) => p.starred).length;

  const onStar = async (p: ProjectRow) => {
    const wasStarred = p.starred;
    setProjects((arr) =>
      arr.map((x) => (x.id === p.id ? { ...x, starred: !wasStarred } : x)),
    );
    showToast(wasStarred ? "Removed from starred" : "Starred");
    try {
      if (wasStarred) {
        await fetch(
          `/api/favorites?entityType=project&entityId=${encodeURIComponent(p.id)}`,
          { method: "DELETE" },
        );
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "project", entityId: p.id }),
        });
      }
    } catch {
      // Revert on failure
      setProjects((arr) =>
        arr.map((x) => (x.id === p.id ? { ...x, starred: wasStarred } : x)),
      );
    }
  };

  const onOpen = (p: ProjectRow) => setDrawer(p);

  const clearAll = () => {
    setSearch("");
    setFilters({ phase: [], status: [], country: [], year: [] });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <ProjectsToolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        filters={filters}
        setFilters={setFilters}
        count={rows.length}
        starredCount={starredCount}
        yearOptions={yearOptions}
        canCreate
      />

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="max-w-[380px]">
            <EmptyState
              glyph="·"
              title="No projects yet."
              body="When DBS spins up its first project, it'll land here. Until then — quiet."
            />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="max-w-[380px]">
            <EmptyState
              glyph="·"
              title="No projects match these filters."
              body="Loosen a constraint or clear them all."
              cta="Clear filters"
              onCta={clearAll}
            />
          </div>
        </div>
      ) : view === "table" ? (
        <ProjectsTable rows={rows} onOpen={onOpen} onStar={onStar} />
      ) : view === "grid" ? (
        <ProjectsGrid rows={rows} onOpen={onOpen} onStar={onStar} />
      ) : (
        <div className="flex-1 min-h-0">
          <ProjectsMapView
            projects={rows.map((p) => ({
              id: p.id,
              code: p.code,
              title: p.title,
              phase: p.phase,
              workStatus: p.workStatus ?? "",
              commune: p.commune,
              image: p.image,
              assignments: p.team.map((t) => ({
                userId: t.initials,
                user: { name: t.name, initials: t.initials },
              })),
            }))}
            canEdit={canEdit}
            onUpdateLocation={async () => {
              /* not wired in the new design surface; legacy edit
                 lived in the old shadcn projects-client. Will return
                 when project-detail Round lands. */
            }}
          />
        </div>
      )}

      <ProjectDrawer project={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
