import type {
  AiSurface,
  GroundingContract,
  GroundingSubject,
} from "./grounding";

export type AgentGroundingSurface = Extract<
  AiSurface,
  "dbs-gpt" | "chat-agent" | "project-health"
>;

const PROJECT_HEALTH_PROMPT =
  /\b(?:portfolio|project) health\b|\bhealth (?:overview|report|summary)\b|\b(?:at[- ]risk|blocked|stuck) projects?\b|\bportfolio (?:statistics|summary)\b|\bbreakdown by phase\b|\bhow many projects\b|\bpercentage of\b|\bproject statistics\b/i;

export function surfaceForAgentRequest(
  input: string,
  hasPersistedSession: boolean,
): AgentGroundingSurface {
  if (PROJECT_HEALTH_PROMPT.test(input)) return "project-health";
  return hasPersistedSession ? "dbs-gpt" : "chat-agent";
}

interface AgentGroundingInput {
  surface: AgentGroundingSurface;
  subject: GroundingSubject;
  input: string;
}

interface MeetingSummaryGroundingInput {
  subject: GroundingSubject;
  input: string;
  mode: "simple" | "detailed";
  projectId?: string | null;
}

interface TranslationGroundingInput {
  subject: GroundingSubject;
  input: string;
}

/** The single grounding declaration shared by the DBS GPT and agent entry points. */
export function buildAgentGroundingContract({
  surface,
  subject,
  input,
}: AgentGroundingInput): GroundingContract {
  return {
    surface,
    subject,
    input,
    users: { scope: "workspace" },
    projects: { scope: "workspace" },
    phases: { scope: "mentions" },
    dates: { scope: "mentions" },
    recentMeetingDecisions: { scope: "recent", limit: 10 },
  };
}

/** The meeting contract optionally scopes recent decisions to its linked project. */
export function buildMeetingSummaryGroundingContract({
  subject,
  input,
  mode,
  projectId,
}: MeetingSummaryGroundingInput): GroundingContract {
  return {
    surface: "meeting-summary",
    subject,
    input,
    users: { scope: "workspace" },
    projects: { scope: "workspace" },
    phases: { scope: "mentions" },
    dates: { scope: "mentions" },
    recentMeetingDecisions: mode === "detailed" && projectId
      ? { scope: "recent", projectIds: [projectId], limit: 20 }
      : { scope: "none" },
  };
}

/** Translation resolves only the entities actually present in the source text. */
export function buildTranslationGroundingContract({
  subject,
  input,
}: TranslationGroundingInput): GroundingContract {
  return {
    surface: "translation",
    subject,
    input,
    users: { scope: "mentions" },
    projects: { scope: "mentions" },
    phases: { scope: "mentions" },
    dates: { scope: "mentions" },
    recentMeetingDecisions: { scope: "none" },
  };
}
