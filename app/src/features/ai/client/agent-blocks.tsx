"use client";

// Gen-UI block renderers for DBS AI responses.
//
// The agent emits { blocks: Block[] } and each block picks its own
// presentation — a count renders as a figure, a comparison as bars, a list of
// projects as rows with phase pills. The prompt carries the decision table;
// this file is the other half of that contract.
//
// Two rules hold across every renderer here.
//
// 1. Friday tokens only. Four of these blocks previously used generic shadcn
//    surfaces and raw Tailwind colours (bg-blue-100, bg-red-600, rounded-2xl)
//    while the other three used the token layer, so an answer combining them
//    looked assembled rather than designed. The hex lint rule bans raw hex but
//    not Tailwind colour utilities, which is how that drifted.
//
// 2. Links are DERIVED, never model-supplied. Every href below is built here
//    from a grounded identifier the agent resolved — a project code, a phase.
//    The model never emits a URL, so it cannot invent a destination or point
//    at something outside the workspace.

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, Circle, Info, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/ui/utils";
import { getPhaseColor, getStatusColor } from "@/ui/tokens";
import type {
  AgendaBlock,
  BarChartBlock,
  Block,
  CalloutBlock,
  PeopleBlock,
  ProjectListBlock,
  ProseBlock,
  StatCardsBlock,
  TableBlock,
} from "@/features/ai/server/agent/blocks";

/** One card surface, so the blocks stop disagreeing about radius and border. */
const SURFACE =
  "rounded-md border border-friday-border-soft bg-friday-surface overflow-hidden";

/** Row inside a surface. */
const ROW =
  "flex items-center gap-3 px-4 py-2.5 border-b border-friday-border-soft/60 last:border-0";

/** Uppercase mono micro-label, used for every secondary label in this file. */
const MICRO =
  "font-mono text-[9.5px] uppercase tracking-[0.22em] text-friday-fg-subtle";

// ── Prose ─────────────────────────────────────────────────────────────────

function ProseBlockView({ block }: { block: ProseBlock }) {
  return (
    <div className="prose prose-sm max-w-none text-sm leading-7 dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
    </div>
  );
}

// ── Stat cards ────────────────────────────────────────────────────────────
// Tiny mono label, large Cormorant italic value, small mono sub-label. Tone
// colours the value only, never the surface — the grid stays quiet and the one
// urgent number pulls the eye on its own.

const TONE_VALUE: Record<string, string> = {
  default: "text-friday-fg",
  positive: "text-friday-success-fg",
  warning: "text-friday-health-at-risk-fg",
  danger: "text-friday-error-fg",
  info: "text-friday-accent",
};

function StatCardsBlockView({ block }: { block: StatCardsBlock }) {
  const cols = Math.min(block.stats.length, 4);
  return (
    <div
      className={cn(
        "grid gap-0 rounded-md border border-friday-border-soft overflow-hidden",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
        cols >= 4 && "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {block.stats.map((stat, i) => (
        <div
          key={i}
          className={cn(
            "px-4 py-3 border-friday-border-soft",
            i > 0 && cols !== 1 && "border-l",
          )}
        >
          <p className={MICRO}>{stat.label}</p>
          <p
            className={cn(
              "font-display italic leading-none tabular-nums mt-2 text-[28px] font-medium",
              TONE_VALUE[stat.tone ?? "default"] ?? TONE_VALUE.default,
            )}
          >
            {stat.value}
          </p>
          {stat.sublabel && (
            <p className="mt-1.5 font-mono text-[10.5px] text-friday-fg-subtle truncate">
              {stat.sublabel}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────

const BAR_TONE: Record<string, string> = {
  default: "bg-friday-accent/35",
  warning: "bg-friday-health-at-risk-fg/45",
  danger: "bg-friday-error-fg/45",
};

/**
 * Horizontal bars, scaled to the largest value present.
 *
 * Horizontal because the labels are people and phase names — vertical bars
 * would rotate them. Scaled to the maximum rather than to a fixed ceiling
 * because the question is "who is highest", not "who is near some limit" we
 * have not been told.
 *
 * A single row of zeroes would divide by zero, so the denominator floors at 1.
 */
function BarChartBlockView({ block }: { block: BarChartBlock }) {
  const max = Math.max(1, ...block.bars.map((b) => b.value));
  return (
    <div className={cn(SURFACE, "px-4 py-3.5")}>
      {block.caption && <p className={cn(MICRO, "mb-3")}>{block.caption}</p>}
      <div className="space-y-2">
        {block.bars.map((bar, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="w-28 shrink-0 truncate text-[12.5px] text-friday-fg"
              title={bar.label}
            >
              {bar.label}
            </span>
            <span className="relative flex-1 h-5 rounded-sm bg-friday-surface-2">
              <motion.span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-sm",
                  BAR_TONE[bar.tone ?? "default"] ?? BAR_TONE.default,
                )}
                initial={{ width: 0 }}
                animate={{ width: `${(bar.value / max) * 100}%` }}
                // Grows once, quickly, then stops. The bar is reporting a
                // measurement, not performing.
                transition={{ duration: 0.45, delay: i * 0.04, ease: "easeOut" }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-friday-fg">
              {bar.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Project list ──────────────────────────────────────────────────────────

const WORK_STATUS_LABEL: Record<string, string> = {
  todo: "Not started",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
};

/**
 * Rows link to the project, filtered by code.
 *
 * The whole row is the link rather than a trailing arrow. An answer naming
 * three stuck projects is a place you want to go from, and making the target
 * a 14px icon is the difference between a useful answer and a readable one.
 */
function ProjectListBlockView({ block }: { block: ProjectListBlock }) {
  return (
    <div className={SURFACE}>
      {block.projects.map((p, i) => (
        <Link
          key={`${p.code}-${i}`}
          href={`/dashboard/projects?code=${encodeURIComponent(p.code)}`}
          className={cn(
            ROW,
            "group/row transition-colors hover:bg-friday-surface-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-friday-accent-ring",
          )}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: getPhaseColor(p.phase) }}
            title={`Phase: ${p.phase}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <code className="font-mono text-[10px] text-friday-fg-subtle">
                {p.code}
              </code>
              <span className="truncate text-[13.5px] font-medium text-friday-fg">
                {p.title}
              </span>
            </span>
            {p.note && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {p.note}
              </span>
            )}
          </span>
          <span className={cn(MICRO, "shrink-0 hidden sm:block")}>{p.phase}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: getStatusColor(p.workStatus) }}
            />
            <span className="text-[11px] text-muted-foreground">
              {WORK_STATUS_LABEL[p.workStatus] ?? p.workStatus}
            </span>
          </span>
          {p.teamInitials.length > 0 && (
            <span className="hidden shrink-0 items-center -space-x-1.5 sm:flex">
              {p.teamInitials.slice(0, 3).map((ini, ix) => (
                <span
                  key={ix}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-friday-surface bg-friday-surface-2 text-[9px] font-medium text-friday-fg"
                >
                  {ini}
                </span>
              ))}
              {p.teamInitials.length > 3 && (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-friday-surface bg-friday-fg px-1 text-[9px] font-medium text-friday-bg">
                  +{p.teamInitials.length - 3}
                </span>
              )}
            </span>
          )}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-friday-fg-subtle transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-friday-accent" />
        </Link>
      ))}
    </div>
  );
}

// ── People ────────────────────────────────────────────────────────────────
// Not linked. There is no per-person route to send anyone to, and a chip that
// looks clickable and goes nowhere is worse than a chip that does not.

function PeopleBlockView({ block }: { block: PeopleBlock }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.people.map((person, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-md border border-friday-border-soft bg-friday-surface px-3 py-2"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-friday-accent-soft text-[11px] font-medium text-friday-accent">
            {person.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium text-friday-fg">
              {person.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {[person.role, person.caption].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Agenda ────────────────────────────────────────────────────────────────

const PRIORITY_TONE: Record<string, string> = {
  critical: "bg-friday-error-fg",
  high: "bg-friday-health-at-risk-fg",
  medium: "bg-friday-accent",
  low: "bg-friday-fg-subtle",
};

function AgendaBlockView({ block }: { block: AgendaBlock }) {
  return (
    <div className={SURFACE}>
      {block.items.map((item, i) => {
        const d = new Date(item.date);
        const dateLabel = Number.isNaN(d.getTime())
          ? item.date
          : d.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
        const isCompleted = item.status === "completed";
        // Only the project is linkable — there is no per-agenda-item route,
        // and the project is the useful destination anyway.
        const body = (
          <>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                PRIORITY_TONE[item.priority] ?? "bg-friday-fg-subtle",
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[13.5px] text-friday-fg",
                  isCompleted && "line-through text-muted-foreground",
                )}
              >
                {item.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {dateLabel}
                {item.projectCode ? ` · ${item.projectCode}` : ""}
              </span>
            </span>
            <span className={cn(MICRO, "shrink-0")}>{item.priority}</span>
            {isCompleted ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-friday-success-fg" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-friday-fg-subtle" />
            )}
          </>
        );

        return item.projectCode ? (
          <Link
            key={i}
            href={`/dashboard/projects?code=${encodeURIComponent(item.projectCode)}`}
            className={cn(
              ROW,
              "transition-colors hover:bg-friday-surface-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-friday-accent-ring",
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={i} className={ROW}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic table (last resort) ───────────────────────────────────────────

function TableBlockView({ block }: { block: TableBlock }) {
  return (
    <div className="overflow-x-auto rounded-md border border-friday-border-soft">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {block.columns.map((col) => (
              <th
                key={col}
                className={cn(
                  MICRO,
                  "border-b border-friday-border-soft px-3 py-2 text-left font-normal",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-friday-border-soft/60 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 align-top text-friday-fg">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {block.caption && (
        <p className="border-t border-friday-border-soft px-3 py-1.5 font-mono text-[10.5px] text-friday-fg-subtle">
          {block.caption}
        </p>
      )}
    </div>
  );
}

// ── Callout ───────────────────────────────────────────────────────────────
// A left rule and tinted text rather than a filled banner. A full-bleed
// coloured box is the loudest thing this product draws, and it was being used
// for "one data-quality note".

const CALLOUT_STYLES: Record<
  string,
  { rule: string; text: string; icon: typeof Info }
> = {
  info: { rule: "border-friday-accent", text: "text-friday-accent", icon: Info },
  warning: {
    rule: "border-friday-health-at-risk-fg",
    text: "text-friday-health-at-risk-fg",
    icon: AlertTriangle,
  },
  danger: {
    rule: "border-friday-error-fg",
    text: "text-friday-error-fg",
    icon: X,
  },
  success: {
    rule: "border-friday-success-fg",
    text: "text-friday-success-fg",
    icon: Check,
  },
};

function CalloutBlockView({ block }: { block: CalloutBlock }) {
  const style = CALLOUT_STYLES[block.tone] ?? CALLOUT_STYLES.info;
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 border-l-2 bg-friday-surface py-2 pl-3.5 pr-3 text-[13px] leading-6",
        style.rule,
      )}
    >
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", style.text)} />
      <p className="text-friday-fg">{block.text}</p>
    </div>
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "prose":
      return <ProseBlockView block={block} />;
    case "stat_cards":
      return <StatCardsBlockView block={block} />;
    case "bar_chart":
      return <BarChartBlockView block={block} />;
    case "project_list":
      return <ProjectListBlockView block={block} />;
    case "people":
      return <PeopleBlockView block={block} />;
    case "agenda":
      return <AgendaBlockView block={block} />;
    case "table":
      return <TableBlockView block={block} />;
    case "callout":
      return <CalloutBlockView block={block} />;
    default:
      return null;
  }
}

/**
 * Blocks arrive together but reveal in sequence.
 *
 * A compound answer is usually a claim followed by its evidence — prose, then
 * the cards, then the list. Staggering the reveal follows that order instead
 * of dropping four surfaces at once, which reads as a page load rather than an
 * answer. Short and small: 12px of travel, 40ms apart. Anything longer and the
 * reader is waiting on an animation to read a number they have already been
 * given.
 */
export function BlocksView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: i * 0.04, ease: "easeOut" }}
        >
          <BlockRenderer block={block} />
        </motion.div>
      ))}
    </div>
  );
}
