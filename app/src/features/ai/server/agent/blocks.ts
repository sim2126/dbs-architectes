/**
 * Gen-UI response blocks for DBS AI.
 *
 * The agent emits a typed envelope { blocks: Block[] } instead of free-form
 * Markdown. Each block is rendered by a dedicated React component, so the
 * model can pick the right shape for each response (short answer, list of
 * projects, big stat, team chips, etc.) instead of defaulting to a table.
 *
 * The JSON schema below is passed to OpenAI's Structured Outputs feature
 * (`response_format: { type: "json_schema", strict: true }`), which guarantees
 * the model's output parses as one of these types.
 */

import { z } from "zod";

// ── TypeScript block types ────────────────────────────────────────────────

export type ProseBlock = {
  type: "prose";
  /** Short markdown text. For 1-3 sentence answers. No tables inside. */
  text: string;
};

export type StatCardsBlock = {
  type: "stat_cards";
  stats: Array<{
    label: string;
    value: string;
    /** Optional subtitle like "70% of portfolio". */
    sublabel?: string | null;
    /** Visual accent: "default" | "positive" | "warning" | "danger" | "info". */
    tone?: "default" | "positive" | "warning" | "danger" | "info" | null;
  }>;
};

export type ProjectListBlock = {
  type: "project_list";
  projects: Array<{
    code: string;
    title: string;
    phase: string;
    workStatus: string;
    /** Team initials e.g. ["GS", "LDB"]. Empty array if none assigned. */
    teamInitials: string[];
    /** Optional inline note — next deadline, stuck reason, etc. */
    note?: string | null;
  }>;
};

export type PeopleBlock = {
  type: "people";
  people: Array<{
    name: string;
    initials: string;
    role?: string | null;
    email?: string | null;
    /** Optional caption — e.g. "Architect on [DBS-2025-001]". */
    caption?: string | null;
  }>;
};

export type AgendaBlock = {
  type: "agenda";
  items: Array<{
    title: string;
    /** ISO date string. */
    date: string;
    priority: "critical" | "high" | "medium" | "low";
    status: "pending" | "in_progress" | "completed";
    projectCode?: string | null;
  }>;
};

export type TableBlock = {
  type: "table";
  columns: string[];
  /** Each row is an array of cell strings matching columns length. */
  rows: string[][];
  caption?: string | null;
};

export type CalloutBlock = {
  type: "callout";
  tone: "info" | "warning" | "danger" | "success";
  text: string;
};

/**
 * A bar chart, for questions about distribution across named things.
 *
 * "Who is overloaded?" and "how is the portfolio split by phase?" are
 * comparison questions. stat_cards answers them with numbers you then have to
 * compare in your head; a table answers them with rows you have to scan. A
 * bar makes the comparison the thing you see first.
 *
 * Bars are horizontal on purpose: the labels are people and phase names, and
 * horizontal bars give long labels room without rotating them.
 *
 * Deliberately not a charting library. MEMORY.md rules ECharts out of the DBS
 * build, and a bar is a div with a width — the dependency would buy nothing.
 */
export type BarChartBlock = {
  type: "bar_chart";
  /** What the bars measure, e.g. "Active projects per person". */
  caption?: string | null;
  bars: Array<{
    label: string;
    /** Non-negative. The renderer scales to the largest value present. */
    value: number;
    /** Marks an outlier — the person over capacity, the phase at risk. */
    tone?: "default" | "warning" | "danger" | null;
  }>;
};

export type Block =
  | ProseBlock
  | StatCardsBlock
  | ProjectListBlock
  | PeopleBlock
  | AgendaBlock
  | TableBlock
  | CalloutBlock
  | BarChartBlock;

export type AgentResponse = {
  blocks: Block[];
  userIds: string[];
  projectIds: string[];
  phases: string[];
  dates: string[];
};

const nullableOptionalString = z.string().nullable().optional();

const agentResponseRuntimeSchema = z.object({
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("prose"), text: z.string() }).strict(),
    z.object({
      type: z.literal("stat_cards"),
      stats: z.array(z.object({
        label: z.string(),
        value: z.string(),
        sublabel: nullableOptionalString,
        tone: z.enum(["default", "positive", "warning", "danger", "info"])
          .nullable()
          .optional(),
      }).strict()),
    }).strict(),
    z.object({
      type: z.literal("project_list"),
      projects: z.array(z.object({
        code: z.string(),
        title: z.string(),
        phase: z.string(),
        workStatus: z.string(),
        teamInitials: z.array(z.string()),
        note: nullableOptionalString,
      }).strict()),
    }).strict(),
    z.object({
      type: z.literal("people"),
      people: z.array(z.object({
        name: z.string(),
        initials: z.string(),
        role: nullableOptionalString,
        email: nullableOptionalString,
        caption: nullableOptionalString,
      }).strict()),
    }).strict(),
    z.object({
      type: z.literal("agenda"),
      items: z.array(z.object({
        title: z.string(),
        date: z.string(),
        priority: z.enum(["critical", "high", "medium", "low"]),
        status: z.enum(["pending", "in_progress", "completed"]),
        projectCode: nullableOptionalString,
      }).strict()),
    }).strict(),
    z.object({
      type: z.literal("table"),
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      caption: nullableOptionalString,
    }).strict(),
    z.object({
      type: z.literal("callout"),
      tone: z.enum(["info", "warning", "danger", "success"]),
      text: z.string(),
    }).strict(),
    z.object({
      type: z.literal("bar_chart"),
      caption: nullableOptionalString,
      bars: z.array(z.object({
        label: z.string(),
        // Negative values would invert the bar; clamped at the boundary
        // rather than trusted, because this value comes from a model.
        value: z.number().nonnegative(),
        tone: z.enum(["default", "warning", "danger"]).nullable().optional(),
      }).strict()),
    }).strict(),
  ])),
  userIds: z.array(z.string()),
  projectIds: z.array(z.string()),
  phases: z.array(z.string()),
  dates: z.array(z.string()),
}).strict();

// ── JSON Schema for OpenAI Structured Outputs ──────────────────────────────
// Hand-written rather than generated because OpenAI's strict mode has
// peculiarities: every object needs `additionalProperties: false` and
// `required` listing ALL keys, and discriminated unions work via `anyOf`.

export const AGENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks", "userIds", "projectIds", "phases", "dates"],
  properties: {
    blocks: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "text"],
            properties: {
              type: { type: "string", const: "prose" },
              text: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "stats"],
            properties: {
              type: { type: "string", const: "stat_cards" },
              stats: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "value", "sublabel", "tone"],
                  properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                    sublabel: { type: ["string", "null"] },
                    tone: {
                      type: ["string", "null"],
                      enum: ["default", "positive", "warning", "danger", "info", null],
                    },
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "projects"],
            properties: {
              type: { type: "string", const: "project_list" },
              projects: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["code", "title", "phase", "workStatus", "teamInitials", "note"],
                  properties: {
                    code: { type: "string" },
                    title: { type: "string" },
                    phase: { type: "string" },
                    workStatus: { type: "string" },
                    teamInitials: { type: "array", items: { type: "string" } },
                    note: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "people"],
            properties: {
              type: { type: "string", const: "people" },
              people: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "initials", "role", "email", "caption"],
                  properties: {
                    name: { type: "string" },
                    initials: { type: "string" },
                    role: { type: ["string", "null"] },
                    email: { type: ["string", "null"] },
                    caption: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "items"],
            properties: {
              type: { type: "string", const: "agenda" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "date", "priority", "status", "projectCode"],
                  properties: {
                    title: { type: "string" },
                    date: { type: "string" },
                    priority: {
                      type: "string",
                      enum: ["critical", "high", "medium", "low"],
                    },
                    status: {
                      type: "string",
                      enum: ["pending", "in_progress", "completed"],
                    },
                    projectCode: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "columns", "rows", "caption"],
            properties: {
              type: { type: "string", const: "table" },
              columns: { type: "array", items: { type: "string" } },
              rows: {
                type: "array",
                items: { type: "array", items: { type: "string" } },
              },
              caption: { type: ["string", "null"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "tone", "text"],
            properties: {
              type: { type: "string", const: "callout" },
              tone: { type: "string", enum: ["info", "warning", "danger", "success"] },
              text: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            // Strict mode requires every key in `required`, including the
            // nullable ones — hence caption and tone listed here.
            required: ["type", "caption", "bars"],
            properties: {
              type: { type: "string", const: "bar_chart" },
              caption: { type: ["string", "null"] },
              bars: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "value", "tone"],
                  properties: {
                    label: { type: "string" },
                    value: { type: "number" },
                    tone: {
                      type: ["string", "null"],
                      enum: ["default", "warning", "danger", null],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
    userIds: { type: "array", items: { type: "string" } },
    projectIds: { type: "array", items: { type: "string" } },
    phases: { type: "array", items: { type: "string" } },
    dates: { type: "array", items: { type: "string" } },
  },
} as const;

/** Helper: safe parse a model JSON string into AgentResponse. */
export function parseAgentResponse(jsonText: string): AgentResponse | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const result = agentResponseRuntimeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Plain-text memory/copy fallback derived from the validated block envelope. */
export function blocksToPlainText(blocks: readonly Block[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "prose":
      case "callout":
        return block.text;
      case "stat_cards":
        return block.stats
          .map((stat) => `${stat.label}: ${stat.value}${stat.sublabel ? ` (${stat.sublabel})` : ""}`)
          .join("\n");
      case "project_list":
        return block.projects
          .map((project) =>
            `${project.code} — ${project.title}: ${project.phase}, ${project.workStatus}` +
            (project.note ? `; ${project.note}` : ""),
          )
          .join("\n");
      case "people":
        return block.people
          .map((person) => [person.name, person.role, person.caption].filter(Boolean).join(" — "))
          .join("\n");
      case "agenda":
        return block.items
          .map((item) => `${item.date}: ${item.title} (${item.status})`)
          .join("\n");
      case "table":
        return [
          block.caption,
          block.columns.join(" | "),
          ...block.rows.map((row) => row.join(" | ")),
        ].filter(Boolean).join("\n");
      case "bar_chart":
        // The plain-text form is what gets persisted and what a degraded
        // surface shows, so the numbers must survive losing the bars.
        return [
          block.caption,
          ...block.bars.map((bar) => `${bar.label}: ${bar.value}`),
        ].filter(Boolean).join("\n");
    }
  }).filter(Boolean).join("\n\n");
}
