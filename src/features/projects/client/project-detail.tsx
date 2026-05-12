"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Boxes,
  CalendarPlus,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Layers,
  MessageSquarePlus,
  MoreHorizontal,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { cn, PHASE_COLORS } from "@/ui/utils";
import { showToast } from "@/ui/components/toast";
import { translatePhase, useT } from "@/i18n/translations";

// ── Types ─────────────────────────────────────────────────────────

export type ProjectDetailData = {
  project: {
    id: string;
    code: string;
    title: string;
    phase: string;
    workStatus: string;
    category: string;
    client: string | null;
    year: number | null;
    commune: string | null;
    typology: string | null;
    terrain: string | null;
    roof: string | null;
    description: string | null;
    image: string | null;
    floors: number | null;
    area: number | null;
    billing: string | null;
    country: string | null;
    operatingRegion: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    pageLink: string | null;
    updatedAt: string;
  };
  assignments: Array<{
    userId: string;
    role: string | null;
    user: {
      id: string;
      name: string | null;
      email: string;
      initials: string | null;
      image: string | null;
      role: string;
    };
  }>;
  agenda: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    priority: string;
    type: string;
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { id: string; name: string | null; initials: string | null; image: string | null } | null;
  }>;
  files: Array<{
    id: string;
    kind: "plan" | "image";
    title: string;
    url: string;
    type: string;
    year: number | null;
    createdAt: string;
  }>;
  threads: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; name: string | null; initials: string | null; image: string | null } | null;
    replies: Array<{
      id: string;
      content: string;
      createdAt: string;
      user: { id: string; name: string | null; initials: string | null; image: string | null } | null;
    }>;
  }>;
  starred: boolean;
  currentUserId: string;
  isAdmin: boolean;
};

// ── Section nav ───────────────────────────────────────────────────

const SECTIONS = [
  { id: "glance",  num: "01", label: "At a glance" },
  { id: "about",   num: "02", label: "About" },
  { id: "team",    num: "03", label: "Team" },
  { id: "updates", num: "04", label: "Updates" },
  { id: "files",   num: "05", label: "Files" },
  { id: "agenda",  num: "06", label: "Agenda" },
  { id: "activity",num: "07", label: "Activity" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// Work-status display
const STATUS_META: Record<string, { label: string; dot: string }> = {
  todo:      { label: "Not started",   dot: "#a8a59d" },
  doing:     { label: "On track",      dot: "#22a06b" },
  stuck:     { label: "Stuck",         dot: "#e2445c" },
  completed: { label: "Done",          dot: "#1e3a8a" },
};

// Phase canonical → short label + qualifier for the hero badge
function splitPhase(phase: string): { short: string; qualifier: string | null } {
  // e.g. "ETUDE/AP" → short=ETUDE, qualifier=AP
  // e.g. "Phase 41 — DAP" → keep as-is
  const sep = phase.includes(" — ") ? " — " : phase.includes("/") ? "/" : null;
  if (!sep) return { short: phase, qualifier: null };
  const [a, b] = phase.split(sep);
  return { short: a.trim(), qualifier: b ? b.trim() : null };
}

// ── Component ─────────────────────────────────────────────────────

export function ProjectDetail({ data }: { data: ProjectDetailData }) {
  const t = useT();
  const router = useRouter();
  const { project } = data;
  const phaseColor = PHASE_COLORS[project.phase] ?? "#a8a59d";
  const status = STATUS_META[project.workStatus] ?? STATUS_META.todo;
  const { short: phaseShort, qualifier: phaseQual } = splitPhase(project.phase);

  // Scroll-spy: track which section is currently visible
  const [active, setActive] = useState<SectionId>("glance");
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    glance: null, about: null, team: null, updates: null,
    files: null, agenda: null, activity: null,
  });

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const id = visible.target.getAttribute("data-section-id") as SectionId | null;
          if (id) setActive(id);
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: SectionId) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Star toggle
  const [starred, setStarred] = useState(data.starred);
  const [starBusy, setStarBusy] = useState(false);
  const toggleStar = async () => {
    if (starBusy) return;
    setStarBusy(true);
    const next = !starred;
    setStarred(next); // optimistic
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
      setStarred(!next); // rollback
      showToast("Couldn't update star", "danger");
    } finally {
      setStarBusy(false);
    }
  };

  // Reply input — posts to the project thread
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const sendReply = async (threadId: string | null) => {
    const body = reply.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body, parentId: threadId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "post failed");
      }
      setReply("");
      router.refresh();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Couldn't post — try again",
        "danger",
      );
    } finally {
      setPosting(false);
    }
  };

  // Move phase — admin/director only
  const [phaseMenu, setPhaseMenu] = useState(false);
  const phaseOptions = useMemo(
    () => Object.keys(PHASE_COLORS),
    [],
  );
  const [movingPhase, setMovingPhase] = useState(false);
  const movePhase = async (next: string) => {
    if (next === project.phase || movingPhase) return;
    setMovingPhase(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: next }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "update failed");
      }
      setPhaseMenu(false);
      router.refresh();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Couldn't move phase",
        "danger",
      );
    } finally {
      setMovingPhase(false);
    }
  };

  // Static-map style placeholder for the right sidebar; replaced by a
  // real tile when Google Maps Static API key is available, but the
  // /api/maps/config check is per-request — keep this purely visual.
  const hasCoords = project.latitude != null && project.longitude != null;

  return (
    <div className="min-h-full bg-friday-bg">
      {/* ── Breadcrumb ────────────────────────────────────────── */}
      <div className="px-6 sm:px-8 py-3 border-b border-friday-border-soft flex items-center gap-2 text-[12.5px]">
        <Link
          href="/dashboard/projects"
          className="text-friday-fg-muted hover:text-friday-fg transition-colors"
        >
          ← Projects
        </Link>
        <span className="text-friday-fg-subtle">/</span>
        <span className="font-display italic text-friday-fg">{project.title}</span>
        <span className="font-mono text-[11px] text-friday-fg-subtle ml-1">
          {project.code}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] max-w-[1440px] mx-auto">
        {/* ── Main column ───────────────────────────────────── */}
        <div className="min-w-0">

          {/* Hero */}
          <div className="relative w-full aspect-[16/6] bg-friday-surface-2 overflow-hidden">
            {project.image ? (
              <Image
                src={project.image}
                alt={project.title}
                fill
                sizes="(min-width: 1024px) 1100px, 100vw"
                priority
                className="object-cover grayscale"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display italic text-7xl text-friday-fg-subtle/30">
                  {project.code.slice(0, 3)}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />

            {/* top-right utility icons */}
            <div className="absolute top-3 right-3 flex gap-1">
              <button
                onClick={toggleStar}
                aria-label={starred ? "Unstar project" : "Star project"}
                className={cn(
                  "w-8 h-8 rounded-md backdrop-blur-sm flex items-center justify-center transition-colors",
                  starred
                    ? "bg-white/90 text-friday-accent"
                    : "bg-black/30 text-white/80 hover:bg-black/45 hover:text-white",
                )}
              >
                <Star
                  className="w-3.5 h-3.5"
                  fill={starred ? "currentColor" : "none"}
                />
              </button>
              <button
                aria-label="Ask DBS AI"
                title="Ask DBS AI"
                className="w-8 h-8 rounded-md backdrop-blur-sm bg-black/30 text-white/80 hover:bg-black/45 hover:text-white flex items-center justify-center transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                aria-label="More"
                className="w-8 h-8 rounded-md backdrop-blur-sm bg-black/30 text-white/80 hover:bg-black/45 hover:text-white flex items-center justify-center transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* bottom-left overlay: code, title, badges */}
            <div className="absolute bottom-5 left-6 right-6 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] tracking-wide text-white/70">
                  {project.code}
                </p>
                <h1 className="font-display italic text-white text-4xl sm:text-5xl leading-[1.05] mt-1 truncate">
                  {project.title}
                </h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10.5px] tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor }} />
                    {phaseShort}{phaseQual ? ` — ${phaseQual}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10.5px] tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                    {status.label}
                  </span>
                </div>
              </div>
              {project.pageLink ? (
                <a
                  href={project.pageLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex shrink-0 items-center gap-2 px-3.5 py-2 rounded-md bg-friday-accent text-white text-[12px] font-medium tracking-wide hover:opacity-90 transition-opacity"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Open in 3D
                </a>
              ) : (
                <button
                  disabled
                  title="3D model not linked yet"
                  className="hidden sm:inline-flex shrink-0 items-center gap-2 px-3.5 py-2 rounded-md bg-black/40 backdrop-blur-sm text-white/80 border border-white/15 text-[12px] font-medium tracking-wide cursor-not-allowed"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Open in 3D
                </button>
              )}
            </div>
          </div>

          {/* Section tabs */}
          <nav className="sticky top-0 z-10 bg-friday-bg/95 backdrop-blur-sm border-b border-friday-border-soft px-6 sm:px-8">
            <div className="flex gap-5 overflow-x-auto text-[12px] [scrollbar-width:none]">
              {SECTIONS.map((s) => {
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={cn(
                      "relative py-3 whitespace-nowrap transition-colors",
                      isActive
                        ? "text-friday-fg font-medium"
                        : "text-friday-fg-muted hover:text-friday-fg",
                    )}
                  >
                    <span className="font-mono text-friday-fg-subtle mr-1.5">{s.num}</span>
                    — {s.label}
                    {isActive && (
                      <span className="absolute left-0 right-0 -bottom-px h-[1.5px] bg-friday-fg" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Sections */}
          <div className="px-6 sm:px-8 pt-8 pb-16 space-y-12">

            <Section
              num="01"
              id="glance"
              title="At a glance"
              setRef={(el) => (sectionRefs.current.glance = el)}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-friday-border-soft rounded">
                <Stat label="Phase" sub={phaseQual ?? null}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor }} />
                    {phaseShort}
                  </span>
                </Stat>
                <Stat label="Status">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                    {status.label}
                  </span>
                </Stat>
                <Stat label="Year">{project.year ?? "—"}</Stat>
                <Stat label="Commune">
                  {[project.commune, project.operatingRegion].filter(Boolean).join(", ") || "—"}
                </Stat>
              </div>
            </Section>

            <Section
              num="02"
              id="about"
              title="About"
              setRef={(el) => (sectionRefs.current.about = el)}
            >
              {project.description ? (
                <p className="font-serif text-[14.5px] leading-[1.65] text-friday-fg max-w-3xl whitespace-pre-wrap">
                  {project.description}
                </p>
              ) : (
                <p className="font-display italic text-friday-fg-muted">
                  No description yet.
                </p>
              )}
            </Section>

            <Section
              num="03"
              id="team"
              title="Team"
              setRef={(el) => (sectionRefs.current.team = el)}
              right={
                <span className="text-[11px] text-friday-fg-subtle font-mono">
                  {data.assignments.length} {data.assignments.length === 1 ? "person" : "people"}
                </span>
              }
            >
              <div className="flex flex-wrap gap-2">
                {data.assignments.length === 0 && (
                  <span className="font-display italic text-friday-fg-muted">
                    No one assigned yet.
                  </span>
                )}
                {data.assignments.map((a) => (
                  <div
                    key={a.userId}
                    className="inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full border border-friday-border-soft bg-friday-surface"
                  >
                    <InitialsAvatar initials={a.user.initials ?? a.user.name?.slice(0, 2)?.toUpperCase() ?? "·"} />
                    <div className="leading-tight">
                      <p className="text-[12px] text-friday-fg">{a.user.name ?? a.user.email}</p>
                      <p className="text-[10px] text-friday-fg-subtle capitalize">{a.role ?? a.user.role}</p>
                    </div>
                  </div>
                ))}
                {data.isAdmin && (
                  <Link
                    href={`/dashboard/users?project=${encodeURIComponent(project.id)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-friday-border text-friday-fg-muted hover:border-friday-fg hover:text-friday-fg text-[11.5px] transition-colors"
                  >
                    + Assign
                  </Link>
                )}
              </div>
            </Section>

            <Section
              num="04"
              id="updates"
              title="Updates"
              setRef={(el) => (sectionRefs.current.updates = el)}
              right={
                <Link
                  href="/dashboard/chat"
                  className="text-[11.5px] text-friday-fg-muted hover:text-friday-fg transition-colors"
                >
                  All threads →
                </Link>
              }
            >
              {data.threads.length === 0 ? (
                <ThreadEmptyState onPost={(content) => {
                  setReply(content);
                  sendReply(null);
                }} disabled={posting} />
              ) : (
                <div className="space-y-4">
                  {data.threads.map((th) => (
                    <div
                      key={th.id}
                      className="border border-friday-border-soft rounded bg-friday-surface overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-friday-border-soft flex items-center justify-between">
                        <p className="text-[12.5px] text-friday-fg truncate">
                          <span className="inline-flex items-center gap-1.5">
                            <MessageSquarePlus className="w-3 h-3 text-friday-fg-muted" />
                            {th.content.slice(0, 70)}{th.content.length > 70 ? "…" : ""}
                          </span>
                        </p>
                        <span className="text-[10.5px] text-friday-fg-subtle font-mono">
                          {th.replies.length + 1} message{th.replies.length === 0 ? "" : "s"}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-3">
                        <ThreadMessage
                          author={th.user?.name ?? "—"}
                          initials={th.user?.initials ?? "·"}
                          time={th.createdAt}
                          body={th.content}
                        />
                        {th.replies.map((r) => (
                          <ThreadMessage
                            key={r.id}
                            author={r.user?.name ?? "—"}
                            initials={r.user?.initials ?? "·"}
                            time={r.createdAt}
                            body={r.content}
                          />
                        ))}
                      </div>
                      <ReplyBar
                        value={reply}
                        onChange={setReply}
                        disabled={posting}
                        onSend={() => sendReply(th.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              num="05"
              id="files"
              title="Files"
              setRef={(el) => (sectionRefs.current.files = el)}
              right={
                <span className="text-[11.5px] text-friday-fg-subtle font-mono">
                  {data.files.length} file{data.files.length === 1 ? "" : "s"}
                </span>
              }
            >
              {data.files.length === 0 ? (
                <div className="border border-dashed border-friday-border rounded px-6 py-10 text-center">
                  <FileText className="w-5 h-5 text-friday-fg-subtle/40 mx-auto mb-2" />
                  <p className="font-display italic text-friday-fg-muted">
                    No files uploaded yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.files.map((f) => (
                    <FileCard key={f.id} file={f} />
                  ))}
                </div>
              )}
            </Section>

            <Section
              num="06"
              id="agenda"
              title="Agenda"
              setRef={(el) => (sectionRefs.current.agenda = el)}
              right={
                <span className="text-[11.5px] text-friday-fg-subtle font-mono">
                  {data.agenda.filter((a) => a.status !== "done").length} open
                </span>
              }
            >
              {data.agenda.length === 0 ? (
                <p className="font-display italic text-friday-fg-muted">
                  No deadlines or meetings yet.
                </p>
              ) : (
                <div className="border border-friday-border-soft rounded overflow-hidden">
                  {data.agenda.map((it, i) => (
                    <AgendaRow
                      key={it.id}
                      item={it}
                      last={i === data.agenda.length - 1}
                    />
                  ))}
                  <Link
                    href={`/dashboard/agenda?project=${project.id}`}
                    className="block px-4 py-2.5 text-[12px] text-friday-fg-muted hover:text-friday-fg hover:bg-friday-surface-2 border-t border-friday-border-soft transition-colors"
                  >
                    + Add deadline
                  </Link>
                </div>
              )}
            </Section>

            <Section
              num="07"
              id="activity"
              title="Activity"
              setRef={(el) => (sectionRefs.current.activity = el)}
              right={
                <Link
                  href="/dashboard/activity"
                  className="text-[11.5px] text-friday-fg-muted hover:text-friday-fg transition-colors"
                >
                  Full feed →
                </Link>
              }
            >
              {data.activities.length === 0 ? (
                <p className="font-display italic text-friday-fg-muted">
                  No activity yet.
                </p>
              ) : (
                <ul className="border border-friday-border-soft rounded divide-y divide-friday-border-soft overflow-hidden">
                  {data.activities.map((a) => (
                    <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                      <InitialsAvatar
                        initials={a.user?.initials ?? a.user?.name?.slice(0, 2)?.toUpperCase() ?? "·"}
                        size={22}
                      />
                      <p className="flex-1 min-w-0 truncate text-friday-fg">{a.description}</p>
                      <span className="text-[11px] text-friday-fg-subtle font-mono whitespace-nowrap">
                        {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────── */}
        <aside className="hidden lg:block border-l border-friday-border-soft bg-friday-bg">
          <div className="sticky top-0 px-5 py-6 space-y-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
              Project
            </p>

            {/* Map thumb — gradient drawn from Friday tokens so it stays
                tonally consistent in both light and dark modes. */}
            <div
              className="relative w-full aspect-[2/1] rounded border border-friday-border-soft overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, var(--friday-surface-2) 0%, var(--friday-surface) 45%, var(--friday-surface-3) 100%)",
              }}
            >
              {hasCoords && (
                <span
                  className="absolute w-2.5 h-2.5 rounded-full border-2 border-white"
                  style={{
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "var(--friday-accent)",
                  }}
                />
              )}
            </div>

            <Meta
              rows={[
                { label: "Client", value: project.client },
                { label: "Address", value: project.address },
              ]}
            />

            <Meta
              rows={[
                { label: "Year", value: project.year?.toString() ?? null },
                { label: "Category", value: project.category },
                { label: "Typology", value: project.typology },
                { label: "Floors", value: project.floors?.toString() ?? null },
                { label: "Area", value: project.area ? `${project.area} m² SBP` : null },
                { label: "Billing", value: project.billing },
              ]}
              columns={2}
            />

            {/* Quick actions */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle mb-2">
                Quick actions
              </p>
              <div className="space-y-1.5">
                {project.pageLink ? (
                  <a
                    href={project.pageLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 h-9 rounded-md bg-friday-accent text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    Open in 3D
                  </a>
                ) : null}
                <button
                  onClick={() => scrollTo("updates")}
                  className="w-full flex items-center justify-center gap-2 h-9 rounded-md bg-friday-surface border border-friday-border text-[12px] text-friday-fg hover:border-friday-fg/40 transition-colors"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-friday-fg-muted" />
                  Open thread
                </button>
                <Link
                  href={`/dashboard/agenda?project=${project.id}`}
                  className="w-full flex items-center justify-center gap-2 h-9 rounded-md bg-friday-surface border border-friday-border text-[12px] text-friday-fg hover:border-friday-fg/40 transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-friday-fg-muted" />
                  Add deadline
                </Link>
                <div className="relative">
                  <button
                    onClick={() => data.isAdmin && setPhaseMenu((v) => !v)}
                    disabled={!data.isAdmin || movingPhase}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 h-9 rounded-md bg-friday-surface border border-friday-border text-[12px] text-friday-fg transition-colors",
                      data.isAdmin
                        ? "hover:border-friday-fg/40 cursor-pointer"
                        : "opacity-60 cursor-not-allowed",
                    )}
                    title={data.isAdmin ? undefined : "Admins only"}
                  >
                    <Layers className="w-3.5 h-3.5 text-friday-fg-muted" />
                    Move phase
                    <ChevronDown className="w-3 h-3 text-friday-fg-muted" />
                  </button>
                  {phaseMenu && data.isAdmin && (
                    <div
                      className="absolute right-0 left-0 mt-1 bg-friday-surface border border-friday-border rounded shadow-lg overflow-hidden z-20"
                    >
                      {phaseOptions.map((p) => (
                        <button
                          key={p}
                          onClick={() => movePhase(p)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-friday-fg hover:bg-friday-surface-2 text-left",
                            p === project.phase && "bg-friday-surface-2",
                          )}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: PHASE_COLORS[p] ?? "#a8a59d" }}
                          />
                          <span className="flex-1">{translatePhase(p, t)}</span>
                          {p === project.phase && (
                            <span className="text-[10px] text-friday-fg-subtle">current</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────

function Section({
  num,
  id,
  title,
  right,
  setRef,
  children,
}: {
  num: string;
  id: SectionId;
  title: string;
  right?: React.ReactNode;
  setRef: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={setRef}
      data-section-id={id}
      className="scroll-mt-14"
    >
      <header className="flex items-end justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] text-friday-fg-subtle tracking-widest">
            {num}
          </span>
          <h2 className="font-display italic text-friday-fg text-2xl leading-none">
            {title}
          </h2>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Stat({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-r last:border-r-0 border-friday-border-soft">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.2em] text-friday-fg-subtle">
        {label}
      </p>
      <div className="text-[14px] text-friday-fg mt-1.5">{children}</div>
      {sub && (
        <p className="text-[11px] text-friday-fg-muted mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function InitialsAvatar({ initials, size = 26 }: { initials: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-friday-surface-2 text-friday-fg font-mono shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
    >
      {initials}
    </span>
  );
}

function ThreadMessage({
  author,
  initials,
  time,
  body,
}: {
  author: string;
  initials: string;
  time: string;
  body: string;
}) {
  const t = new Date(time);
  const shortTime = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const shortDate = t.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return (
    <div className="flex gap-3">
      <InitialsAvatar initials={initials} size={26} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-medium text-friday-fg">{author}</span>
          <span className="font-mono text-[10.5px] text-friday-fg-subtle">
            {shortTime} · {shortDate}
          </span>
        </div>
        <p className="text-[12.5px] text-friday-fg leading-snug whitespace-pre-wrap mt-0.5">
          {body}
        </p>
      </div>
    </div>
  );
}

function ReplyBar({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="px-4 py-3 border-t border-friday-border-soft flex items-center gap-2 bg-friday-bg">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && value.trim()) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Reply to the thread…"
        className="flex-1 h-9 px-3 text-[12.5px] bg-friday-surface border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className={cn(
          "h-9 px-3 rounded text-[12px] font-medium tracking-wide flex items-center gap-1.5 transition-colors",
          value.trim() && !disabled
            ? "bg-friday-accent text-white hover:opacity-90"
            : "bg-friday-surface-2 text-friday-fg-subtle cursor-not-allowed",
        )}
      >
        <Send className="w-3 h-3" />
        Reply
      </button>
    </div>
  );
}

function ThreadEmptyState({
  onPost,
  disabled,
}: {
  onPost: (content: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="border border-dashed border-friday-border rounded px-5 py-6 text-center bg-friday-surface">
      <p className="font-display italic text-friday-fg text-lg mb-2">
        No updates yet — start the first thread.
      </p>
      <div className="max-w-md mx-auto mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What's the first update?"
          className="flex-1 h-9 px-3 text-[12.5px] bg-friday-bg border border-friday-border-soft rounded text-friday-fg placeholder:text-friday-fg-subtle focus:outline-none focus:border-friday-accent"
        />
        <button
          onClick={() => {
            if (draft.trim() && !disabled) {
              onPost(draft);
              setDraft("");
            }
          }}
          disabled={!draft.trim() || disabled}
          className={cn(
            "h-9 px-3 rounded text-[12px] font-medium tracking-wide",
            draft.trim() && !disabled
              ? "bg-friday-accent text-white hover:opacity-90"
              : "bg-friday-surface-2 text-friday-fg-subtle cursor-not-allowed",
          )}
        >
          Post
        </button>
      </div>
    </div>
  );
}

function FileCard({ file }: { file: ProjectDetailData["files"][number] }) {
  const isImage = file.kind === "image" && /\.(jpe?g|png|webp|avif|gif)$/i.test(file.url);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block border border-friday-border-soft rounded bg-friday-surface hover:border-friday-fg/30 transition-colors overflow-hidden"
    >
      <div className="relative aspect-[5/4] bg-friday-surface-2 overflow-hidden">
        {isImage ? (
          <Image
            src={file.url}
            alt={file.title}
            fill
            sizes="240px"
            className="object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {file.kind === "plan" ? (
              <PlanPlaceholder />
            ) : (
              <ImageIcon className="w-7 h-7 text-friday-fg-subtle/40" />
            )}
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 font-mono text-[9.5px] uppercase tracking-wider text-friday-fg-subtle bg-friday-bg/90 px-1.5 py-0.5 rounded">
          {file.type}
        </span>
      </div>
      <div className="px-2.5 py-1.5 text-[11.5px] text-friday-fg truncate">
        {file.title}
      </div>
    </a>
  );
}

function PlanPlaceholder() {
  return (
    <svg viewBox="0 0 60 48" className="w-2/3 h-2/3 text-friday-fg-subtle/50">
      <rect x="6" y="6" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="32" y="6" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6" y="24" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="32" y="24" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AgendaRow({
  item,
  last,
}: {
  item: ProjectDetailData["agenda"][number];
  last: boolean;
}) {
  const date = new Date(item.date);
  const isDone = item.status === "done";
  const dotColor =
    item.priority === "critical" || item.priority === "high"
      ? "#e2445c"
      : item.priority === "medium"
        ? "#fdab3d"
        : isDone
          ? "var(--friday-fg-subtle)"
          : "#22a06b";
  return (
    <div
      className={cn(
        "grid items-center px-4 py-2.5 gap-3 text-[12.5px]",
        !last && "border-b border-friday-border-soft",
      )}
      style={{ gridTemplateColumns: "auto 110px 1fr 60px" }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: isDone ? "var(--friday-fg-subtle)" : dotColor }}
      />
      <span className="font-mono text-[11px] text-friday-fg-muted">
        {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
      </span>
      <span className={cn("truncate", isDone && "line-through text-friday-fg-subtle")}>
        {item.title}
      </span>
      <span
        className={cn(
          "text-right font-mono text-[10px] tracking-wider uppercase",
          isDone ? "text-friday-fg-subtle" : "text-friday-fg-muted",
        )}
      >
        {isDone ? "done" : "open"}
      </span>
    </div>
  );
}

function Meta({
  rows,
  columns = 1,
}: {
  rows: { label: string; value: string | null }[];
  columns?: 1 | 2;
}) {
  const visible = rows.filter((r) => r.value);
  if (visible.length === 0) return null;
  return (
    <div
      className={cn("grid gap-x-4 gap-y-3", columns === 2 ? "grid-cols-2" : "grid-cols-1")}
    >
      {visible.map((r) => (
        <div key={r.label}>
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-friday-fg-subtle">
            {r.label}
          </p>
          <p className="text-[12.5px] text-friday-fg mt-1 leading-snug">{r.value}</p>
        </div>
      ))}
    </div>
  );
}
