// One-shot: list every project that's missing an image so we know what
// the backfill has to cover. Run with `npx tsx prisma/audit-images.ts`.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.project.findMany({
    select: { id: true, code: true, title: true, image: true, category: true, year: true },
    orderBy: { code: "asc" },
  });
  const missing = all.filter((p) => !p.image);
  const present = all.filter((p) => p.image);
  console.log(`TOTAL: ${all.length}`);
  console.log(`WITH image: ${present.length}`);
  console.log(`MISSING image: ${missing.length}`);
  console.log("---missing---");
  missing.forEach((m) => console.log(`${m.code} | ${m.title} | year=${m.year ?? "?"} | cat=${m.category}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
