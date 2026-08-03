import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const AI_SURFACES = [
  {
    name: "DBS GPT chat",
    disclosureSource: "src/app/dashboard/ai/gpt/page.tsx",
  },
  {
    name: "DBS GPT saved insights",
    disclosureSource: "src/app/dashboard/ai/gpt/page.tsx",
  },
  {
    name: "Chat agent responses",
    disclosureSource: "src/app/dashboard/ai/gpt/page.tsx",
  },
  {
    name: "Project health responses",
    disclosureSource: "src/app/dashboard/ai/gpt/page.tsx",
  },
  {
    name: "Public meeting summaries",
    disclosureSource: "src/features/calls/client/summary-renderer.tsx",
  },
  {
    name: "Chat message translations",
    disclosureSource: "src/features/chat/client/chat-client.tsx",
  },
  {
    name: "Project thread translations",
    disclosureSource: "src/features/projects/client/project-thread-panel.tsx",
  },
  {
    name: "Visual Gallery AI (feature-flagged)",
    disclosureSource: "src/app/dashboard/ai/gallery/page.tsx",
  },
  {
    name: "Planning AI (feature-flagged)",
    disclosureSource: "src/app/dashboard/ai/planning/page.tsx",
  },
] as const;

const DISCLOSURE_TEXT_NODE = />\s*AI Assistant(?:\s*·|\s*<)/u;

test("every user-facing AI surface renders the Article 50 disclosure", () => {
  assert.equal(AI_SURFACES.length, 9, "Update this audit when the AI surface inventory changes");

  for (const surface of AI_SURFACES) {
    const source = readFileSync(resolve(process.cwd(), surface.disclosureSource), "utf8");
    assert.match(source, DISCLOSURE_TEXT_NODE, `${surface.name} must render the exact text \"AI Assistant\"`);
  }
});
