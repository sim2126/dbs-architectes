"use client";

import * as React from "react";
import { Avatar } from "@/components/friday/avatar";
import { getPhaseColor, getPhaseLabel } from "@/lib/friday-tokens";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
interface ProjectStat {
  id: string;
  phase: string;
  workStatus: string | null;
  category: string;
  country: string | null;
  commune: string | null;
  year: number | null;
  userIds: string[];
}

interface UserStat {
  id: string;
  name: string;
  initials: string;
  country: string | null;
}

interface StatisticsClientProps {
  projects: ProjectStat[];
  users: UserStat[];
}

// ─── Constants ────────────────────────────────────────────────────
const COUNTRIES: Record<string, { label: string; flag: string }> = {
  CH: { label: "Switzerland", flag: "🇨🇭" },
  IT: { label: "Italy", flag: "🇮🇹" },
  IN: { label: "India", flag: "🇮🇳" },
  ALL: { label: "All", flag: "◯" },
};

// Stable phase ordering for the distribution bar.
const PHASE_ORDER = [
  "ETUDE/AP",
  "CONCORSO",
  "MAE",
  "CHANTIER",
  "EXE/DG/DV/3D",
  "TERMINATO",
  "STUCK",
];

const CAT_COLORS: Record<string, string> = {
  Hôtellerie: "#1f3a8a",
  Hospitality: "#1f3a8a",
  Residenziale: "#7a8b6f",
  "Mixed Use": "#c4994a",
  Refurbishment: "#5a6f8a",
  "Single family homes": "#8a5a3a",
  "Residential complexes": "#6a4a8a",
  Public: "#5a8a8a",
  default: "#6b6862",
};

function colorForCategory(cat: string): string {
  return CAT_COLORS[cat] ?? CAT_COLORS.default;
}

// Coordinate hints for known DBS communes (% within the small map
// canvas — illustrative only). Falls back to country centroid.
const COMMUNE_COORDS: Record<string, { x: number; y: number }> = {
  Sion: { x: 47, y: 44 },
  "Crans-Montana": { x: 49, y: 38 },
  Verbier: { x: 50, y: 47 },
  Conthey: { x: 48, y: 42 },
  Lavey: { x: 46, y: 50 },
  Montreux: { x: 44, y: 49 },
  Gstaad: { x: 53, y: 41 },
  Savièse: { x: 47, y: 41 },
  Milano: { x: 56, y: 52 },
  Bolzano: { x: 60, y: 36 },
  Bressanone: { x: 60, y: 33 },
  Negrar: { x: 58, y: 49 },
  Trento: { x: 59, y: 41 },
  Mumbai: { x: 78, y: 64 },
  Delhi: { x: 81, y: 35 },
  Kashmir: { x: 80, y: 30 },
};
const COUNTRY_FALLBACK: Record<string, { x: number; y: number }> = {
  CH: { x: 48, y: 44 },
  IT: { x: 58, y: 48 },
  IN: { x: 80, y: 50 },
  UA: { x: 70, y: 28 },
};

// ─── Header ───────────────────────────────────────────────────────
function StatsHeader({
  country,
  setCountry,
}: {
  country: string;
  setCountry: (c: string) => void;
}) {
  return (
    <div className="h-15 px-7 border-b border-friday-border-soft flex items-center gap-3.5 shrink-0" style={{ height: 60 }}>
      <div className="flex-1 min-w-0">
        <h1 className="font-display italic font-medium text-[24px] text-friday-fg m-0 -tracking-[0.3px] leading-[1.15]">
          Statistics
        </h1>
      </div>
      <div className="flex items-center gap-1.5">
        {(["CH", "IT", "IN", "ALL"] as const).map((c) => {
          const active = country === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCountry(c)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-3 rounded-full cursor-pointer text-[11.5px] font-medium tracking-wide transition-colors duration-150 border",
                active
                  ? "bg-friday-fg text-friday-bg border-friday-fg"
                  : "bg-friday-surface text-friday-fg-muted border-friday-border-soft hover:text-friday-fg",
              )}
            >
              <span className="text-[12px]">{COUNTRIES[c].flag}</span>
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card frame ───────────────────────────────────────────────────
function StatsCard({
  title,
  subtitle,
  children,
  noPadding,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <section className="bg-friday-bg border border-friday-border-soft rounded-lg overflow-hidden">
      {title || subtitle ? (
        <div className="px-5 pt-3.5 pb-3 border-b border-friday-border-soft flex items-baseline gap-2.5">
          {title ? (
            <h2 className="font-display italic font-medium text-[16px] text-friday-fg m-0 -tracking-[0.2px]">
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <span className="text-[11px] text-friday-fg-muted">{subtitle}</span>
          ) : null}
        </div>
      ) : null}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────
function KpiStrip({ data }: { data: ProjectStat[] }) {
  const total = data.length;
  const active = data.filter((p) => p.phase !== "TERMINATO").length;
  const stuck = data.filter(
    (p) => p.phase === "STUCK" || p.workStatus === "stuck",
  ).length;
  const thisYear = new Date().getFullYear();
  const completedYr = data.filter(
    (p) => p.phase === "TERMINATO" && p.year === thisYear,
  ).length;

  const items: { l: string; v: number; tone?: "warn" }[] = [
    { l: "Total projects", v: total },
    { l: "Active", v: active },
    { l: "Stuck", v: stuck, tone: stuck > 0 ? "warn" : undefined },
    { l: "Completed this year", v: completedYr },
  ];

  return (
    <StatsCard noPadding>
      <div className="grid grid-cols-4">
        {items.map((k, i) => (
          <div
            key={k.l}
            className={cn(
              "px-[22px] py-5",
              i < 3 ? "border-r border-friday-border-soft" : "",
            )}
          >
            <div className="text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-medium mb-1.5">
              {k.l}
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="font-display font-medium text-[32px] -tracking-[0.6px] leading-none"
                style={{
                  color:
                    k.tone === "warn" && k.v > 0
                      ? "#9b2c1a"
                      : "var(--friday-fg)",
                }}
              >
                {k.v}
              </span>
            </div>
          </div>
        ))}
      </div>
    </StatsCard>
  );
}

// ─── Phase distribution ───────────────────────────────────────────
function PhaseDistribution({ data }: { data: ProjectStat[] }) {
  const [hover, setHover] = React.useState<string | null>(null);
  const counts = PHASE_ORDER.map((p) => ({
    p,
    n: data.filter((d) => d.phase === p).length,
  })).filter((c) => c.n > 0);
  const total = counts.reduce((a, c) => a + c.n, 0);

  if (total === 0) return null;

  return (
    <StatsCard
      title="Phase distribution"
      subtitle={`${total} projects across ${counts.length} ${counts.length === 1 ? "phase" : "phases"}`}
    >
      <div
        className="relative flex w-full rounded overflow-hidden bg-friday-surface-2"
        style={{ height: 32 }}
      >
        {counts.map(({ p, n }) => {
          const pct = (n / total) * 100;
          const isHover = hover === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => showToast(`Filter by phase ${p}`)}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              className="relative h-full border-0 p-0 cursor-pointer transition-[opacity,width] duration-200 ease-out"
              style={{
                width: `${pct}%`,
                background: getPhaseColor(p),
                opacity: hover && !isHover ? 0.55 : 1,
              }}
            >
              {pct > 6 ? (
                <span
                  className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold tracking-wide pointer-events-none"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  {n}
                </span>
              ) : null}
              {isHover ? (
                <div
                  className="absolute z-10 px-2.5 py-1.5 rounded text-[10.5px] font-medium tracking-wide whitespace-nowrap pointer-events-none"
                  style={{
                    bottom: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--friday-fg)",
                    color: "var(--friday-bg)",
                    boxShadow: "0 4px 12px rgba(20,18,12,0.18)",
                  }}
                >
                  {p} · {n} · {pct.toFixed(0)}%
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {counts.map(({ p, n }) => (
          <span
            key={p}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-friday-surface border border-friday-border-soft rounded-full text-[10.5px] text-friday-fg-muted"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: getPhaseColor(p) }}
            />
            <span className="text-friday-fg font-medium">{p}</span>
            <span className="hidden sm:inline">{getPhaseLabel(p)}</span>
            <span className="font-mono text-[9.5px] text-friday-fg-subtle ml-0.5">
              {n}
            </span>
          </span>
        ))}
      </div>
    </StatsCard>
  );
}

// ─── Team workload ────────────────────────────────────────────────
function tier(n: number) {
  if (n >= 14) return { label: "High", bg: "#fde4dd", fg: "#9b2c1a" };
  if (n >= 9) return { label: "Steady", bg: "#fdf2dd", fg: "#9c6810" };
  return { label: "Available", bg: "#e8efe6", fg: "#3f6534" };
}

function TeamWorkload({
  data,
  users,
}: {
  data: ProjectStat[];
  users: UserStat[];
}) {
  const stats = users
    .map((u) => {
      const proj = data.filter((p) => p.userIds.includes(u.id));
      return {
        id: u.id,
        name: u.name,
        initials: u.initials,
        total: proj.length,
        doing: proj.filter(
          (p) => p.phase !== "TERMINATO" && p.workStatus !== "stuck",
        ).length,
        stuck: proj.filter(
          (p) => p.phase === "STUCK" || p.workStatus === "stuck",
        ).length,
        done: proj.filter((p) => p.phase === "TERMINATO").length,
      };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  if (stats.length === 0) return null;

  const max = Math.max(...stats.map((s) => s.total), 1);

  return (
    <StatsCard title="Team workload" subtitle="Projects assigned per person">
      <div className="grid gap-7" style={{ gridTemplateColumns: "1fr 1.2fr" }}>
        <div className="flex flex-col gap-3.5">
          {stats.map((s) => {
            const t = tier(s.total);
            const pct = (s.total / max) * 100;
            return (
              <div key={s.id}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <Avatar initials={s.initials} size={20} />
                  <span className="text-[12px] text-friday-fg font-medium">
                    {s.name}
                  </span>
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] text-friday-fg tracking-wide">
                    {s.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-friday-surface-2 overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: t.fg,
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border border-friday-border-soft rounded overflow-hidden">
          <div
            className="grid px-3 py-2 bg-friday-surface-2 border-b border-friday-border-soft text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-medium gap-2"
            style={{
              gridTemplateColumns: "1.6fr 0.7fr 0.7fr 0.7fr 0.7fr 1.1fr",
            }}
          >
            <span>Person</span>
            <span className="text-right">Total</span>
            <span className="text-right">Doing</span>
            <span className="text-right">Stuck</span>
            <span className="text-right">Done</span>
            <span className="text-right">Tier</span>
          </div>
          {stats.map((s, i) => {
            const t = tier(s.total);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => showToast(`Open profile · ${s.name}`)}
                className={cn(
                  "grid w-full px-3 py-2.5 bg-friday-bg border-0 cursor-pointer text-left text-[11.5px] text-friday-fg gap-2 items-center transition-colors duration-100 hover:bg-friday-surface",
                  i < stats.length - 1 ? "border-b border-friday-border-soft" : "",
                )}
                style={{
                  gridTemplateColumns: "1.6fr 0.7fr 0.7fr 0.7fr 0.7fr 1.1fr",
                }}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Avatar initials={s.initials} size={18} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="text-right font-mono text-[11px] text-friday-fg">
                  {s.total}
                </span>
                <span className="text-right font-mono text-[11px] text-friday-fg-muted">
                  {s.doing}
                </span>
                <span
                  className="text-right font-mono text-[11px]"
                  style={{
                    color: s.stuck > 0 ? "#9b2c1a" : "var(--friday-fg-subtle)",
                  }}
                >
                  {s.stuck}
                </span>
                <span className="text-right font-mono text-[11px] text-friday-fg-muted">
                  {s.done}
                </span>
                <span className="text-right">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: t.bg, color: t.fg }}
                  >
                    {t.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </StatsCard>
  );
}

// ─── Category donut ───────────────────────────────────────────────
function CategoryDonut({ data }: { data: ProjectStat[] }) {
  const counts = new Map<string, number>();
  data.forEach((p) => {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  });
  const cats = Array.from(counts.entries())
    .map(([c, n]) => ({ c, n }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const total = cats.reduce((a, c) => a + c.n, 0);

  const [hover, setHover] = React.useState<string | null>(null);

  if (total === 0) return null;

  const R = 70,
    r = 44,
    cx = 90,
    cy = 90;
  let acc = 0;
  const segs = cats.map(({ c, n }) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += n;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const xi1 = cx + r * Math.cos(a1);
    const yi1 = cy + r * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a0);
    const yi0 = cy + r * Math.sin(a0);
    return {
      c,
      n,
      d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${xi1} ${yi1} A${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`,
    };
  });

  const hoveredCount = hover ? cats.find((x) => x.c === hover)?.n ?? total : total;

  return (
    <StatsCard title="Category breakdown" subtitle={`${total} projects`}>
      <div
        className="grid gap-7 items-center"
        style={{ gridTemplateColumns: "180px 1fr" }}
      >
        <div
          className="relative mx-auto"
          style={{ width: 180, height: 180 }}
        >
          <svg width="180" height="180" viewBox="0 0 180 180">
            {segs.map((s) => (
              <path
                key={s.c}
                d={s.d}
                fill={colorForCategory(s.c)}
                opacity={hover && hover !== s.c ? 0.4 : 1}
                onMouseEnter={() => setHover(s.c)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: "pointer",
                  transition: "opacity 150ms ease",
                }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-display font-medium text-[28px] text-friday-fg -tracking-[0.6px] leading-none">
              {hoveredCount}
            </span>
            <span className="text-[10px] text-friday-fg-muted tracking-[0.15em] uppercase mt-1">
              {hover ?? "Total"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {cats.map((s) => (
            <div
              key={s.c}
              onMouseEnter={() => setHover(s.c)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors duration-100",
                hover === s.c ? "bg-friday-surface" : "bg-transparent",
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: colorForCategory(s.c) }}
              />
              <span className="flex-1 text-[12px] text-friday-fg">{s.c}</span>
              <span className="font-mono text-[11px] text-friday-fg-muted tracking-wide">
                {s.n}
              </span>
              <span
                className="font-mono text-[9.5px] text-friday-fg-subtle text-right"
                style={{ width: 32 }}
              >
                {((s.n / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </StatsCard>
  );
}

// ─── Geographic spread ────────────────────────────────────────────
function GeoSpread({
  data,
  country,
}: {
  data: ProjectStat[];
  country: string;
}) {
  const [hover, setHover] = React.useState<string | null>(null);

  // Aggregate by commune (or country fallback).
  const buckets = new Map<string, { x: number; y: number; n: number; country: string }>();
  data.forEach((p) => {
    const key = p.commune ?? p.country ?? "Unknown";
    if (!buckets.has(key)) {
      const coords =
        (p.commune && COMMUNE_COORDS[p.commune]) ||
        (p.country && COUNTRY_FALLBACK[p.country]) ||
        null;
      if (!coords) return;
      buckets.set(key, { ...coords, n: 0, country: p.country ?? "ALL" });
    }
    buckets.get(key)!.n += 1;
  });

  const visible = Array.from(buckets.entries())
    .map(([name, v]) => ({ name, ...v }))
    .filter((p) => country === "ALL" || p.country === country);

  return (
    <StatsCard
      title="Geographic spread"
      subtitle={`${visible.length} ${visible.length === 1 ? "location" : "locations"}`}
      noPadding
    >
      <div
        className="relative overflow-hidden"
        style={{
          height: 320,
          background:
            "radial-gradient(ellipse at 50% 35%, #f3ede0 0%, #ece6d8 55%, #ddd5c2 100%)",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0"
          style={{ opacity: 0.45 }}
        >
          <path
            d="M30 30 L60 28 L62 50 L40 56 L28 48 Z"
            fill="none"
            stroke="#a8a59d"
            strokeWidth="0.2"
            strokeDasharray="0.5 0.5"
          />
          <path
            d="M40 50 L70 45 L72 80 L48 80 Z"
            fill="none"
            stroke="#a8a59d"
            strokeWidth="0.2"
            strokeDasharray="0.5 0.5"
          />
          <path
            d="M70 30 L92 32 L92 80 L72 78 Z"
            fill="none"
            stroke="#a8a59d"
            strokeWidth="0.2"
            strokeDasharray="0.5 0.5"
          />
        </svg>
        {[
          { l: "CH", x: 47, y: 32 },
          { l: "IT", x: 58, y: 60 },
          { l: "IN", x: 80, y: 55 },
        ]
          .filter((c) => country === "ALL" || country === c.l)
          .map((c) => (
            <span
              key={c.l}
              className="absolute font-display italic font-medium text-[14px] -tracking-[0.2px] pointer-events-none"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                transform: "translate(-50%, -50%)",
                color: "rgba(20,18,12,0.32)",
              }}
            >
              {c.l}
            </span>
          ))}

        {visible.map((p) => {
          const size = 14 + Math.min(p.n, 10) * 1.6;
          const isHover = hover === p.name;
          return (
            <div
              key={p.name}
              onMouseEnter={() => setHover(p.name)}
              onMouseLeave={() => setHover(null)}
              className="absolute rounded-full bg-friday-accent text-white font-mono font-semibold tracking-wide flex items-center justify-center cursor-pointer transition-shadow duration-150"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: "translate(-50%, -50%)",
                width: size,
                height: size,
                fontSize: 9,
                border: "2px solid var(--friday-bg)",
                boxShadow: isHover
                  ? "0 4px 14px rgba(20,18,12,0.22)"
                  : "0 1px 3px rgba(20,18,12,0.20)",
              }}
            >
              {p.n}
              {isHover ? (
                <div
                  className="absolute px-2 py-1 rounded-sm text-[10.5px] font-medium whitespace-nowrap pointer-events-none tracking-wide"
                  style={{
                    bottom: "calc(100% + 8px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--friday-fg)",
                    color: "var(--friday-bg)",
                    boxShadow: "0 4px 12px rgba(20,18,12,0.18)",
                  }}
                >
                  {p.name} · {p.n}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </StatsCard>
  );
}

// ─── Empty state ──────────────────────────────────────────────────
function EmptyCountry({
  country,
  onAll,
}: {
  country: string;
  onAll: () => void;
}) {
  const meta = COUNTRIES[country] ?? COUNTRIES.ALL;
  return (
    <div className="max-w-[460px] mx-auto mt-15 p-9 bg-friday-bg border border-friday-border-soft rounded-md text-center flex flex-col items-center gap-3">
      <span className="text-[28px]">{meta.flag}</span>
      <h3 className="font-display italic font-medium text-[18px] text-friday-fg m-0 -tracking-[0.2px]">
        No projects in {country} yet.
      </h3>
      <button
        type="button"
        onClick={onAll}
        className="h-[30px] px-3.5 bg-friday-fg text-friday-bg border-0 rounded text-[12px] font-medium cursor-pointer"
      >
        View all →
      </button>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────
export function StatisticsClient({ projects, users }: StatisticsClientProps) {
  const [country, setCountry] = React.useState<string>("ALL");

  const filtered = React.useMemo(
    () =>
      country === "ALL"
        ? projects
        : projects.filter((p) => p.country === country),
    [country, projects],
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-friday-bg">
      <StatsHeader country={country} setCountry={setCountry} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div
          className="mx-auto flex flex-col gap-4"
          style={{ maxWidth: 1240, padding: "20px 28px 40px" }}
        >
          {filtered.length === 0 ? (
            <EmptyCountry country={country} onAll={() => setCountry("ALL")} />
          ) : (
            <>
              <KpiStrip data={filtered} />
              <PhaseDistribution data={filtered} />
              <TeamWorkload data={filtered} users={users} />
              <CategoryDonut data={filtered} />
              <GeoSpread data={filtered} country={country} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
