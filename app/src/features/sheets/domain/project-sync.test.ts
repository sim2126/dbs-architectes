import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectSyncUpdates, toProjectSyncData } from "./project-sync";

test("project sheet sync preserves every editable field and excludes display-only data", () => {
  const updates = buildProjectSyncUpdates(
    [
      {
        id: "project-1",
        code: "DBS001",
        title: "Updated title",
        phase: "ETUDE/AP",
        category: "Residential",
        client: "Updated client",
        commune: "Lugano",
        workStatus: "doing",
        billing: "Parziale",
        year: "2026",
        team: [{ name: "Giulio Sovran", initials: "GS" }],
        notes: "Updated notes",
      },
    ],
    new Set(["project-1"]),
  );

  assert.deepEqual(updates, [
    {
      id: "project-1",
      title: "Updated title",
      phase: "ETUDE/AP",
      category: "Residential",
      client: "Updated client",
      commune: "Lugano",
      workStatus: "doing",
      billing: "Parziale",
      notes: "Updated notes",
    },
  ]);

  assert.deepEqual(toProjectSyncData(updates[0]), {
    title: "Updated title",
    phase: "ETUDE/AP",
    category: "Residential",
    client: "Updated client",
    commune: "Lugano",
    workStatus: "doing",
    billing: "Parziale",
    notes: "Updated notes",
  });
});

test("project sheet sync only emits dirty rows", () => {
  const row = {
    id: "project-1",
    title: "Title",
    phase: "MAE",
    category: "Residential",
    client: "Client",
    commune: "Lugano",
    workStatus: "todo",
    billing: "",
    notes: "",
  };

  assert.deepEqual(buildProjectSyncUpdates([row], new Set()), []);
});
