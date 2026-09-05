/**
 * Fill a staging database with enough invented projects to measure the board
 * at the size DBS actually works at.
 *
 * DBS keep 200-plus projects in Monday today and will add hundreds more over
 * the years they use Friday. A board that is comfortable at 24 rows tells you
 * nothing about that, and "limits are measured before ship" is a rule on this
 * project rather than an aspiration. Running this is how the windowing
 * numbers in ui/board/windowing.ts were obtained.
 *
 *   npm run db:seed:scale            # tops up to 800 projects
 *   TARGET=2000 npm run db:seed:scale
 *   npm run db:seed:scale -- --clean # removes every row it added
 *
 * Refuses to run anywhere but a local database. These rows are fixtures, not
 * demo data: they carry sourceSystem "scale-test" so cleanup is exact, and
 * they are never seeded into the demo the client sees.
 */

import { createSeedPrisma } from "./seed-db";
import { demoProjectDates } from "./demo-project-dates";

const MARKER = "scale-test";
const PHASES = ["ETUDE/AP", "MAE", "CHANTIER", "EXE/DG/DV/3D", "TERMINATO", "STUCK"];
const CATEGORIES = ["Residenziale", "Commerciale", "Industriale", "Pubblico", "Interni"];
const COMMUNES = ["Sion", "Milano", "Lugano", "Verbier", "Bergamo", "Martigny"];
const STATUSES = ["todo", "doing", "stuck", "completed"];

function assertLocal(url: string | undefined): void {
  if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(
      "seed-scale refuses to run against anything but a local database. " +
        "These are performance fixtures and have no business in a demo or in production.",
    );
  }
}

async function main() {
  assertLocal(process.env.DATABASE_URL);
  // The same connection the other seeds use. A bare PrismaClient cannot
  // connect at all under Prisma 7 — it warned and carried on, and the first
  // --clean silently deleted nothing.
  const prisma = createSeedPrisma(process.env.DATABASE_URL as string);
  const clean = process.argv.includes("--clean");

  if (clean) {
    const { count } = await prisma.project.deleteMany({ where: { sourceSystem: MARKER } });
    console.log(`Removed ${count} scale fixtures. ${await prisma.project.count()} projects remain.`);
    await prisma.$disconnect();
    return;
  }

  const target = Number(process.env.TARGET ?? 800);
  const existing = await prisma.project.count();
  const toAdd = Math.max(0, target - existing);
  console.log(`${existing} projects exist; adding ${toAdd} to reach ${target}.`);

  for (let i = 0; i < toAdd; i += 100) {
    const batch = Array.from({ length: Math.min(100, toAdd - i) }, (_, j) => {
      const n = i + j;
      const year = 2021 + (n % 6);
      const code = `DBS-${year}-${String(900 + n).padStart(4, "0")}`;
      const phase = PHASES[n % PHASES.length];
      const { startDate, endDate } = demoProjectDates(code, year, phase);
      return {
        code,
        title: `Scale fixture ${n + 1}`,
        phase,
        category: CATEGORIES[n % CATEGORIES.length],
        workStatus: STATUSES[n % STATUSES.length],
        client: `Client ${n % 60}`,
        commune: COMMUNES[n % COMMUNES.length],
        country: n % 2 === 0 ? "CH" : "IT",
        year,
        startDate,
        endDate,
        sourceSystem: MARKER,
      };
    });
    await prisma.project.createMany({ data: batch, skipDuplicates: true });
  }

  // Assignments too, so the people column and the workload rollups are as
  // heavy as they would really be.
  const users = await prisma.user.findMany({
    where: { isActive: true, isExternal: false },
    select: { id: true },
  });
  if (users.length > 0) {
    const fixtures = await prisma.project.findMany({
      where: { sourceSystem: MARKER },
      select: { id: true },
    });
    const links = fixtures.flatMap((project, index) =>
      [0, 1, 2].map((k) => ({
        projectId: project.id,
        userId: users[(index + k) % users.length].id,
        role: k === 0 ? "lead" : "editor",
      })),
    );
    for (let i = 0; i < links.length; i += 500) {
      await prisma.projectAssignment.createMany({
        data: links.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }

  console.log(
    `${await prisma.project.count()} projects, ${await prisma.projectAssignment.count()} assignments.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
