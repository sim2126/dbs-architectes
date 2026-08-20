import Link from "next/link";
import { ArrowRight, Building2, Globe2, MapPin, Users } from "lucide-react";
import { cn } from "@/ui/utils";

/**
 * Public landing surface.
 *
 * Dark register — the inverse of the product's cream ground — so the
 * threshold between "outside" and "inside the workspace" is felt rather
 * than explained. Wireframe linework rather than photography: the studio
 * sells drawings, and a drawing is the honest hero.
 *
 * Numbers come from LANDING_STATS below rather than being typed into the
 * markup. The previous copy claimed "48 projects, 30 architects" long after
 * the seed changed, which is exactly how a landing page starts lying.
 */

/**
 * Figures shown in the stat row.
 *
 * These describe DEMO data, not the practice. Update them with the seed, or
 * remove the row entirely once real records land — a stale number on a
 * client's own landing page is worse than no number.
 *
 * Deliberately omitted: a founding year. Nobody has told us when DBS was
 * established and inventing one onto their own site is not acceptable.
 */
const LANDING_STATS: Array<{
  label: string;
  value: string;
  icon: typeof Building2;
}> = [
  { label: "Projects", value: "24", icon: Building2 },
  { label: "Team", value: "25 people", icon: Users },
  { label: "Offices", value: "CH · IT · IN", icon: Globe2 },
  { label: "Studios", value: "Sion · Milano · Srinagar", icon: MapPin },
];

export function LandingPage({ hasSession }: { hasSession: boolean }) {
  return (
    <div className="relative min-h-svh bg-friday-landing-bg text-friday-landing-fg overflow-hidden">
      <Linework />

      <header className="relative flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden
            className="font-display italic leading-none select-none shrink-0"
            style={{ fontSize: "32px", fontWeight: 500 }}
          >
            d
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-[0.2em] uppercase truncate">
              DBS Architectes
            </span>
            <span className="block text-xs text-friday-landing-fg-muted truncate">
              Friday · Workspace
            </span>
          </span>
        </div>

        <nav className="flex items-center gap-2.5 shrink-0">
          {hasSession ? (
            <Link href="/dashboard" className={cn(pillClass, pillSolidClass)}>
              Open workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link href="/login" className={cn(pillClass, pillSolidClass)}>
              Log in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </nav>
      </header>

      <main className="relative px-6 sm:px-10 pb-16">
        <div className="max-w-2xl pt-12 sm:pt-20">
          <span className="inline-flex items-center rounded-full border border-friday-landing-border px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-friday-landing-fg-muted">
            Sion · Milano · Srinagar
          </span>

          <h1 className="mt-7 leading-[1.02]">
            <span className="block text-4xl sm:text-6xl font-semibold tracking-[-0.02em]">
              DBS Architectes
            </span>
            <span className="block font-display italic text-4xl sm:text-6xl text-friday-landing-accent tracking-[-0.02em] mt-1">
              Welcome to Friday.
            </span>
          </h1>

          <p className="mt-6 text-sm sm:text-base text-friday-landing-fg-muted leading-relaxed max-w-xl">
            The studio&rsquo;s workspace. Projects, meetings, drawings and
            decisions in one quiet place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={hasSession ? "/dashboard" : "/login"}
              className={cn(pillClass, pillSolidClass, "px-5 py-2.5 text-sm")}
            >
              {hasSession ? "Open workspace" : "Log in"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-friday-landing-fg-subtle">
              Access is by invitation from a studio administrator.
            </span>
          </div>
        </div>

        <dl className="relative mt-16 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
          {LANDING_STATS.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-lg border border-friday-landing-border bg-friday-landing-surface px-4 py-4"
            >
              <Icon
                aria-hidden
                className="h-4 w-4 text-friday-landing-accent"
                strokeWidth={1.5}
              />
              <dt className="mt-3 text-xs text-friday-landing-fg-muted">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="relative px-6 sm:px-10 py-6 border-t border-friday-landing-border flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-friday-landing-fg-subtle">
          © DBS Architectes — Sustainable architectural, urban and landscape design
        </p>
        <p className="text-xs text-friday-landing-fg-subtle">Friday</p>
      </footer>
    </div>
  );
}

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-friday-landing-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-friday-landing-bg";

const pillSolidClass =
  "bg-friday-landing-accent text-friday-landing-bg hover:opacity-90";

/**
 * Architectural linework, drawn as SVG.
 *
 * An isometric wireframe rather than a photograph: it is what the practice
 * actually produces, it weighs nothing, and it scales to any density. Drawn
 * here rather than shipped as an asset so it re-tints from a token and needs
 * no image pipeline.
 */
function Linework() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.02" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <g
        className="text-friday-landing-fg"
        stroke="url(#fade)"
        strokeWidth="1"
        fill="none"
      >
        {/* Isometric slab stack — three floor plates and their columns. */}
        {[0, 1, 2].map((level) => {
          const y = 210 + level * 118;
          return (
            <g key={level}>
              <path d={`M760 ${y} L1000 ${y - 96} L1240 ${y} L1000 ${y + 96} Z`} />
              <path d={`M820 ${y + 24} L1000 ${y - 48} L1180 ${y + 24}`} />
            </g>
          );
        })}
        {[760, 880, 1000, 1120, 1240].map((x) => (
          <line key={x} x1={x} y1="210" x2={x} y2="446" />
        ))}

        {/* Contour sweeps, lower left — landscape design, quietly. */}
        {Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d={`M-60 ${520 + i * 22} Q ${180 + i * 26} ${430 + i * 16} ${430 + i * 34} ${700}`}
          />
        ))}
      </g>
    </svg>
  );
}
