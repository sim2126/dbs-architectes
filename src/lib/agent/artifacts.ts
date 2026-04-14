export type ArtifactKind = "table";

export interface AiArtifactTable {
  id: string;
  kind: ArtifactKind;
  sourceTool: string;
  title: string;
  description?: string;
  columns: string[];
  rows: Record<string, string>[];
  rowCount: number;
  sheetId?: string;
  isExporting?: boolean;
}

export type AiArtifact = AiArtifactTable;

export interface PersistedToolStep {
  name: string;
  label: string;
  args: Record<string, unknown>;
  status: "running" | "done";
}

interface StoredAssistantEnvelope {
  schema: "dbs-ai-message-v1";
  text: string;
  artifacts: AiArtifact[];
  steps: PersistedToolStep[];
}

const MAX_TITLE_LENGTH = 100;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  search_projects: "Projects",
  get_project_details: "Project Details",
  get_project_thread: "Project Updates",
  get_team_messages: "Team Messages",
  get_agenda: "Agenda",
  get_team_workload: "Team Workload",
  get_statistics: "Portfolio Statistics",
  get_activity_log: "Activity Log",
};

const WORK_STATUS_LABELS: Record<string, string> = {
  todo: "Not Started",
  doing: "Working On It",
  stuck: "Stuck",
  completed: "Completed",
};

const NOISE_PREFIXES = [
  "show me",
  "show",
  "list",
  "what are",
  "what is",
  "which",
  "give me",
  "tell me",
  "can you",
  "could you",
  "please",
];

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => toDisplayText(item)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.title === "string") {
      return `${record.code} - ${record.title}`;
    }
    if (typeof record.name === "string") {
      return record.name;
    }
    if (typeof record.title === "string") {
      return record.title;
    }
    if (typeof record.date === "string") {
      return record.date;
    }
    return JSON.stringify(record);
  }
  return "";
}

function sentenceCase(value: string) {
  if (!value) return value;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9/.-]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function compactTitle(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" - ")
    .slice(0, MAX_TITLE_LENGTH);
}

function cleanPrompt(prompt: string) {
  let cleaned = prompt.trim().replace(/[?!]+$/g, "");
  const lowered = cleaned.toLowerCase();
  const prefix = NOISE_PREFIXES.find((item) => lowered.startsWith(item));
  if (prefix) {
    cleaned = cleaned.slice(prefix.length).trim();
  }
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

function limitWords(text: string, maxWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function humanizeDateRange(args: Record<string, unknown>) {
  const from = typeof args.from_date === "string" ? args.from_date : "";
  const to = typeof args.to_date === "string" ? args.to_date : "";
  if (from && to) return `${from} to ${to}`;
  return from || to || "";
}

function scopeFromSearchArgs(args: Record<string, unknown>) {
  const scope = [
    typeof args.commune === "string" ? sentenceCase(args.commune) : null,
    typeof args.client === "string" ? sentenceCase(args.client) : null,
    typeof args.category === "string" ? sentenceCase(args.category) : null,
    typeof args.phase === "string" ? args.phase : null,
    typeof args.work_status === "string" ? WORK_STATUS_LABELS[args.work_status] ?? sentenceCase(args.work_status) : null,
    args.year ? String(args.year) : null,
  ].filter(Boolean) as string[];

  return scope.length > 0 ? scope.join(" - ") : "";
}

function buildTableArtifact(params: {
  sourceTool: string;
  title: string;
  description?: string;
  columns: string[];
  rows: Record<string, string>[];
  rowCount?: number;
}): AiArtifactTable {
  const rows = params.rows.map((row) =>
    Object.fromEntries(params.columns.map((column) => [column, row[column] ?? ""]))
  );

  return {
    id: makeId(params.sourceTool),
    kind: "table",
    sourceTool: params.sourceTool,
    title: params.title.slice(0, MAX_TITLE_LENGTH),
    description: params.description,
    columns: params.columns,
    rows,
    rowCount: params.rowCount ?? rows.length,
  };
}

export function generateSessionTitle(prompt: string) {
  const cleaned = cleanPrompt(prompt);
  if (!cleaned) return "New chat";
  return limitWords(sentenceCase(cleaned), 9).slice(0, 80);
}

export function serializeAssistantMessage(params: {
  text: string;
  artifacts?: AiArtifact[];
  steps?: PersistedToolStep[];
}) {
  const payload: StoredAssistantEnvelope = {
    schema: "dbs-ai-message-v1",
    text: params.text,
    artifacts: params.artifacts ?? [],
    steps: params.steps ?? [],
  };
  return JSON.stringify(payload);
}

export function parseStoredAssistantMessage(content: string) {
  try {
    const parsed = JSON.parse(content) as Partial<StoredAssistantEnvelope>;
    if (parsed && parsed.schema === "dbs-ai-message-v1") {
      return {
        text: typeof parsed.text === "string" ? parsed.text : "",
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      };
    }
  } catch {
    // Fall through to legacy plain-text messages.
  }

  return {
    text: content,
    artifacts: [] as AiArtifact[],
    steps: [] as PersistedToolStep[],
  };
}

export function buildArtifactsFromToolResult(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  userPrompt: string
): AiArtifact[] {
  if (!result || typeof result !== "object" || "error" in (result as Record<string, unknown>)) {
    return [];
  }

  const data = result as Record<string, unknown>;
  const promptLabel = cleanPrompt(userPrompt);

  switch (toolName) {
    case "search_projects": {
      const projects = Array.isArray(data.projects) ? data.projects as Record<string, unknown>[] : [];
      const title = compactTitle([
        TOOL_DISPLAY_NAMES[toolName],
        scopeFromSearchArgs(args),
      ]) || TOOL_DISPLAY_NAMES[toolName];

      return [
        buildTableArtifact({
          sourceTool: toolName,
          title,
          description: `${projects.length} project${projects.length === 1 ? "" : "s"} found`,
          columns: ["Code", "Title", "Phase", "Status", "Client", "Commune", "Next Deadline", "Team"],
          rows: projects.map((project) => ({
            Code: toDisplayText(project.code),
            Title: toDisplayText(project.title),
            Phase: toDisplayText(project.phase),
            Status: toDisplayText(project.work_status),
            Client: toDisplayText(project.client),
            Commune: toDisplayText(project.commune),
            "Next Deadline": toDisplayText(
              project.next_deadline && typeof project.next_deadline === "object"
                ? (project.next_deadline as Record<string, unknown>).date
                : ""
            ),
            Team: Array.isArray(project.team)
              ? (project.team as Record<string, unknown>[]).map((member) => toDisplayText(member.name)).filter(Boolean).join(", ")
              : "",
          })),
          rowCount: typeof data.count === "number" ? data.count : projects.length,
        }),
      ];
    }

    case "get_project_details": {
      const title = compactTitle([toDisplayText(data.code), toDisplayText(data.title)]) || TOOL_DISPLAY_NAMES[toolName];
      const team = Array.isArray(data.team) ? data.team as Record<string, unknown>[] : [];
      const upcoming = Array.isArray(data.upcoming_agenda) ? data.upcoming_agenda as Record<string, unknown>[] : [];
      const activity = Array.isArray(data.recent_activity) ? data.recent_activity as Record<string, unknown>[] : [];

      const artifacts: AiArtifact[] = [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([title, "Overview"]),
          columns: ["Field", "Value"],
          rows: [
            { Field: "Phase", Value: toDisplayText(data.phase) },
            { Field: "Status", Value: toDisplayText(data.work_status) },
            { Field: "Client", Value: toDisplayText(data.client) },
            { Field: "Commune", Value: toDisplayText(data.commune) },
            { Field: "Category", Value: toDisplayText(data.category) },
            { Field: "Billing", Value: toDisplayText(data.billing) },
            { Field: "Updated", Value: toDisplayText(data.last_updated) },
          ],
        }),
      ];

      if (team.length > 0) {
        artifacts.push(
          buildTableArtifact({
            sourceTool: toolName,
            title: compactTitle([title, "Team"]),
            columns: ["Name", "Role", "Department", "Email", "Assigned"],
            rows: team.map((member) => ({
              Name: toDisplayText(member.name),
              Role: toDisplayText(member.role),
              Department: toDisplayText(member.department),
              Email: toDisplayText(member.email),
              Assigned: toDisplayText(member.assigned_at),
            })),
          })
        );
      }

      if (upcoming.length > 0) {
        artifacts.push(
          buildTableArtifact({
            sourceTool: toolName,
            title: compactTitle([title, "Agenda"]),
            columns: ["Date", "Title", "Priority", "Status", "Type"],
            rows: upcoming.map((item) => ({
              Date: toDisplayText(item.date),
              Title: toDisplayText(item.title),
              Priority: toDisplayText(item.priority),
              Status: toDisplayText(item.status),
              Type: toDisplayText(item.type),
            })),
          })
        );
      }

      if (activity.length > 0) {
        artifacts.push(
          buildTableArtifact({
            sourceTool: toolName,
            title: compactTitle([title, "Recent Activity"]),
            columns: ["Date", "Type", "Description", "By"],
            rows: activity.map((item) => ({
              Date: toDisplayText(item.date),
              Type: toDisplayText(item.type),
              Description: toDisplayText(item.description),
              By: toDisplayText(item.by),
            })),
          })
        );
      }

      return artifacts;
    }

    case "get_project_thread": {
      const messages = Array.isArray(data.messages) ? data.messages as Record<string, unknown>[] : [];
      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([toDisplayText(data.channel), "Project Updates"]) || TOOL_DISPLAY_NAMES[toolName],
          description: `${messages.length} update${messages.length === 1 ? "" : "s"} returned`,
          columns: ["Date", "Time", "Author", "Role", "Message"],
          rows: messages.map((message) => ({
            Date: toDisplayText(message.date),
            Time: toDisplayText(message.time),
            Author: toDisplayText(message.author),
            Role: toDisplayText(message.role),
            Message: toDisplayText(message.content),
          })),
          rowCount: typeof data.message_count === "number" ? data.message_count : messages.length,
        }),
      ];
    }

    case "get_team_messages": {
      const messages = Array.isArray(data.messages) ? data.messages as Record<string, unknown>[] : [];
      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([
            TOOL_DISPLAY_NAMES[toolName],
            typeof args.channel_name === "string" ? sentenceCase(args.channel_name) : null,
            humanizeDateRange(args),
          ]) || TOOL_DISPLAY_NAMES[toolName],
          description: `${messages.length} message${messages.length === 1 ? "" : "s"} returned`,
          columns: ["Date", "Time", "Channel", "Author", "Role", "Message"],
          rows: messages.map((message) => ({
            Date: toDisplayText(message.date),
            Time: toDisplayText(message.time),
            Channel: toDisplayText(message.channel),
            Author: toDisplayText(message.author),
            Role: toDisplayText(message.role),
            Message: toDisplayText(message.content),
          })),
          rowCount: typeof data.count === "number" ? data.count : messages.length,
        }),
      ];
    }

    case "get_agenda": {
      const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : [];
      const scope = [
        typeof args.priority === "string" ? sentenceCase(args.priority) : null,
        humanizeDateRange(args),
      ].filter(Boolean).join(" - ");

      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([TOOL_DISPLAY_NAMES[toolName], scope]) || TOOL_DISPLAY_NAMES[toolName],
          description: `${items.length} agenda item${items.length === 1 ? "" : "s"} returned`,
          columns: ["Date", "Title", "Priority", "Status", "Project", "Assigned To"],
          rows: items.map((item) => ({
            Date: toDisplayText(item.date),
            Title: toDisplayText(item.title),
            Priority: toDisplayText(item.priority),
            Status: toDisplayText(item.status),
            Project: item.project && typeof item.project === "object" ? toDisplayText(item.project) : "",
            "Assigned To": toDisplayText(item.assigned_to),
          })),
          rowCount: typeof data.count === "number" ? data.count : items.length,
        }),
      ];
    }

    case "get_team_workload": {
      const workload = Array.isArray(data.workload) ? data.workload as Record<string, unknown>[] : [];
      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: TOOL_DISPLAY_NAMES[toolName],
          description: `${workload.length} team member${workload.length === 1 ? "" : "s"} with active assignments`,
          columns: ["Name", "Role", "Assigned", "Working", "Stuck", "Done", "Risk"],
          rows: workload.map((member) => ({
            Name: toDisplayText(member.name),
            Role: toDisplayText(member.role),
            Assigned: toDisplayText(member.total_assigned),
            Working: toDisplayText(member.working_on),
            Stuck: toDisplayText(member.stuck),
            Done: toDisplayText(member.done),
            Risk: toDisplayText(member.risk_flag),
          })),
          rowCount: workload.length,
        }),
      ];
    }

    case "get_statistics": {
      const summary = [
        { Metric: "Active Projects", Value: toDisplayText(data.total_active_projects) },
        { Metric: "Unassigned Projects", Value: toDisplayText(data.unassigned_projects) },
        { Metric: "Team Size", Value: toDisplayText(data.team_size) },
        { Metric: "Activity (Last 7 Days)", Value: toDisplayText(data.activity_last_7_days) },
      ];

      const phaseDistribution = Array.isArray(data.phase_distribution)
        ? data.phase_distribution as Record<string, unknown>[]
        : [];
      const statusDistribution = Array.isArray(data.work_status_distribution)
        ? data.work_status_distribution as Record<string, unknown>[]
        : [];

      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([promptLabel, "Summary"]) || "Portfolio Summary",
          columns: ["Metric", "Value"],
          rows: summary,
        }),
        buildTableArtifact({
          sourceTool: toolName,
          title: "Phase Distribution",
          columns: ["Phase", "Count"],
          rows: phaseDistribution.map((row) => ({
            Phase: toDisplayText(row.phase),
            Count: toDisplayText(row.count),
          })),
          rowCount: phaseDistribution.length,
        }),
        buildTableArtifact({
          sourceTool: toolName,
          title: "Work Status Distribution",
          columns: ["Status", "Count"],
          rows: statusDistribution.map((row) => ({
            Status: toDisplayText(row.label ?? row.status),
            Count: toDisplayText(row.count),
          })),
          rowCount: statusDistribution.length,
        }),
      ];
    }

    case "get_activity_log": {
      const events = Array.isArray(data.events) ? data.events as Record<string, unknown>[] : [];
      return [
        buildTableArtifact({
          sourceTool: toolName,
          title: compactTitle([TOOL_DISPLAY_NAMES[toolName], humanizeDateRange(args)]) || TOOL_DISPLAY_NAMES[toolName],
          description: `${events.length} event${events.length === 1 ? "" : "s"} returned`,
          columns: ["Date", "Time", "Type", "Project", "By", "Description"],
          rows: events.map((event) => ({
            Date: toDisplayText(event.date),
            Time: toDisplayText(event.time),
            Type: toDisplayText(event.type),
            Project: event.project && typeof event.project === "object" ? toDisplayText(event.project) : "",
            By: toDisplayText(event.by),
            Description: toDisplayText(event.description),
          })),
          rowCount: typeof data.count === "number" ? data.count : events.length,
        }),
      ];
    }

    default:
      return [];
  }
}
