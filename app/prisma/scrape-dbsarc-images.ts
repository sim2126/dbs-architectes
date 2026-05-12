/**
 * Scrapes hero images for every seeded DBS project directly from
 * https://dbsarc.com/architecture/ and saves them into `public/project-images/`.
 *
 * Run:  npx tsx prisma/scrape-dbsarc-images.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const LISTING = "https://dbsarc.com/architecture/";
const UA = "Mozilla/5.0 (DBS-CRM/demo scraper)";
const OUT_DIR = path.join(process.cwd(), "public", "project-images");
const PUBLIC_PREFIX = "/project-images";

// ── Helpers ───────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function norm(s: string): string {
  return decodeEntities(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Parse every <article class="project ..."> block in the listing. */
function parseProjects(html: string): Array<{ id: string; title: string; image: string }> {
  const projects: Array<{ id: string; title: string; image: string }> = [];
  const articleRx = /<article id="project-(\d+)"[\s\S]*?<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = articleRx.exec(html))) {
    const block = m[0];
    const id = m[1];
    const titleMatch = block.match(/<h2 class="project-title">([^<]+)<\/h2>/);
    // Prefer the full-size upload linked by the main <a>, fall back to the -800x600 <img>.
    const mainLinkMatch = block.match(
      /<a\s+href="(https:\/\/dbsarc\.com\/wp-content\/uploads\/[^"]+)"[^>]*class="gallery-item-link"[^>]*>\s*<img[^>]*class="gallery-item gallery-item-main/
    );
    const mainImgMatch = block.match(
      /<img[^>]*src="(https:\/\/dbsarc\.com\/wp-content\/uploads\/[^"]+)"[^>]*class="gallery-item gallery-item-main/
    );
    if (!titleMatch) continue;
    const image = mainLinkMatch?.[1] ?? mainImgMatch?.[1];
    if (!image) continue;
    projects.push({ id, title: decodeEntities(titleMatch[1]).trim(), image });
  }
  return projects;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching dbsarc.com listing …");
  const res = await fetch(LISTING, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Listing HTTP ${res.status}`);
  const html = await res.text();

  const scraped = parseProjects(html);
  console.log(`Parsed ${scraped.length} projects from listing.`);

  await mkdir(OUT_DIR, { recursive: true });

  const dbProjects = await prisma.project.findMany({
    where: { code: { startsWith: "DBS-" } },
    select: { id: true, code: true, title: true },
  });
  console.log(`DB has ${dbProjects.length} seeded projects.`);

  // Build a normalized lookup from scraped titles → scraped entry
  const byNorm = new Map(scraped.map((s) => [norm(s.title), s]));

  let matched = 0;
  let downloaded = 0;
  let missing = 0;
  const unmatched: string[] = [];

  for (const p of dbProjects) {
    const pN = norm(p.title);
    // 1) exact normalized match
    let match = byNorm.get(pN);
    // 2) containment either way — "Blignou Houses (2019)" vs "Blignou Houses"
    if (!match) {
      match = scraped.find((s) => {
        const sN = norm(s.title);
        return sN && (sN.includes(pN) || pN.includes(sN));
      });
    }
    if (!match) {
      missing++;
      unmatched.push(p.title);
      continue;
    }
    matched++;

    const urlPath = new URL(match.image).pathname;
    const extRaw = path.extname(urlPath).toLowerCase();
    const ext = [".jpg", ".jpeg", ".png", ".webp"].includes(extRaw) ? extRaw : ".jpg";
    const filename = `${slugify(p.title) || p.code.toLowerCase()}${ext}`;
    const filepath = path.join(OUT_DIR, filename);
    const publicPath = `${PUBLIC_PREFIX}/${filename}`;

    try {
      await download(match.image, filepath);
      await prisma.project.update({
        where: { id: p.id },
        data: { image: publicPath },
      });
      downloaded++;
      console.log(`  ✓ ${p.code}  ${p.title}  →  ${publicPath}`);
    } catch (e) {
      console.warn(`  ✗ ${p.code}  ${p.title}  —  ${(e as Error).message}`);
    }
  }

  console.log(
    `\nDone. matched=${matched}  downloaded=${downloaded}  missing=${missing}/${dbProjects.length}`
  );
  if (unmatched.length) {
    console.log("Unmatched DB projects (consider adding aliases):");
    unmatched.forEach((t) => console.log(`  - ${t}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
