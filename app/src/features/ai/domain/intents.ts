/**
 * Intent presets for the assistant panel.
 *
 * Each chip prefills the composer with a prompt shaped for that intent. They
 * are NOT separate models, separate endpoints or separate prompts with their
 * own ungrounded behaviour — every one routes through /api/agent, which
 * carries the grounding contract, ID resolution and post-generation
 * validation. A chip that bypassed that would be a second, weaker AI path.
 *
 * Why presets rather than seven subsystems: the value of a chip is removing
 * the blank-page problem, not adding a capability. Someone who does not know
 * what to ask an assistant is the normal case, and a good starting sentence
 * solves it. Artefact generation — slides, formatted reports — is a genuinely
 * separate build with its own grounding contract and eval, and is not here.
 *
 * The prompts are deliberately written as a person would speak, because they
 * land in the composer where the user can edit them before sending.
 */

export type IntentPreset = {
  id: string;
  label: string;
  /** Rendered icon. Kept as a token, not a component, so this stays pure. */
  icon: "search" | "arrow";
  /** Prefilled into the composer, editable before sending. */
  prompt: string;
};

export const INTENT_PRESETS: readonly IntentPreset[] = [
  {
    id: "find",
    label: "Find",
    icon: "search",
    prompt: "Find ",
  },
  {
    id: "research",
    label: "Research",
    icon: "arrow",
    prompt: "Summarise everything we know about ",
  },
  {
    id: "analyse",
    label: "Analyse",
    icon: "arrow",
    prompt:
      "Which of my projects are at risk, and what is the evidence for each?",
  },
  {
    id: "prioritise",
    label: "Prioritise",
    icon: "arrow",
    prompt:
      "What should I deal with first today, and why in that order?",
  },
  {
    id: "catch-up",
    label: "Catch up",
    icon: "arrow",
    prompt: "What changed across my projects since last week?",
  },
  {
    id: "overdue",
    label: "Overdue",
    icon: "arrow",
    prompt: "What is overdue on my projects, and who owns each item?",
  },
];
