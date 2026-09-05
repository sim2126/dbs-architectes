import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { authorize, readableProjectRegions, type ProjectResource, type Subject } from "./authorize";
import { projectReadWhere } from "./project-read-where";

function subject(role: string, countries: string[]): Subject {
  return { userId: "u1", role, isExternal: false, regions: countries.map((country) => ({ country, accessLevel: "manage" })) };
}

// Evaluate the small SQL-predicate vocabulary emitted by projectReadWhere.
function matches(where: Prisma.ProjectWhereInput, project: ProjectResource): boolean {
  if (where.id && typeof where.id === "object" && "in" in where.id) return (where.id.in as string[]).includes(project.id);
  if (where.OR) return where.OR.some((clause) => matches(clause, project));
  if (where.country !== undefined && where.country !== project.country) return false;
  if (where.operatingRegion !== undefined && where.operatingRegion !== project.operatingRegion) return false;
  return true;
}

test("query visibility and project:read agree across sub-regions, denials and guests", () => {
  const subjects: Subject[] = [
    subject("director", []), subject("manager", ["CH"]), subject("employee", ["IT"]), subject("viewer", []),
    { ...subject("manager", []), regions: [
      { country: "CH", operatingRegion: "Valais", accessLevel: "manage" },
      { country: "CH", operatingRegion: "Ticino", accessLevel: "view" },
    ] },
    { ...subject("admin", []), grants: [{ action: "project:read", effect: "deny" }] },
    { ...subject("admin", []), isExternal: true },
  ];
  for (const caller of subjects) {
    const where = projectReadWhere(caller);
    for (const country of ["CH", "IT", "IN", null, ""]) {
      for (const operatingRegion of ["Valais", "Ticino", "Vaud", null]) {
        const project: ProjectResource = { kind: "project", id: "p1", country, operatingRegion };
        assert.equal(matches(where, project), authorize(caller, "project:read", project).allow,
          `${caller.role}: ${country}/${operatingRegion}`);
      }
    }
  }
});

test("specific grants never widen to the whole country", () => {
  const caller = { ...subject("manager", []), regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "view" as const }] };
  assert.deepEqual(readableProjectRegions(caller), caller.regions);
  assert.equal(authorize(caller, "project:read", { kind: "project", id: "p1", country: "CH", operatingRegion: "Ticino" }).allow, false);
  assert.equal(authorize(caller, "project:read", { kind: "project", id: "p1", country: "CH", operatingRegion: null }).allow, false);
});

test("all project mutation paths require manage access in the target region", () => {
  const caller = { ...subject("manager", []), regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "view" as const }] };
  const project: ProjectResource = { kind: "project", id: "p1", country: "CH", operatingRegion: "Valais", assignmentRole: "lead" };
  for (const action of ["project:update", "project:update.status", "project:assign", "project:status.post", "project:status.delete"] as const) {
    assert.equal(authorize(caller, action, project).allow, false, action);
    assert.equal(authorize({ ...caller, regions: [{ ...caller.regions[0], accessLevel: "manage" }] }, action, project).allow, true, action);
    assert.equal(authorize(subject("manager", ["IT"]), action, project).allow, false, `${action} cross-region`);
  }
});

test("deny beats allow regardless of grant order and blocks writes", () => {
  const caller: Subject = { ...subject("admin", []), grants: [
    { action: "project:read", effect: "allow" }, { action: "project:read", effect: "deny" },
  ] };
  const project: ProjectResource = { kind: "project", id: "p1", country: null };
  for (const action of ["project:read", "project:update", "project:update.status", "project:assign", "thread:read"] as const) {
    assert.equal(authorize(caller, action, project).allow, false, action);
  }
  assert.deepEqual(projectReadWhere(caller), { id: { in: [] } });
});

test("workload uses live grants independently of role", () => {
  assert.equal(authorize({ ...subject("manager", ["CH"]), grants: [{ action: "team:workload.read", effect: "deny" }] }, "team:workload.read", null).allow, false);
  assert.equal(authorize({ ...subject("employee", ["CH"]), grants: [{ action: "team:workload.read", effect: "allow" }] }, "team:workload.read", null).allow, true);
  assert.equal(authorize(subject("employee", ["CH"]), "team:workload.read", null).allow, false);
});
