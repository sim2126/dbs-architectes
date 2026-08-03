import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolveEntireProjectPortfolio,
  extendGroundingWithTrustedToolResult,
  hasExactResolvedEntityIds,
  resolveGrounding,
  type GroundingContract,
  type GroundingDataSource,
} from "./grounding";

test("portfolio grounding access matches agent-tool authorisation", () => {
  assert.equal(canResolveEntireProjectPortfolio("admin"), true);
  assert.equal(canResolveEntireProjectPortfolio("super_admin"), true);
  assert.equal(canResolveEntireProjectPortfolio("director"), false);
  assert.equal(canResolveEntireProjectPortfolio("manager"), false);
  assert.equal(canResolveEntireProjectPortfolio("project_manager"), false);
  assert.equal(canResolveEntireProjectPortfolio("employee"), false);
});

const source: GroundingDataSource = {
  async listUsers() {
    return [
      { id: "user-giulio", name: "Giulio Sovran", email: "giulio.sovran@dbsarc.com", initials: "GS" },
      { id: "user-luigi", name: "Luigi Di Berardino", email: "luigi.diberardino@dbsarc.com", initials: "LD" },
    ];
  },
  async listProjects() {
    return [
      {
        id: "project-saillen",
        code: "DBS-2025-001",
        title: "Le Saillen",
        phase: "ETUDE/AP",
        client: "DBS",
        commune: "Sion",
      },
    ];
  },
  async listMeetingMemories() {
    return [{
      id: "memory-saillen",
      projectId: "project-saillen",
      keyDecisions: [{ what: "Retain the stone facade", who: "Giulio Sovran", at: "2026-07-31" }],
      updatedAt: new Date("2026-07-31T12:00:00.000Z"),
    }];
  },
};

const contract: GroundingContract = {
  surface: "meeting-summary",
  subject: { userId: "user-giulio", role: "director" },
  input: "Giulio will review Le Saillen in ETUDE / AP tomorrow.",
  users: { scope: "mentions" },
  projects: { scope: "mentions" },
  phases: { scope: "mentions" },
  dates: { scope: "mentions" },
  recentMeetingDecisions: { scope: "recent", limit: 5 },
};

test("resolves DBS entities, canonical phases, dates and meeting decisions", async () => {
  const resolved = await resolveGrounding(contract, {
    dataSource: source,
    now: new Date("2026-08-03T09:00:00.000Z"),
  });

  assert.deepEqual(resolved.users.map(({ id }) => id), ["user-giulio"]);
  assert.deepEqual(resolved.projects.map(({ id }) => id), ["project-saillen"]);
  assert.deepEqual(resolved.phases.map(({ value }) => value), ["ETUDE/AP"]);
  assert.deepEqual(resolved.dates.map(({ isoDate }) => isoDate), ["2026-08-04"]);
  assert.equal(resolved.recentMeetingDecisions[0]?.text, "Retain the stone facade");
  assert.equal(resolved.recentMeetingDecisions[0]?.decidedBy, "user-giulio");
  assert.deepEqual(resolved.unresolved, []);
});

test("records missing explicit IDs instead of silently dropping them", async () => {
  const resolved = await resolveGrounding(
    {
      ...contract,
      users: { scope: "ids", ids: ["missing-user"] },
      projects: { scope: "ids", ids: ["missing-project"] },
      phases: { scope: "none" },
      dates: { scope: "none" },
      recentMeetingDecisions: { scope: "none" },
    },
    { dataSource: source },
  );

  assert.deepEqual(resolved.users, []);
  assert.deepEqual(resolved.projects, []);
  assert.deepEqual(
    resolved.unresolved.map(({ kind, reference }) => [kind, reference]),
    [["user", "missing-user"], ["project", "missing-project"]],
  );
});

test("does not load meeting memory for a project outside the scoped project set", async () => {
  let requestedMemoryIds: readonly string[] = [];
  const scopedSource: GroundingDataSource = {
    ...source,
    async listMeetingMemories(projectIds) {
      requestedMemoryIds = projectIds;
      return [];
    },
  };

  const resolved = await resolveGrounding(
    {
      ...contract,
      projects: { scope: "none" },
      recentMeetingDecisions: {
        scope: "recent",
        projectIds: ["project-outside-access"],
        limit: 5,
      },
    },
    { dataSource: scopedSource },
  );

  assert.deepEqual(requestedMemoryIds, []);
  assert.deepEqual(resolved.unresolved, [{
    kind: "meeting-decision",
    reference: "project-outside-access",
    reason: "not-found",
  }]);
});

test("workspace validation scope loads memory only for projects mentioned in the input", async () => {
  let requestedMemoryIds: readonly string[] = [];
  const trackingSource: GroundingDataSource = {
    ...source,
    async listMeetingMemories(projectIds) {
      requestedMemoryIds = projectIds;
      return source.listMeetingMemories(projectIds);
    },
  };

  await resolveGrounding(
    {
      ...contract,
      projects: { scope: "workspace" },
    },
    { dataSource: trackingSource },
  );

  assert.deepEqual(requestedMemoryIds, ["project-saillen"]);
});

test("requires complete exact entity citations for mention-scoped output", async () => {
  const resolved = await resolveGrounding(contract, { dataSource: source });

  assert.equal(hasExactResolvedEntityIds(resolved, {
    userIds: ["user-giulio", "user-giulio"],
    projectIds: ["project-saillen"],
  }), true);
  assert.equal(hasExactResolvedEntityIds(resolved, {
    userIds: [],
    projectIds: ["project-saillen"],
  }), false);
  assert.equal(hasExactResolvedEntityIds(resolved, {
    userIds: ["user-giulio"],
    projectIds: ["project-saillen", "project-invented"],
  }), false);
});

test("rejects non-canonical explicit phase values", async () => {
  const resolved = await resolveGrounding({
    ...contract,
    users: { scope: "none" },
    projects: { scope: "none" },
    phases: { scope: "values", values: ["ETUDE / AP", "INVENTED"] },
    dates: { scope: "none" },
    recentMeetingDecisions: { scope: "none" },
  }, { dataSource: source });

  assert.deepEqual(resolved.phases.map(({ value }) => value), ["ETUDE/AP"]);
  assert.deepEqual(resolved.unresolved, [{
    kind: "phase",
    reference: "INVENTED",
    reason: "invalid",
  }]);
});

test("extends grounding dates only from trusted tool results", async () => {
  const resolved = await resolveGrounding({
    ...contract,
    dates: { scope: "none" },
    recentMeetingDecisions: { scope: "none" },
  }, { dataSource: source });

  const extended = extendGroundingWithTrustedToolResult(resolved, {
    deadline: "2026-08-19T10:00:00.000Z",
    invalid: "2026-02-31",
  });

  assert.deepEqual(extended.dates.map(({ isoDate }) => isoDate), ["2026-08-19"]);
  assert.deepEqual(extended.unresolved.at(-1), {
    kind: "date",
    reference: "2026-02-31",
    reason: "invalid",
  });
  assert.deepEqual(resolved.dates, []);
});

test("does not resolve ambiguous initials and records the ambiguity", async () => {
  const ambiguousSource: GroundingDataSource = {
    ...source,
    async listUsers() {
      return [
        { id: "user-noemi", name: "Noemi Verga", email: "noemi.verga@dbsarc.com", initials: "NV" },
        { id: "user-nicolo", name: "Nicolò Viozzi", email: "nicolo.viozzi@dbsarc.com", initials: "NV" },
      ];
    },
  };
  const resolved = await resolveGrounding({
    ...contract,
    input: "Ask NV about Le Saillen.",
    recentMeetingDecisions: { scope: "none" },
  }, { dataSource: ambiguousSource });

  assert.deepEqual(resolved.mentionedUserIds, []);
  assert.deepEqual(resolved.users, []);
  assert.deepEqual(resolved.unresolved, [{
    kind: "user",
    reference: "NV",
    reason: "invalid",
  }]);
});

test("broad recent-decision intent searches all accessible projects", async () => {
  let requestedMemoryIds: readonly string[] = [];
  const trackingSource: GroundingDataSource = {
    ...source,
    async listMeetingMemories(projectIds) {
      requestedMemoryIds = projectIds;
      return [];
    },
  };
  await resolveGrounding({
    ...contract,
    input: "What are the latest meeting decisions?",
    projects: { scope: "workspace" },
  }, { dataSource: trackingSource });

  assert.deepEqual(requestedMemoryIds, ["project-saillen"]);
});

test("does not resolve duplicate project titles and records the ambiguity", async () => {
  const ambiguousSource: GroundingDataSource = {
    ...source,
    async listProjects() {
      return [
        {
          id: "project-garden-a",
          code: "DBS-2025-010",
          title: "Garden Tower",
          phase: "ETUDE/AP",
          client: null,
          commune: "Sion",
        },
        {
          id: "project-garden-b",
          code: "DBS-2025-011",
          title: "Garden Tower",
          phase: "CHANTIER",
          client: null,
          commune: "Milan",
        },
      ];
    },
  };
  const resolved = await resolveGrounding({
    ...contract,
    input: "Show Garden Tower.",
    users: { scope: "none" },
    recentMeetingDecisions: { scope: "none" },
  }, { dataSource: ambiguousSource });

  assert.deepEqual(resolved.projects, []);
  assert.deepEqual(resolved.mentionedProjectIds, []);
  assert.deepEqual(resolved.unresolved, [{
    kind: "project",
    reference: "Garden Tower",
    reason: "invalid",
  }]);
});
