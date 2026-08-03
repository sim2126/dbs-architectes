import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedContext } from "./grounding";
import { validateGrounding } from "./validation";

const resolved: ResolvedContext = {
  surface: "meeting-summary",
  resolvedAt: "2026-08-03T09:00:00.000Z",
  users: [{
    kind: "user",
    id: "user-giulio",
    name: "Giulio Sovran",
    email: "giulio.sovran@dbsarc.com",
    aliases: ["Giulio Sovran", "Giulio", "GS"],
  }],
  projects: [{
    kind: "project",
    id: "project-saillen",
    code: "DBS-2025-001",
    title: "Le Saillen",
    phase: "ETUDE/AP",
    client: "DBS",
    commune: "Sion",
    aliases: ["DBS-2025-001", "Le Saillen"],
  }],
  phases: [{ kind: "phase", value: "ETUDE/AP", aliases: ["ETUDE / AP"] }],
  dates: [{ kind: "date", source: "tomorrow", isoDate: "2026-08-04", precision: "day" }],
  recentMeetingDecisions: [],
  unresolved: [],
};

test("accepts nested entity mentions present in resolved context", () => {
  const output = {
    action_items: [{
      owner_user_id: "user-giulio",
      owner_name: "Giulio Sovran",
      project_link: "DBS-2025-001",
      due_date: "2026-08-04",
    }],
    projects: [{ code: "DBS-2025-001", title: "Le Saillen", phase: "ETUDE/AP" }],
  };

  const result = validateGrounding(output, resolved);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.notEqual(result.output, output);
  assert.deepEqual(result.output, output);
});

test("flags unresolved names and dates with warning severity", () => {
  const result = validateGrounding(
    { owner_name: "Invented Person", due_date: "2026-09-01" },
    resolved,
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues.map(({ kind, severity, action }) => ({ kind, severity, action })), [
    { kind: "user", severity: "warning", action: "flagged" },
    { kind: "date", severity: "warning", action: "flagged" },
  ]);
});

test("strips unresolved IDs, project codes and phases in strict mode", () => {
  const output = {
    owner_user_id: "user-invented",
    assignee_id: "user-invented",
    project_code: "DBS-2099-999",
    project_title: "Invented Tower",
    phase: "IMAGINARY",
  };
  const result = validateGrounding(output, resolved, { mode: "strip" });

  assert.equal(result.valid, false);
  assert.deepEqual(result.output, {
    owner_user_id: null,
    assignee_id: null,
    project_code: null,
    project_title: null,
    phase: null,
  });
  assert.equal(result.issues.every((issue) => issue.action === "stripped"), true);
});

test("flags unknown DBS codes in prose without deleting the whole answer", () => {
  const result = validateGrounding(
    { text: "Le Saillen is linked to DBS-2099-999." },
    resolved,
    { mode: "strip" },
  );

  assert.equal(result.valid, false);
  assert.equal(result.output.text, "Le Saillen is linked to DBS-2099-999.");
  assert.deepEqual(result.issues, [{
    kind: "project",
    path: "$.text",
    value: "DBS-2099-999",
    severity: "error",
    action: "flagged",
    reason: "not-in-resolved-context",
  }]);
});

test("does not mistake a dbsarc.com email address for a project code", () => {
  const result = validateGrounding(
    { text: "Contact giulio.sovran@dbsarc.com about the review." },
    resolved,
  );

  assert.deepEqual(result.issues, []);
});

test("uses table column semantics when cells have no field names", () => {
  const result = validateGrounding({
    type: "table",
    columns: ["Project code", "Phase", "Owner"],
    rows: [["DBS-2025-001", "ETUDE/AP", "Giulio Sovran"], ["DBS-404", "VOID", "Nobody"]],
  }, resolved);

  assert.equal(result.issues.length, 3);
  assert.deepEqual(result.issues.map(({ kind }) => kind), ["project", "phase", "user"]);
});
