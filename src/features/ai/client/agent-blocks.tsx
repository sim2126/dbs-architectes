"use client";

// Gen-UI block renderers for DBS GPT responses.
// The agent emits { blocks: Block[] } and the page maps each block to the
// right renderer — no more wall-of-tables in Markdown.

import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Circle, Info, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/ui/utils";
import { PHASE_COLORS } from "@/ui/utils";
import type {
  AgendaBlock,
  Block,
  CalloutBlock,
  PeopleBlock,
  ProjectListBlock,
  ProseBlock,
  StatCardsBlock,
  TableBlock,
} from "@/features/ai/server/agent/blocks";

// ── Prose ─────────────────────────────────────────────────────────────────

function ProseBlockView({ block }: { block: ProseBlock }) {
  return (
    <div className="prose prose-sm max-w-none text-sm leading-7 dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
    </div>
  );
}

// ── Stat cards ────────────────────────────────────────────────────────────

const TONE_STYLES: Record<string, string> = {
  default: "bg-card border-border",
  positive: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900",
  warning: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900",
  danger: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900",
  info: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900",
};

function StatCardsBlockView({ block }: { block: StatCardsBlock }) {
  const cols = Math.min(block.stats.length, 4);
  return (
    <div
      className={cn(
        "grid gap-3",
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
            "rounded-2xl border px-4 py-3",
            TONE_STYLES[stat.tone ?? "default"] ?? TONE_STYLES.default,
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {stat.label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          {stat.sublabel && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.sublabel}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Project list ──────────────────────────────────────────────────────────

const WORK_STATUS_DOT: Record<string, string> = {
  todo: "bg-slate-400",
  doing: "bg-amber-500",
  stuck: "bg-red-500",
  completed: "bg-emerald-500",
};

const WORK_STATUS_LABEL: Record<string, string> = {
  todo: "Not Started",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
};

function ProjectListBlockView({ block }: { block: ProjectListBlock }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {block.projects.map((p, i) => (
        <div
          key={`${p.code}-${i}`}
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-accent/30"
        >
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: PHASE_COLORS[p.phase] ?? "#94a3b8" }}
            title={`Phase: ${p.phase}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <code className="font-mono text-[10px] text-muted-foreground">{p.code}</code>
              <p className="truncate text-sm font-semibold">{p.title}</p>
            </div>
            {p.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.note}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {p.phase}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", WORK_STATUS_DOT[p.workStatus] ?? "bg-muted")} />
            <span className="text-[11px] text-muted-foreground">
              {WORK_STATUS_LABEL[p.workStatus] ?? p.workStatus}
            </span>
          </div>
          {p.teamInitials.length > 0 && (
            <div className="flex shrink-0 items-center -space-x-1.5">
              {p.teamInitials.slice(0, 3).map((ini, ix) => (
                <div
                  key={ix}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-semibold"
                >
                  {ini}
                </div>
              ))}
              {p.teamInitials.length > 3 && (
                <div className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-card bg-foreground px-1 text-[9px] font-semibold text-background">
                  +{p.teamInitials.length - 3}
                </div>
              )}
            </div>
          )}
          <Link
            href={`/dashboard/projects?code=${encodeURIComponent(p.code)}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open project"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}

// ── People ────────────────────────────────────────────────────────────────

function PeopleBlockView({ block }: { block: PeopleBlock }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.people.map((person, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
        >
          <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {person.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{person.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {person.role ?? ""}
              {person.role && person.caption ? " · " : ""}
              {person.caption ?? ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Agenda ────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};

function AgendaBlockView({ block }: { block: AgendaBlock }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {block.items.map((item, i) => {
        const d = new Date(item.date);
        const dateLabel = Number.isNaN(d.getTime())
          ? item.date
          : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const isCompleted = item.status === "completed";
        return (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
          >
            <div
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                PRIORITY_DOT[item.priority] ?? "bg-muted",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", isCompleted && "line-through text-muted-foreground")}>
                {item.title}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {dateLabel}
                {item.projectCode ? ` · ${item.projectCode}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {item.priority}
            </span>
            {isCompleted ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic table (last resort) ───────────────────────────────────────────

function TableBlockView({ block }: { block: TableBlock }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/70">
          <tr>
            {block.columns.map((col) => (
              <th
                key={col}
                className="border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {block.caption && (
        <p className="border-t border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
          {block.caption}
        </p>
      )}
    </div>
  );
}

// ── Callout ───────────────────────────────────────────────────────────────

const CALLOUT_STYLES: Record<string, { wrap: string; icon: typeof Info }> = {
  info: { wrap: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-900 dark:text-blue-100", icon: Info },
  warning: { wrap: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-100", icon: AlertTriangle },
  danger: { wrap: "bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-900 dark:text-red-100", icon: X },
  success: { wrap: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-900 dark:text-emerald-100", icon: Check },
};

function CalloutBlockView({ block }: { block: CalloutBlock }) {
  const style = CALLOUT_STYLES[block.tone] ?? CALLOUT_STYLES.info;
  const Icon = style.icon;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-6", style.wrap)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{block.text}</p>
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

export function BlocksView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
}
