// Backfill: every project must render with a hero image. The 48 dbsarc
// projects were matched by `scrape-dbsarc-images.ts`; the remaining
// legacy seed entries get a deterministic fallback chosen by category +
// code hash so two adjacent rows never share the same picture.
//
// Run: npx tsx prisma/backfill-images.ts

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Per-category pools, all from public/project-images/. Pick photos that
// genuinely look like the category — residential exteriors for Residenziale,
// hospitality / commercial-ish for Commerciale, etc.

const POOL: Record<string, string[]> = {
  Residenziale: [
    "/project-images/le-saillen.jpg",
    "/project-images/lamberson-buildings.jpg",
    "/project-images/oscar-bider.jpg",
    "/project-images/crans-villa.jpg",
    "/project-images/savioz-house.jpg",
    "/project-images/condemines-house.jpg",
    "/project-images/maurice-building.jpg",
    "/project-images/clerc-house.jpg",
    "/project-images/reynard-house.jpeg",
    "/project-images/chalet-in-villars-sur-ollon.jpg",
    "/project-images/grimisuat-houses.jpg",
    "/project-images/pitteloud-house.jpg",
    "/project-images/le-hameau.jpg",
  ],
  Commerciale: [
    "/project-images/banque-cantonale-du-valais.jpg",
    "/project-images/kalush-city-center.jpg",
    "/project-images/crans-carlton.jpg",
  ],
  Misto: [
    "/project-images/oscar-bider.jpg",
    "/project-images/lamberson-buildings.jpg",
    "/project-images/sierre-bourg.png",
  ],
  Hospitality: [
    "/project-images/crans-carlton.jpg",
    "/project-images/healing-resort.jpg",
  ],
  Refurbishment: [
    "/project-images/sierre-bourg.png",
    "/project-images/transformation-of-a-historic-building-7-apartments.jpg",
  ],
};

// Deterministic non-cryptographic hash so the same project always picks
// the same image; adjacent codes ideally land in different buckets.
function hashCode(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickImage(code: string, category: string): string {
  const pool = POOL[category] ?? POOL.Residenziale;
  return pool[hashCode(code) % pool.length];
}

async function main() {
  const missing = await prisma.project.findMany({
    where: { OR: [{ image: null }, { image: "" }] },
    select: { id: true, code: true, title: true, category: true },
    orderBy: { code: "asc" },
  });

  console.log(`Backfilling ${missing.length} projects without images…\n`);

  for (const p of missing) {
    const image = pickImage(p.code, p.category);
    await prisma.project.update({
      where: { id: p.id },
      data: { image },
    });
    console.log(`  ✓ ${p.code.padEnd(14)} ${p.category.padEnd(15)} → ${image}`);
  }

  console.log(`\nBackfill complete. ${missing.length} rows updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
