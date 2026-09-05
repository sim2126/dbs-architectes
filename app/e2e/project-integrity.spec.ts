import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { stateFor } from "./roles";

type Project = {
  id: string; title: string; code: string; workStatus: string;
  startDate: string | null; endDate: string | null;
  capabilities: { read: boolean; update: boolean; updateStatus: boolean; assign: boolean };
};
type Grant = { action: string; effect: string; reason: string | null; expiresAt: string | null };

async function checked(response: APIResponse): Promise<APIResponse> {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response;
}

async function create(request: APIRequestContext, data: Record<string, unknown>, ids: string[]): Promise<Project> {
  const response = await checked(await request.post("/api/projects", { data }));
  expect(response.status()).toBe(201);
  const project = await response.json() as Project;
  ids.push(project.id);
  return project;
}

async function removeProjects(request: APIRequestContext, ids: string[]) {
  for (const id of ids) await checked(await request.delete(`/api/projects/${id}`));
}

test.describe("project authorisation and data integrity", () => {
  test.use({ storageState: stateFor("admin") });
  test.setTimeout(90_000);

  test("parallel automatic codes remain unique and preserve status/capabilities", async ({ request }) => {
    const ids: string[] = [];
    try {
      const replies = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        request.post("/api/projects", { data: { title: `Integrity code ${Date.now()} ${index}`, workStatus: "stuck" } }),
      ));
      const rows = await Promise.all(replies.map((response) => response.json())) as Project[];
      ids.push(...rows.filter((row) => typeof row.id === "string").map((row) => row.id));
      for (const response of replies) expect(response.status(), await response.text()).toBe(201);
      expect(new Set(rows.map((row) => row.code)).size).toBe(12);
      for (const row of rows) {
        expect(row.workStatus).toBe("stuck");
        expect(row.capabilities).toEqual({ read: true, update: true, updateStatus: true, assign: true });
      }
    } finally {
      await removeProjects(request, ids);
    }
  });

  test("dates fail legibly and concurrent endpoint edits cannot reverse the range", async ({ request }) => {
    const ids: string[] = [];
    try {
      const project = await create(request, { title: `Integrity dates ${Date.now()}`, startDate: "2026-05-01", endDate: "2026-05-10" }, ids);
      for (const data of [{ startDate: "2026-02-31" }, { endDate: {} }, { startDate: "2026-05-11" }, { year: 2026.5 }]) {
        const response = await request.patch(`/api/projects/${project.id}`, { data });
        expect(response.status(), await response.text()).toBe(400);
        expect((await response.json()).error).toBeTruthy();
      }
      const replies = await Promise.all([
        request.patch(`/api/projects/${project.id}`, { data: { startDate: "2026-05-09" } }),
        request.patch(`/api/projects/${project.id}`, { data: { endDate: "2026-05-02" } }),
      ]);
      expect(replies.map((reply) => reply.status()).sort()).toEqual([200, 400]);
      const current = await (await checked(await request.get(`/api/projects/${project.id}`))).json() as Project;
      expect(new Date(current.startDate!).getTime()).toBeLessThanOrEqual(new Date(current.endDate!).getTime());
    } finally {
      await removeProjects(request, ids);
    }
  });

  test("paging survives an updated later row and a deleted cursor row", async ({ request }) => {
    const ids: string[] = [];
    const title = `Integrity pagination ${Date.now()}`;
    try {
      for (let index = 0; index < 3; index++) await create(request, { title: `${title} ${index}` }, ids);
      const page = await (await checked(await request.get(`/api/projects?paging=1&limit=1&search=${encodeURIComponent(title)}`))).json();
      const first = page.projects[0].id as string;
      const remaining = ids.filter((id) => id !== first).sort();
      await checked(await request.patch(`/api/projects/${remaining.at(-1)}`, { data: { notes: "Updated between page requests" } }));
      await checked(await request.delete(`/api/projects/${first}`));
      ids.splice(ids.indexOf(first), 1);
      const next = await (await checked(await request.get(`/api/projects?paging=1&limit=10&search=${encodeURIComponent(title)}&cursor=${page.nextCursor}`))).json();
      expect(next.projects.map((project: Project) => project.id)).toEqual(remaining);
      expect(next.hasMore).toBe(false);
    } finally {
      await removeProjects(request, ids);
    }
  });

  test("region scope, read denials and live workload grants apply to an existing session", async ({ request, playwright, baseURL }) => {
    const pm = await playwright.request.newContext({ baseURL, storageState: stateFor("pm") });
    const users = await (await checked(await request.get("/api/users"))).json() as Array<{ id: string; email: string; role: string }>;
    const target = users.find((user) => user.email === "pm@dbsarc.com")!;
    expect(target).toBeTruthy();
    const originalRegions = await (await checked(await request.get(`/api/users/${target.id}/regions`))).json();
    const grantSnapshot = await (await checked(await request.get("/api/permissions/grants"))).json() as { subjects: Array<{ user: { id: string }; grants: Grant[] }> };
    const originalGrants = grantSnapshot.subjects.find((subject) => subject.user.id === target.id)?.grants ?? [];
    const touchedActions = ["project:read", "team:workload.read"];
    const ids: string[] = [];
    const marker = `Integrity region ${Date.now()}`;
    const setGrant = async (action: string, effect: string) => checked(await request.post("/api/permissions/grants", { data: { userId: target.id, action, effect } }));
    const clearGrant = async (action: string) => checked(await request.delete(`/api/permissions/grants?userId=${target.id}&action=${encodeURIComponent(action)}`));
    try {
      for (const action of touchedActions) await clearGrant(action);
      const valais = await create(request, { title: `${marker} Valais`, country: "CH", operatingRegion: "Valais" }, ids);
      const ticino = await create(request, { title: `${marker} Ticino`, country: "CH", operatingRegion: "Ticino" }, ids);
      const italy = await create(request, { title: `${marker} Italy`, country: "IT", operatingRegion: "Lombardy" }, ids);
      for (const project of [valais, ticino, italy]) {
        await checked(await request.post(`/api/projects/${project.id}/members`, { data: { userId: target.id, role: "lead" } }));
      }
      await checked(await request.put(`/api/users/${target.id}/regions`, { data: { regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "view" }] } }));
      const visible = await (await checked(await pm.get(`/api/projects?search=${encodeURIComponent(marker)}`))).json() as Project[];
      expect(visible.map((project) => project.id)).toEqual([valais.id]);
      expect(visible[0].capabilities).toEqual({ read: true, update: false, updateStatus: false, assign: false });
      const page = await (await checked(await pm.get("/dashboard/projects"))).text();
      expect(page).toContain(valais.title);
      expect(page).not.toContain(ticino.title);
      expect(page).not.toContain(italy.title);
      for (const project of [valais, ticino, italy]) {
        expect((await pm.patch(`/api/projects/${project.id}`, { data: { workStatus: "stuck" } })).status()).toBe(403);
      }
      expect((await pm.get(`/api/projects/${ticino.id}`)).status()).toBe(403);
      const blockedDetail = await pm.get(`/dashboard/projects/${ticino.id}`, { maxRedirects: 0 });
      expect([307, 200]).toContain(blockedDetail.status());
      expect(await blockedDetail.text()).not.toContain(ticino.title);
      const workload = await (await checked(await pm.get("/api/team-workload"))).json() as { members: Array<{ projects: Project[] }> };
      const listedIds = workload.members.flatMap((member) => member.projects.map((project) => project.id));
      expect(listedIds).toContain(valais.id);
      expect(listedIds).not.toContain(ticino.id);
      expect(listedIds).not.toContain(italy.id);

      await checked(await request.put(`/api/users/${target.id}/regions`, { data: { regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "manage" }] } }));
      await checked(await pm.patch(`/api/projects/${valais.id}`, { data: { workStatus: "doing" } }));
      await setGrant("project:read", "deny");
      const deniedList = await (await checked(await pm.get("/api/projects?paging=1"))).json();
      expect(deniedList.projects).toEqual([]);
      expect(await (await checked(await pm.get("/dashboard/projects"))).text()).not.toContain(valais.title);
      expect(await (await pm.get(`/dashboard/projects/${valais.id}`)).text()).not.toContain(valais.title);
      expect((await pm.patch(`/api/projects/${valais.id}`, { data: { workStatus: "stuck" } })).status()).toBe(403);
      await clearGrant("project:read");

      await setGrant("team:workload.read", "deny");
      expect((await pm.get("/api/team-workload")).status()).toBe(403);
      await clearGrant("team:workload.read");
      await checked(await request.patch(`/api/users/${target.id}`, { data: { role: "employee" } }));
      expect((await pm.get("/api/team-workload")).status()).toBe(403);
      await setGrant("team:workload.read", "allow");
      await checked(await pm.get("/api/team-workload"));

      const detail = await (await checked(await request.get(`/api/projects/${valais.id}`))).json();
      const assertNoSecrets = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          expect(["password", "mfaSecret", "access_token", "refresh_token"]).not.toContain(key);
          assertNoSecrets(child);
        }
      };
      assertNoSecrets(detail);
    } finally {
      await checked(await request.patch(`/api/users/${target.id}`, { data: { role: target.role } }));
      await checked(await request.put(`/api/users/${target.id}/regions`, { data: { regions: originalRegions } }));
      for (const action of touchedActions) {
        const original = originalGrants.find((grant) => grant.action === action);
        if (original) await checked(await request.post("/api/permissions/grants", { data: { userId: target.id, ...original } }));
        else await clearGrant(action);
      }
      await removeProjects(request, ids);
      await pm.dispose();
    }
  });
});
