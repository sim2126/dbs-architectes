import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Compass,
  Globe2,
  Landmark,
  Leaf,
  MapPin,
  Ruler,
  Users,
} from "lucide-react";
import { cn } from "@/ui/utils";
import { CountUp } from "@/ui/components/count-up";

/**
 * Public landing surface.
 *
 * Dark register — the inverse of the product's cream ground — so crossing
 * into the workspace is felt rather than explained.
 *
 * The hero is drawn, not photographed. An isometric building with
 * translucent slabs, a parametric contour field, and a sun-path arc: the
 * three things a sustainable practice actually produces. All SVG, so it
 * weighs nothing, stays crisp at any density, and re-tints from a token
 * instead of needing an image pipeline.
 *
 * Numbers come from LANDING_STATS rather than the markup. The previous copy
 * claimed "48 projects, 30 architects" long after the seed changed, which is
 * how a landing page starts lying.
 */

/**
 * Stat row.
 *
 * These describe DEMO data, not the practice — update with the seed, or drop
 * the row once real records land. `countTo` opts a card into the count-up.
 *
 * Deliberately no founding year: nobody has told us when DBS was
 * established, and inventing one onto their own site is not acceptable. The
 * fourth card carries their own footer tagline instead, which is true.
 */
const LANDING_STATS: Array<{
  label: string;
  value: string;
  countTo?: number;
  suffix?: string;
  icons: [typeof Building2, typeof Compass];
}> = [
  { label: "Projects",    value: "24", countTo: 24, suffix: "+", icons: [Building2, Landmark] },
  { label: "Team",        value: "25", countTo: 25, icons: [Users, Compass] },
  { label: "Offices",     value: "CH · IT · IN", icons: [Globe2, MapPin] },
  { label: "Disciplines", value: "Architecture · Urban · Landscape", icons: [Leaf, Ruler] },
];

export function LandingPage({ hasSession }: { hasSession: boolean }) {
  return (
    <div className="relative min-h-svh bg-friday-landing-bg text-friday-landing-fg overflow-hidden">
      <ContourField />
      <IsometricBuilding />
      <Vignette />

      <header className="relative flex items-center justify-between gap-4 px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-friday-landing-border bg-friday-landing-surface font-display italic leading-none select-none"
            style={{ fontSize: "24px", fontWeight: 500 }}
          >
            d
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-[0.02em] truncate">
              DBS Architectes
            </span>
            <span className="block text-xs text-friday-landing-fg-muted truncate">
              Friday · Workspace
            </span>
          </span>
        </div>

        <nav className="flex items-center gap-2.5 shrink-0">
          <Link
            href={hasSession ? "/dashboard" : "/login"}
            className={cn(pillClass, pillOutlineClass)}
          >
            {hasSession ? "Open workspace" : "Log in"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <main className="relative px-6 sm:px-10 pb-14">
        <div className="max-w-2xl pt-10 sm:pt-16">
          <span className="inline-flex items-center rounded-full border border-friday-landing-border bg-friday-landing-surface px-3.5 py-1.5 text-[11px] tracking-[0.2em] uppercase text-friday-landing-fg-muted">
            Sion · Milano · Srinagar
          </span>

          <h1 className="mt-7 leading-[1.0]">
            <span className="block text-[2.6rem] sm:text-[4.2rem] font-semibold tracking-[-0.03em]">
              DBS Architectes
            </span>
            <span className="block font-display italic text-[2.6rem] sm:text-[4.2rem] text-friday-landing-accent tracking-[-0.025em] mt-0.5">
              Welcome to Friday.
            </span>
          </h1>

          <p className="mt-6 text-sm sm:text-[15px] text-friday-landing-fg-muted leading-[1.7] max-w-lg">
            Your workspace for better task management and efficiency.
            <br className="hidden sm:block" />
            Built for the studio — projects, meetings, drawings and decisions
            in one quiet place.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={hasSession ? "/dashboard" : "/login"}
              className={cn(pillClass, pillOutlineClass, "px-5 py-2.5 text-sm")}
            >
              {hasSession ? "Open workspace" : "Log in"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-friday-landing-fg-subtle max-w-xs leading-relaxed">
              Access is by invitation from a studio administrator.
            </span>
          </div>
        </div>

        <dl className="relative mt-14 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl">
          {LANDING_STATS.map(({ label, value, countTo, suffix, icons }) => {
            const [IconA, IconB] = icons;
            return (
              <div
                key={label}
                className="rounded-xl border border-friday-landing-border bg-friday-landing-surface px-5 py-5 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <IconA
                    aria-hidden
                    className="h-6 w-6 text-friday-landing-accent"
                    strokeWidth={1.25}
                  />
                  <IconB
                    aria-hidden
                    className="h-6 w-6 text-friday-landing-accent/70"
                    strokeWidth={1.25}
                  />
                </div>
                <dt className="mt-5 text-xs text-friday-landing-fg-muted">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tracking-[-0.01em]">
                  {countTo !== undefined ? (
                    <CountUp to={countTo} suffix={suffix} />
                  ) : (
                    value
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </main>

      <footer className="relative px-6 sm:px-10 py-5 border-t border-friday-landing-border flex flex-wrap items-center justify-between gap-2">
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

const pillOutlineClass =
  "border border-friday-landing-accent/50 text-friday-landing-accent " +
  "hover:bg-friday-landing-accent-soft";

/**
 * Radial vignette.
 *
 * Darkens the corners so the headline sits in the brightest part of the
 * frame. Pure CSS gradient rather than an image — one element, no request.
 */
function Vignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(120% 90% at 45% 30%, transparent 0%, transparent 45%, rgba(0,0,0,0.55) 100%)",
      }}
    />
  );
}

/**
 * Isometric building — translucent slabs over wireframe edges.
 *
 * Three floor plates in true isometric projection (2:1 rise), each with a
 * faint glazed face so it reads as a building rather than a diagram, plus
 * the columns that carry them and a sun-path arc. The arc is the
 * sustainability cue: solar orientation is the first move in a passive
 * design, and it is a quieter signal than a leaf icon.
 */
function IsometricBuilding() {
  const cx = 1000;
  const halfW = 250;
  const halfH = 125;
  const levels = [200, 320, 440];

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute right-[-6%] top-[6%] hidden h-[86%] w-[62%] lg:block"
      viewBox="600 80 800 620"
      fill="none"
      style={{ color: "var(--friday-landing-fg)" }}
    >
      <defs>
        <linearGradient id="glaze" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.055" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.012" />
        </linearGradient>
      </defs>

      {/* Sun path — the passive-design cue. */}
      <path
        d={`M ${cx - 380} 470 A 380 300 0 0 1 ${cx + 380} 470`}
        stroke="var(--friday-landing-line)"
        strokeWidth="1"
        strokeDasharray="3 9"
      />
      <circle cx={cx + 250} cy={250} r="5" fill="var(--friday-landing-accent)" opacity="0.55" />

      {levels.map((y, i) => (
        <g key={y}>
          {/* Slab face, glazed. */}
          <path
            d={`M ${cx - halfW} ${y} L ${cx} ${y - halfH} L ${cx + halfW} ${y} L ${cx} ${y + halfH} Z`}
            fill="url(#glaze)"
            stroke="var(--friday-landing-line-cool)"
            strokeWidth="1"
          />
          {/* Internal partition lines — a floor plan, hinted. */}
          <path
            d={`M ${cx - halfW / 2} ${y + halfH / 2} L ${cx + halfW / 2} ${y - halfH / 2}`}
            stroke="var(--friday-landing-line-cool)"
            strokeWidth="0.6"
          />
          {i === 1 && (
            <path
              d={`M ${cx - halfW / 2} ${y - halfH / 2} L ${cx + halfW / 2} ${y + halfH / 2}`}
              stroke="var(--friday-landing-line-cool)"
              strokeWidth="0.6"
            />
          )}
        </g>
      ))}

      {/* Columns, carrying the plates. */}
      {[-halfW, -halfW / 2, 0, halfW / 2, halfW].map((dx) => (
        <line
          key={dx}
          x1={cx + dx}
          y1={dx === 0 ? 200 - halfH : 200}
          x2={cx + dx}
          y2={dx === 0 ? 440 + halfH : 440}
          stroke="var(--friday-landing-line-cool)"
          strokeWidth="0.8"
        />
      ))}

      {/* Ground plane. */}
      <path
        d={`M ${cx - halfW - 60} 560 L ${cx} ${560 - halfH - 30} L ${cx + halfW + 60} 560 L ${cx} ${560 + halfH + 30} Z`}
        stroke="var(--friday-landing-line-cool)"
        strokeWidth="0.6"
        strokeDasharray="4 6"
      />
    </svg>
  );
}

/**
 * Parametric contour field, lower left.
 *
 * Topographic sweeps — the surveyed site a project starts from. Generated
 * from a quadratic family rather than hand-drawn so the spacing stays even,
 * and kept at low contrast because it is texture, not content.
 */
function ContourField() {
  const lines = 26;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-[-10%] bottom-[-14%] h-[85%] w-[68%]"
      viewBox="0 0 700 700"
      fill="none"
    >
      <g stroke="var(--friday-landing-line)" strokeWidth="0.7">
        {Array.from({ length: lines }).map((_, i) => {
          const spread = i * 15;
          return (
            <path
              key={i}
              d={`M ${-40 + i * 4} ${700 - spread * 0.55}
                  Q ${180 + spread * 0.7} ${380 - spread * 0.28}
                    ${520 + spread * 0.5} ${700}`}
            />
          );
        })}
      </g>
      {/* A second family at a different phase, so the field reads as
          contours rather than a fan. */}
      <g stroke="var(--friday-landing-line)" strokeWidth="0.5" opacity="0.6">
        {Array.from({ length: 14 }).map((_, i) => {
          const spread = i * 26;
          return (
            <path
              key={i}
              d={`M ${-60} ${240 + spread * 0.9}
                  Q ${260 + spread * 0.5} ${180 + spread * 0.5}
                    ${700} ${520 + spread * 0.3}`}
            />
          );
        })}
      </g>
    </svg>
  );
}
