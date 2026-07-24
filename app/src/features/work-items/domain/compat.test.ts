import assert from "node:assert/strict";
import test from "node:test";
import {
  compareAgendaItems,
  getLegacyAgendaDate,
  getLegacyAgendaType,
  toLegacyAgendaItem,
  toLegacyTask,
} from "./compat";

const createdAt = new Date("2026-07-20T08:00:00.000Z");
const updatedAt = new Date("2026-07-21T09:00:00.000Z");

test("Task compatibility projection preserves the previous read shape", () => {
  const dueDate = new Date("2026-08-01T12:00:00.000Z");
  assert.deepEqual(
    toLegacyTask({
      id: "task-1",
      userId: "user-1",
      title: "Issue drawings",
      description: "Issue the coordinated set",
      dueDate,
      status: "doing",
      priority: "high",
      projectId: "project-1",
      position: 3,
      completedAt: null,
      createdAt,
      updatedAt,
    }),
    {
      id: "task-1",
      userId: "user-1",
      title: "Issue drawings",
      description: "Issue the coordinated set",
      dueDate,
      status: "doing",
      priority: "high",
      projectId: "project-1",
      position: 3,
      completedAt: null,
      createdAt,
      updatedAt,
    },
  );
});

test("single-date Agenda compatibility reconstructs date without endDate", () => {
  const date = new Date("2026-08-02T10:30:00.000Z");
  const item = toLegacyAgendaItem({
    id: "agenda-1",
    title: "Permit deadline",
    description: null,
    startDate: null,
    dueDate: date,
    type: "deadline",
    legacyAgendaType: "deadline",
    priority: "critical",
    status: "pending",
    projectId: "project-1",
    userId: "user-1",
    color: "#ef4444",
    allDay: false,
    googleEventId: null,
    sourceSystem: null,
    sourceId: null,
    createdAt,
    updatedAt,
  });

  assert.equal(item.date, date);
  assert.equal(item.endDate, null);
});

test("ranged Agenda compatibility reconstructs date and endDate", () => {
  const startDate = new Date("2026-08-03T09:00:00.000Z");
  const dueDate = new Date("2026-08-03T10:00:00.000Z");
  const source = {
    id: "agenda-2",
    title: "Design review",
    description: null,
    startDate,
    dueDate,
    type: "meeting",
    legacyAgendaType: "meeting",
    priority: "medium",
    status: "pending",
    projectId: "project-1",
    userId: "user-1",
    color: null,
    allDay: false,
    googleEventId: "event-1",
    sourceSystem: "friday",
    sourceId: "source-1",
    createdAt,
    updatedAt,
  };

  const item = toLegacyAgendaItem(source);
  assert.equal(item.date, startDate);
  assert.equal(item.endDate, dueDate);
  assert.equal(getLegacyAgendaDate(source), startDate);
});

test("Agenda ordering uses the reconstructed compatibility date", () => {
  const later = {
    id: "later",
    startDate: null,
    dueDate: new Date("2026-08-05T09:00:00.000Z"),
  };
  const earlier = {
    id: "earlier",
    startDate: new Date("2026-08-04T09:00:00.000Z"),
    dueDate: new Date("2026-08-04T10:00:00.000Z"),
  };

  assert.deepEqual([later, earlier].sort(compareAgendaItems), [earlier, later]);
});

test("Agenda compatibility fails explicitly when no date exists", () => {
  assert.throws(
    () => getLegacyAgendaDate({ id: "broken", startDate: null, dueDate: null }),
    /has no scheduled date/,
  );
});

test("legacy call type survives canonical meeting normalisation", () => {
  const source = {
    id: "agenda-call",
    title: "Client call",
    description: null,
    startDate: null,
    dueDate: new Date("2026-08-06T09:00:00.000Z"),
    type: "meeting",
    legacyAgendaType: "call",
    priority: "medium",
    status: "pending",
    projectId: "project-1",
    userId: "user-1",
    color: null,
    allDay: false,
    googleEventId: null,
    sourceSystem: null,
    sourceId: null,
    createdAt,
    updatedAt,
  };

  assert.equal(getLegacyAgendaType(source), "call");
  assert.equal(toLegacyAgendaItem(source).type, "call");
});
