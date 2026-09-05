import assert from "node:assert/strict";
import test from "node:test";
import { authorize, readableProjectCountries, type Subject } from "./authorize";

function subject(role: string, countries: string[]): Subject {
  return {
    userId: "u1",
    role,
    isExternal: false,
    regions: countries.map((country) => ({ country, accessLevel: "view" as const })),
  };
}

test("directors are unrestricted", () => {
  for (const role of ["admin", "super_admin", "director"]) {
    assert.equal(readableProjectCountries(subject(role, [])), null, role);
  }
});

test("everyone else is limited to the countries they hold access to", () => {
  assert.deepEqual(readableProjectCountries(subject("manager", ["CH"])), ["CH"]);
  assert.deepEqual(readableProjectCountries(subject("employee", ["CH", "IT"])), ["CH", "IT"]);
});

test("a user with no region access sees nothing country-scoped", () => {
  assert.deepEqual(readableProjectCountries(subject("employee", [])), []);
});

test("duplicate region rows collapse to one country", () => {
  const withDuplicates: Subject = {
    userId: "u1",
    role: "manager",
    isExternal: false,
    regions: [
      { country: "CH", operatingRegion: "Valais", accessLevel: "manage" },
      { country: "CH", operatingRegion: "Ticino", accessLevel: "view" },
    ],
  };
  assert.deepEqual(readableProjectCountries(withDuplicates), ["CH"]);
});

/**
 * The rule this file states as a set and the rule authorize() applies one
 * project at a time have to agree. If they drift, the list shows rows the
 * detail view refuses to open, which is how the leak happened in the first
 * place.
 */
test("the set agrees with the per-project decision, country by country", () => {
  const countries = ["CH", "IT", "IN", null];
  const subjects: Subject[] = [
    subject("director", []),
    subject("manager", ["CH"]),
    subject("employee", ["IT"]),
    subject("viewer", []),
  ];

  for (const s of subjects) {
    const allowed = readableProjectCountries(s);
    for (const country of countries) {
      const decision = authorize(s, "project:read", {
        kind: "project",
        id: "p1",
        country,
        assignmentRole: null,
      });
      const setSays = country === null || allowed === null || allowed.includes(country);
      assert.equal(
        decision.allow,
        setSays,
        `${s.role} on ${country ?? "no country"}: authorize=${decision.allow} set=${setSays}`,
      );
    }
  }
});
