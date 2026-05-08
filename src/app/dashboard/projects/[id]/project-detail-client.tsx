"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/friday/avatar";
import { I } from "@/components/friday/icons";
import { Button } from "@/components/friday/button";
import { EmptyState } from "@/components/friday/empty-state";
import { showToast } from "@/components/toast";
import { getPhaseColor, getStatusColor } from "@/lib/friday-tokens";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
export interface ProjectDetailData {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string | null;
  year: number | null;
  commune: string | null;
  country: string | null;
  description: string | null;
  client: string | null;
  category: string | null;
  typology: string | null;
  floors: number | null;
  area: number | null;
  billing: string | null;
  image: string | null;
  starred: boolean;
}

export interface ProjectDetailMember {
  initials: string;
  name: string;
  role: string;
}

export interface ProjectDetailAgendaItem {
  id: string;
  date: string;
  title: string;
  priority: "high" | "medium" | "low";
  status: string;
}

export interface ProjectDetailActivity {
  id: string;
  who: string;
  initials: string;
  description: string;
  ago: string;
}

interface ProjectDetailClientProps {
  project: ProjectDetailData;
  team: ProjectDetailMember[];
  agenda: ProjectDetailAgendaItem[];
  activity: ProjectDetailActivity[];
  editable: boolean;
}

// ─── Hero ─────────────────────────────────────────────────────────
function HeroBtn({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors duration-150 hover:bg-white/20"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      {children}
    </button>
  );
}

function PillOnDark({
  dotColor,
  children,
}: {
  dotColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[11px] text-white whitespace-nowrap"
      style={{
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.18)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: dotColor }}
      />
      {children}
    </div>
  );
}

function ProjectHero({
  project,
  starred,
  onStarToggle,
}: {
  project: ProjectDetailData;
  starred: boolean;
  onStarToggle: () => void;
}) {
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

  const phaseColor = getPhaseColor(project.phase);
  const statusColor = getStatusColor(project.workStatus);

  return (
    <div className="relative w-full overflow-hidden bg-friday-fg" style={{ height: 240 }}>
      {project.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.image}
          alt={project.title}
          className="absolute inset-0 w-full h-full object-cover block"
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div className="absolute top-3.5 right-3.5 flex gap-1">
        <HeroBtn onClick={onStarToggle} ariaLabel="Star">
          <I.Star
            size={14}
            color={starred ? "#e9b850" : "#ffffff"}
            strokeWidth={1.6}
          />
        </HeroBtn>
        <HeroBtn
          onClick={() => {
            navigator.clipboard
              ?.writeText(window.location.href)
              .catch(() => undefined);
            showToast("Share link copied");
          }}
          ariaLabel="Copy share link"
        >
          <I.Plug size={14} color="#ffffff" />
        </HeroBtn>
        <div className="relative" ref={menuRef}>
          <HeroBtn onClick={() => setMenuOpen((v) => !v)} ariaLabel="More">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </HeroBtn>
          {menuOpen ? (
            <div
              className="absolute top-[30px] right-0 min-w-[200px] bg-friday-surface border border-friday-border rounded p-1 z-[5]"
              style={{
                boxShadow:
                  "0 8px 28px rgba(20,18,12,0.14), 0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {[
                { l: "Rename project", k: "⌘R" },
                { l: "Move to phase…", k: "⌘P" },
                { l: "Copy share link", k: "⌘L" },
                { l: "Export project pack", k: null },
                { l: "Archive", k: null, danger: true },
              ].map((it) => (
                <button
                  key={it.l}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    showToast(it.l);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2 py-1.5 bg-transparent border-0 cursor-pointer text-left rounded-sm text-[12px] hover:bg-friday-surface-2",
                    it.danger ? "text-[#b91c1c]" : "text-friday-fg",
                  )}
                >
                  <span className="flex-1">{it.l}</span>
                  {it.k ? (
                    <span className="font-mono text-[9.5px] text-friday-fg-subtle">
                      {it.k}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="absolute left-7 right-7 flex flex-col gap-1.5"
        style={{ bottom: 18 }}
      >
        <div
          className="font-mono text-[10.5px] tracking-wide"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          {project.code}
        </div>
        <h1 className="font-display italic font-medium text-[32px] leading-tight text-white m-0 -tracking-[0.3px]">
          {project.title}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <PillOnDark dotColor={phaseColor}>{project.phase}</PillOnDark>
          {project.workStatus ? (
            <PillOnDark dotColor={statusColor}>{project.workStatus}</PillOnDark>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────
function SectionHeading({
  idx,
  title,
  action,
}: {
  idx: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-3.5">
      <span className="font-mono text-[9.5px] tracking-wide text-friday-fg-subtle font-medium">
        {idx}
      </span>
      <h2 className="font-display italic text-[22px] font-medium text-friday-fg m-0 -tracking-[0.2px] leading-none flex-1">
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── 01 At a glance ───────────────────────────────────────────────
function AtAGlance({ project }: { project: ProjectDetailData }) {
  const items: { label: string; value: string; dot?: string }[] = [
    {
      label: "Phase",
      value: project.phase,
      dot: getPhaseColor(project.phase),
    },
    {
      label: "Status",
      value: project.workStatus ?? "—",
      dot: project.workStatus ? getStatusColor(project.workStatus) : undefined,
    },
    { label: "Year", value: project.year ? String(project.year) : "—" },
    {
      label: "Commune",
      value:
        [project.commune, project.country].filter(Boolean).join(", ") || "—",
    },
  ];
  return (
    <div className="grid grid-cols-4 border border-friday-border-soft bg-friday-surface rounded">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "px-4 py-3.5 flex flex-col gap-1",
            i < items.length - 1 ? "border-r border-friday-border-soft" : "",
          )}
        >
          <span className="text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-subtle font-medium">
            {it.label}
          </span>
          <div className="flex items-center gap-1.5">
            {it.dot ? (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: it.dot }}
              />
            ) : null}
            <span className="text-[14px] text-friday-fg font-medium">
              {it.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 03 Team ──────────────────────────────────────────────────────
function TeamSection({ team }: { team: ProjectDetailMember[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {team.map((p) => (
        <div
          key={p.initials + p.name}
          className="flex items-center gap-2.5 px-3 py-1.5 pl-1.5 border border-friday-border-soft bg-friday-surface rounded-full"
        >
          <Avatar initials={p.initials} size={24} />
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] text-friday-fg font-medium">
              {p.name}
            </span>
            <span className="text-[10.5px] text-friday-fg-muted">{p.role}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 06 Agenda ────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#a8a59d",
};

function AgendaSection({ items }: { items: ProjectDetailAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <div className="border border-friday-border-soft bg-friday-surface rounded">
        <EmptyState
          glyph="·"
          title="No deadlines yet."
          body="Add a milestone in the Agenda surface and it'll show up here."
        />
      </div>
    );
  }

  return (
    <div className="border border-friday-border-soft bg-friday-surface rounded overflow-hidden">
      {items.map((it, i) => {
        const pColor = PRIORITY_COLORS[it.priority] ?? PRIORITY_COLORS.low;
        const done = it.status === "done";
        return (
          <div
            key={it.id}
            className={cn(
              "grid items-center px-3.5 py-2.5 gap-3.5",
              i < items.length - 1 ? "border-b border-friday-border-soft" : "",
              done ? "opacity-55" : "",
            )}
            style={{ gridTemplateColumns: "12px 110px 1fr 80px" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: done ? "transparent" : pColor,
                border: done
                  ? "1.5px solid var(--friday-fg-subtle)"
                  : "none",
              }}
            />
            <span className="font-mono text-[10.5px] text-friday-fg-muted tracking-wide">
              {it.date}
            </span>
            <span
              className={cn(
                "text-[12.5px] text-friday-fg",
                done ? "line-through" : "",
              )}
            >
              {it.title}
            </span>
            <span className="font-mono text-[9.5px] text-friday-fg-subtle text-right tracking-wide uppercase">
              {done ? "done" : it.status === "pending" ? "open" : it.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 07 Activity ──────────────────────────────────────────────────
function ActivitySection({ items }: { items: ProjectDetailActivity[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        glyph="·"
        title="Quiet so far."
        body="When the team starts working on this project, you'll see the trail here."
      />
    );
  }
  return (
    <div className="flex flex-col">
      {items.map((a, i) => (
        <div
          key={a.id}
          className={cn(
            "grid items-center gap-2.5 py-1.5",
            i < items.length - 1 ? "border-b border-friday-border-soft" : "",
          )}
          style={{ gridTemplateColumns: "24px 1fr 70px" }}
        >
          <Avatar initials={a.initials} size={20} />
          <span className="text-[12px] text-friday-fg leading-snug">
            <span className="font-medium">{a.who}</span>{" "}
            <span className="text-friday-fg-muted">{a.description}</span>
          </span>
          <span className="font-mono text-[9.5px] text-friday-fg-subtle text-right tracking-wide">
            {a.ago}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Map preview ──────────────────────────────────────────────────
function MapPreview() {
  return (
    <div
      className="rounded-[3px] overflow-hidden border border-friday-border-soft cursor-pointer relative"
      style={{ height: 100, background: "#f0eee8" }}
    >
      <svg
        viewBox="0 0 200 100"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="map-hatch"
            patternUnits="userSpaceOnUse"
            width="4"
            height="4"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="#dcd9d1" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="200" height="100" fill="#f0eee8" />
        <path
          d="M-5,55 Q40,48 80,58 T160,52 T210,60 L210,68 Q160,62 110,66 T20,64 L-5,66 Z"
          fill="#cfd8d4"
        />
        <path d="M0,40 L200,38" stroke="#a8a59d" strokeWidth="0.6" fill="none" />
        <path d="M0,75 L200,72" stroke="#a8a59d" strokeWidth="0.6" fill="none" />
        <path d="M70,0 L72,100" stroke="#a8a59d" strokeWidth="0.6" fill="none" />
        <path d="M130,0 L128,100" stroke="#a8a59d" strokeWidth="0.6" fill="none" />
        <rect x="20" y="20" width="40" height="14" fill="url(#map-hatch)" />
        <rect x="80" y="22" width="42" height="12" fill="url(#map-hatch)" />
        <rect x="140" y="20" width="46" height="14" fill="url(#map-hatch)" />
        <rect x="20" y="80" width="40" height="14" fill="url(#map-hatch)" />
        <rect x="80" y="80" width="42" height="14" fill="url(#map-hatch)" />
        <rect x="140" y="80" width="46" height="14" fill="url(#map-hatch)" />
        <g transform="translate(100, 50)">
          <circle r="9" fill="#1e3a8a" fillOpacity="0.18" />
          <circle r="4" fill="#1e3a8a" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

// ─── Sticky right rail ────────────────────────────────────────────
function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-subtle font-medium">
        {label}
      </span>
      <span className="text-[12.5px] text-friday-fg">{value}</span>
    </div>
  );
}

function StickyRail({
  project,
  onScrollTo,
}: {
  project: ProjectDetailData;
  onScrollTo: (id: string) => void;
}) {
  const fields: [string, string | null | number][] = [
    ["Client", project.client],
    [
      "Address",
      [project.commune, project.country].filter(Boolean).join(", "),
    ],
    ["Year", project.year],
    ["Category", project.category],
    ["Typology", project.typology],
    ["Floors", project.floors],
    ["Area", project.area ? `${project.area} m²` : null],
    ["Billing", project.billing],
  ];

  return (
    <div
      className="w-[320px] shrink-0 border-l border-friday-border-soft bg-friday-bg p-5 flex flex-col gap-[18px] sticky top-0 self-start overflow-y-auto"
      style={{ maxHeight: "100vh" }}
    >
      <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-subtle font-medium">
        Project
      </div>

      <MapPreview />

      <div className="grid grid-cols-2 gap-3.5">
        {fields.map(([label, value], i) => (
          <div
            key={label}
            className={i < 2 ? "col-span-2" : ""}
          >
            <MetaField label={label} value={value ? String(value) : "—"} />
          </div>
        ))}
      </div>

      <div className="h-px bg-friday-border-soft my-1" />

      <div className="flex flex-col gap-1.5">
        <div className="text-[9.5px] tracking-[0.16em] uppercase text-friday-fg-subtle font-medium mb-1">
          Quick actions
        </div>
        <Button
          kind="secondary"
          size="sm"
          fullWidth
          leading={<I.Chat size={12} />}
          onClick={() => onScrollTo("updates")}
        >
          Open thread
        </Button>
        <Button
          kind="secondary"
          size="sm"
          fullWidth
          leading={<I.Calendar size={12} />}
          onClick={() => onScrollTo("agenda")}
        >
          View agenda
        </Button>
        <Button
          kind="secondary"
          size="sm"
          fullWidth
          leading={
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: getPhaseColor(project.phase) }}
            />
          }
          onClick={() => showToast("Move-phase coming with project workflow")}
        >
          Move phase
        </Button>
      </div>
    </div>
  );
}

// ─── Section nav ──────────────────────────────────────────────────
function SectionNav({
  active,
  onJump,
}: {
  active: string;
  onJump: (id: string) => void;
}) {
  const items = [
    { id: "glance", label: "01 — At a glance" },
    { id: "about", label: "02 — About" },
    { id: "team", label: "03 — Team" },
    { id: "updates", label: "04 — Updates" },
    { id: "files", label: "05 — Files" },
    { id: "agenda", label: "06 — Agenda" },
    { id: "activity", label: "07 — Activity" },
  ];
  return (
    <div className="sticky top-0 z-[4] bg-friday-bg border-b border-friday-border-soft flex gap-1 px-7 py-2 overflow-x-auto scrollbar-none">
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onJump(it.id)}
            className={cn(
              "px-2.5 py-1 bg-transparent text-[11px] cursor-pointer transition-colors duration-150 whitespace-nowrap -mb-px",
              isActive
                ? "text-friday-fg font-medium"
                : "text-friday-fg-muted hover:text-friday-fg",
            )}
            style={{
              borderBottom: `1.5px solid ${isActive ? "var(--friday-accent)" : "transparent"}`,
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────
export function ProjectDetailClient({
  project,
  team,
  agenda,
  activity,
  editable: _editable,
}: ProjectDetailClientProps) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const [activeSec, setActiveSec] = React.useState("glance");
  const [starred, setStarred] = React.useState(project.starred);

  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => {
      const y = root.scrollTop + 80;
      const ids = ["glance", "about", "team", "updates", "files", "agenda", "activity"];
      let cur = "glance";
      for (const id of ids) {
        const el = sectionRefs.current[id];
        if (el && el.offsetTop - 20 <= y) cur = id;
      }
      setActiveSec(cur);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  const jumpTo = React.useCallback((id: string) => {
    const root = scrollRef.current;
    const el = sectionRefs.current[id];
    if (!root || !el) return;
    root.scrollTo({ top: Math.max(0, el.offsetTop - 56), behavior: "smooth" });
  }, []);

  const onStarToggle = async () => {
    const next = !starred;
    setStarred(next);
    showToast(next ? "Starred" : "Removed from starred");
    try {
      if (next) {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "project", entityId: project.id }),
        });
      } else {
        await fetch(
          `/api/favorites?entityType=project&entityId=${encodeURIComponent(project.id)}`,
          { method: "DELETE" },
        );
      }
    } catch {
      setStarred(!next);
    }
  };

  return (
    <div className="flex-1 flex min-w-0 bg-friday-bg overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-y-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        <ProjectHero
          project={project}
          starred={starred}
          onStarToggle={onStarToggle}
        />
        <SectionNav active={activeSec} onJump={jumpTo} />

        <div
          className="flex flex-col gap-11"
          style={{ padding: "28px 36px", maxWidth: 920 }}
        >
          <section
            ref={(el) => {
              sectionRefs.current.glance = el;
            }}
          >
            <SectionHeading idx="01" title="At a glance" />
            <AtAGlance project={project} />
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.about = el;
            }}
          >
            <SectionHeading idx="02" title="About" />
            {project.description ? (
              <p
                className="text-friday-fg leading-relaxed m-0 max-w-[60ch]"
                style={{
                  fontFamily: "var(--font-friday-serif), Georgia, serif",
                  fontSize: 15.5,
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                }}
              >
                {project.description}
              </p>
            ) : (
              <EmptyState
                glyph="·"
                title="No description yet."
                body="Add a project description so the team and the client always have the elevator pitch on hand."
              />
            )}
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.team = el;
            }}
          >
            <SectionHeading
              idx="03"
              title="Team"
              action={
                <span className="font-mono text-[10px] text-friday-fg-subtle">
                  {team.length} {team.length === 1 ? "person" : "people"}
                </span>
              }
            />
            {team.length > 0 ? (
              <TeamSection team={team} />
            ) : (
              <EmptyState
                glyph="·"
                title="No one assigned."
                body="Assign architects, coordinators, and reviewers from the Users surface."
              />
            )}
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.updates = el;
            }}
          >
            <SectionHeading
              idx="04"
              title="Updates"
              action={
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/chat?project=${project.id}`)}
                  className="bg-transparent border-0 cursor-pointer text-[11.5px] text-friday-fg-muted p-0 hover:text-friday-fg"
                >
                  All threads →
                </button>
              }
            />
            <div className="border border-friday-border-soft bg-friday-surface rounded">
              <EmptyState
                glyph="·"
                title="No project thread loaded here yet."
                body="Open the full chat surface for this project's discussion threads."
                cta="Open chat"
                onCta={() => router.push(`/dashboard/chat?project=${project.id}`)}
              />
            </div>
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.files = el;
            }}
          >
            <SectionHeading idx="05" title="Files" />
            <EmptyState
              glyph="·"
              title="Files surface coming."
              body="Plans, BIM, and renderings will live here once project storage is wired in. For now they live in shared Drive."
            />
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.agenda = el;
            }}
          >
            <SectionHeading
              idx="06"
              title="Agenda"
              action={
                <span className="font-mono text-[10px] text-friday-fg-subtle">
                  {agenda.filter((a) => a.status !== "done").length} open
                </span>
              }
            />
            <AgendaSection items={agenda} />
          </section>

          <section
            ref={(el) => {
              sectionRefs.current.activity = el;
            }}
            className="pb-20"
          >
            <SectionHeading
              idx="07"
              title="Activity"
              action={
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/activity")}
                  className="bg-transparent border-0 cursor-pointer text-[11.5px] text-friday-fg-muted p-0 hover:text-friday-fg"
                >
                  Full feed →
                </button>
              }
            />
            <ActivitySection items={activity} />
          </section>
        </div>
      </div>

      <StickyRail project={project} onScrollTo={jumpTo} />
    </div>
  );
}
