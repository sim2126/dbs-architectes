/**
 * Seeds real DBS Architectes team + projects scraped from https://dbsarc.com.
 * Run with: npx tsx prisma/seed-dbsarc.ts
 *
 * Idempotent — upserts by email (team) and code (projects).
 * Leaves admin@dbsarc.com untouched. Deactivates legacy placeholder users.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Team roster (from dbsarc.com/team) ───────────────────
const TEAM = [
  // Associates (= director-level)
  { first: "Giulio", last: "Sovran", role: "director", title: "Associate / Co-founder", office: "CH" },
  { first: "Luigi", last: "Di Berardino", role: "director", title: "Associate / Co-founder", office: "CH" },
  { first: "Gianmarco", last: "Lapolla", role: "director", title: "Associate", office: "CH" },
  { first: "Florencia", last: "Schilling", role: "director", title: "Associate", office: "CH" },

  // Managers
  { first: "Michele", last: "Moretti", role: "manager", title: "Project Manager", office: "CH" },
  { first: "Ali Reza", last: "Hakim", role: "manager", title: "Project Manager", office: "CH" },
  { first: "Natalia", last: "Rincón", role: "manager", title: "Project Manager", office: "CH" },

  // Architects — Milano
  { first: "Giuseppe", last: "Marchica", role: "employee", title: "Architect", office: "IT" },

  // Architects — Sion
  { first: "Marco", last: "Iebba", role: "employee", title: "Architect", office: "CH" },
  { first: "Erica", last: "Vidale", role: "employee", title: "Architect", office: "CH" },
  { first: "Petko", last: "Slavov", role: "employee", title: "Architect", office: "CH" },
  { first: "Noemi", last: "Verga", role: "employee", title: "Architect", office: "CH" },
  { first: "Arnaud", last: "Zbinden", role: "employee", title: "Architect", office: "CH" },
  { first: "Elodie", last: "G. Martins", role: "employee", title: "Architect", office: "CH" },
  { first: "Edoardo", last: "Bernasconi", role: "employee", title: "Architect", office: "CH" },
  { first: "Adriana", last: "Bakalyar", role: "employee", title: "Architect", office: "CH" },
  { first: "Nicolò", last: "Viozzi", role: "employee", title: "Architect", office: "CH" },
  { first: "Michèle", last: "Jemini", role: "employee", title: "Architect", office: "CH" },
  { first: "Juan", last: "Zamudio", role: "employee", title: "Architect", office: "CH" },
  { first: "Daniel", last: "Siado", role: "employee", title: "Architect", office: "CH" },
  { first: "Paul", last: "Perez", role: "employee", title: "Architect", office: "CH" },
  { first: "Valentina", last: "Poveda", role: "employee", title: "Architect", office: "CH" },
  { first: "Ausaf", last: "Syed", role: "employee", title: "Architect", office: "IN" },
  { first: "Shahran", last: "Rashid", role: "employee", title: "Architect", office: "IN" },
  { first: "Wasim", last: "Showkat", role: "employee", title: "Architect", office: "IN" },
  { first: "Moiz Behzad", last: "Khan", role: "employee", title: "Architect", office: "IN" },
  { first: "Shahid", last: "Qayoom", role: "employee", title: "Architect", office: "IN" },

  // Support
  { first: "Sergio", last: "Facchetti", role: "employee", title: "3D Visualizer", office: "IT" },
  { first: "Sylvie", last: "Sarrassin", role: "employee", title: "Administrator", office: "CH" },
  { first: "Anaïs", last: "Morceau", role: "employee", title: "Media Manager", office: "CH" },
];

// Emails not published — generate plausible @dbsarc.com with ascii-safe slugs
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}
function email(first: string, last: string): string {
  return `${slug(first)}.${slug(last)}@dbsarc.com`;
}
function initials(first: string, last: string): string {
  return (first[0] + (last[0] ?? "")).toUpperCase();
}

// Office → country/region
const OFFICE_LOC: Record<string, { country: string; region: string; regionCode: string }> = {
  CH: { country: "CH", region: "Valais", regionCode: "CH-VS" },
  IT: { country: "IT", region: "Lombardia", regionCode: "IT-LOM" },
  IN: { country: "IN", region: "Kashmir", regionCode: "IN-JK" },
};

// ─── Projects (from dbsarc.com/architecture) ──────────────
// Common Swiss Valais + Italian/Ukrainian/Indian coords for map demo
const COORDS: Record<string, [number, number]> = {
  Sion: [46.2276, 7.3596],
  Sierre: [46.2917, 7.5355],
  "Crans Montana": [46.3089, 7.4828],
  Chamoson: [46.2053, 7.2228],
  Nendaz: [46.1833, 7.3],
  Martigny: [46.1017, 7.0722],
  Grimisuat: [46.2472, 7.3833],
  Ayent: [46.2753, 7.3731],
  "Blignou/Ayent": [46.2661, 7.3789],
  Blignou: [46.2661, 7.3789],
  Conthey: [46.2211, 7.3042],
  "St-Léonard": [46.2594, 7.4189],
  "St Léonard": [46.2594, 7.4189],
  Ollon: [46.2928, 6.9892],
  Bex: [46.2525, 7.0097],
  Evionnaz: [46.1758, 7.0275],
  Salins: [46.2097, 7.3886],
  Venthône: [46.3017, 7.5136],
  Riddes: [46.1728, 7.2264],
  Leytron: [46.1889, 7.2117],
  Luc: [46.3242, 7.4239],
  "St-Romain": [46.2097, 7.4314],
  "St. Romain": [46.2097, 7.4314],
  Corin: [46.2886, 7.5122],
  Uvrier: [46.2344, 7.3947],
  Aproz: [46.2083, 7.3058],
  Chalais: [46.2953, 7.5119],
  "Noës/Sierre": [46.2831, 7.5225],
  Fortunau: [46.2556, 7.3889],
  Turin: [45.0703, 7.6869],
  Kashmir: [34.0837, 74.7973],
  Ukraine: [49.0281, 24.3694],
};

type Cat = "Residenziale" | "Hospitality" | "Mista" | "Ristrutturazione";
function mapCategory(tags: string[]): Cat {
  if (tags.includes("Hospitality")) return "Hospitality";
  if (tags.includes("Mixed Use")) return "Mista";
  if (tags.includes("Refurbishment") && !tags.includes("Residential complexes"))
    return "Ristrutturazione";
  return "Residenziale";
}
function mapPhase(status: "Built" | "Planned" | "Competition"): string {
  if (status === "Built") return "TERMINATO";
  if (status === "Competition") return "CONCORSO";
  return "ETUDE/AP";
}
function countryOf(location: string): string {
  if (location.includes("Switzerland")) return "CH";
  if (location.includes("Italy")) return "IT";
  if (location.includes("Kashmir")) return "IN";
  if (location.includes("Ukraine")) return "UA";
  return "CH";
}

interface ProjectSeed {
  title: string;
  city: string;
  location: string;
  year: number;
  tags: string[];
  status: "Built" | "Planned" | "Competition";
}

const PROJECTS: ProjectSeed[] = [
  // 2025
  { title: "Le Saillen", city: "Salins", location: "Salins, Switzerland", year: 2025, tags: ["Residential complexes"], status: "Planned" },
  { title: "Plan Conthey Udry", city: "Conthey", location: "Conthey, Switzerland", year: 2025, tags: ["Residential complexes"], status: "Planned" },
  { title: "Le Hameau", city: "Grimisuat", location: "Grimisuat, Switzerland", year: 2025, tags: ["Residential complexes"], status: "Planned" },
  // 2024
  { title: "Kalush City Center", city: "Ukraine", location: "Ukraine", year: 2024, tags: ["Mixed Use"], status: "Planned" },
  { title: "Lamberson Buildings", city: "Sierre", location: "Sierre, Switzerland", year: 2024, tags: ["Mixed Use", "Residential complexes"], status: "Built" },
  { title: "Oscar Bider", city: "Sion", location: "Sion, Switzerland", year: 2024, tags: ["Mixed Use", "Residential complexes"], status: "Built" },
  // 2023
  { title: "Sierre Bourg", city: "Sierre", location: "Sierre, Switzerland", year: 2023, tags: ["Refurbishment"], status: "Built" },
  { title: "Banque Cantonale du Valais", city: "Sion", location: "Sion, Switzerland", year: 2023, tags: ["Mixed Use", "Refurbishment"], status: "Built" },
  { title: "Corin Raye Apartments", city: "Corin", location: "Corin, Switzerland", year: 2023, tags: ["Residential complexes"], status: "Built" },
  { title: "Savioz House", city: "Uvrier", location: "Uvrier, Switzerland", year: 2023, tags: ["Single family homes"], status: "Built" },
  { title: "Maurice Building", city: "Sion", location: "Sion, Switzerland", year: 2023, tags: ["Residential complexes"], status: "Built" },
  { title: "Clerc House", city: "Aproz", location: "Aproz, Switzerland", year: 2023, tags: ["Single family homes"], status: "Built" },
  { title: "Healing Resort", city: "Kashmir", location: "Kashmir", year: 2023, tags: ["Hospitality"], status: "Planned" },
  { title: "Priotto – 2 apartments", city: "St-Romain", location: "St-Romain, Switzerland", year: 2023, tags: ["Residential complexes"], status: "Built" },
  // 2022
  { title: "6 Houses in Ollon (VD)", city: "Ollon", location: "Ollon, Switzerland", year: 2022, tags: ["Residential complexes"], status: "Built" },
  { title: "Riddes Buildings", city: "Riddes", location: "Riddes, Switzerland", year: 2022, tags: ["Residential complexes"], status: "Built" },
  { title: "Tsampy Houses", city: "Luc", location: "Luc, Switzerland", year: 2022, tags: ["Residential complexes"], status: "Built" },
  { title: "Fontanay Building – 3 apartments", city: "Venthône", location: "Venthône, Switzerland", year: 2022, tags: ["Residential complexes"], status: "Built" },
  // 2021
  { title: "Crans Villa", city: "Crans Montana", location: "Crans Montana, Switzerland", year: 2021, tags: ["Refurbishment", "Single family homes"], status: "Built" },
  { title: "Reynard House", city: "Blignou/Ayent", location: "Blignou/Ayent, Switzerland", year: 2021, tags: ["Single family homes"], status: "Built" },
  { title: "Fortunau – 2 apartments", city: "Fortunau", location: "Fortunau, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  { title: "Fersini House", city: "Noës/Sierre", location: "Noës/Sierre, Switzerland", year: 2021, tags: ["Single family homes"], status: "Built" },
  { title: "Fortunau Houses", city: "Fortunau", location: "Fortunau, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  { title: "Luc Tsampy Building", city: "Luc", location: "Luc, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  { title: "Evionnaz Houses", city: "Evionnaz", location: "Evionnaz, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  { title: "Blignou Houses", city: "Blignou/Ayent", location: "Blignou/Ayent, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  { title: "Poteu Building", city: "Chamoson", location: "Chamoson, Switzerland", year: 2021, tags: ["Residential complexes"], status: "Built" },
  // 2020
  { title: "Luisiana Building – 2 apartments", city: "Salins", location: "Salins, Switzerland", year: 2020, tags: ["Residential complexes"], status: "Built" },
  { title: "Condémines House", city: "Grimisuat", location: "Grimisuat, Switzerland", year: 2020, tags: ["Single family homes"], status: "Built" },
  { title: "St-Léonard Houses", city: "St-Léonard", location: "St-Léonard, Switzerland", year: 2020, tags: ["Residential complexes"], status: "Built" },
  { title: "Tsânio Houses", city: "Grimisuat", location: "Grimisuat, Switzerland", year: 2020, tags: ["Residential complexes"], status: "Built" },
  { title: "Monnat – 6 apartments", city: "Leytron", location: "Leytron, Switzerland", year: 2020, tags: ["Residential complexes"], status: "Built" },
  { title: "Corbaraye House", city: "Ayent", location: "Ayent, Switzerland", year: 2020, tags: ["Single family homes"], status: "Built" },
  { title: "Grimisuat Houses", city: "Grimisuat", location: "Grimisuat, Switzerland", year: 2020, tags: ["Residential complexes"], status: "Built" },
  { title: "Tsânio House", city: "Grimisuat", location: "Grimisuat, Switzerland", year: 2020, tags: ["Single family homes"], status: "Built" },
  // 2019
  { title: "Blignou Houses (2019)", city: "Blignou", location: "Blignou, Switzerland", year: 2019, tags: ["Residential complexes"], status: "Built" },
  { title: "Mazette Building – 7 apartments", city: "Turin", location: "Turin, Italy", year: 2019, tags: ["Residential complexes"], status: "Built" },
  { title: "St. Romain (Houses)", city: "St. Romain", location: "St. Romain, Switzerland", year: 2019, tags: ["Residential complexes"], status: "Built" },
  // 2018
  { title: "Crans Carlton", city: "Crans Montana", location: "Crans Montana, Switzerland", year: 2018, tags: ["Hospitality"], status: "Built" },
  // 2017
  { title: "Sierre's House", city: "Sierre", location: "Sierre, Switzerland", year: 2017, tags: ["Residential complexes"], status: "Built" },
  { title: "Pitteloud House", city: "St Léonard", location: "St Léonard, Switzerland", year: 2017, tags: ["Single family homes"], status: "Built" },
  { title: "Bex Salvat Houses", city: "Bex", location: "Bex, Switzerland", year: 2017, tags: ["Residential complexes"], status: "Built" },
  { title: "Chalet in Villars-sur-Ollon", city: "Ollon", location: "Ollon, Switzerland", year: 2017, tags: ["Single family homes"], status: "Built" },
  // 2016
  { title: "Brice's Garden – 11 apartments", city: "Nendaz", location: "Nendaz, Switzerland", year: 2016, tags: ["Residential complexes"], status: "Built" },
  { title: "Transformation of a Historic Building – 7 apartments", city: "Martigny", location: "Martigny, Switzerland", year: 2016, tags: ["Refurbishment", "Residential complexes"], status: "Built" },
  // 2015
  { title: "Mayoraz house", city: "Salins", location: "Salins, Switzerland", year: 2015, tags: ["Single family homes"], status: "Built" },
  { title: "Laurina Building – 13 apartments", city: "Chalais", location: "Chalais, Switzerland", year: 2015, tags: ["Residential complexes"], status: "Built" },
  { title: "Solaris", city: "Sion", location: "Sion, Switzerland", year: 2015, tags: ["Residential complexes"], status: "Built" },
];

async function main() {
  console.log("Seeding DBS team & projects from dbsarc.com …");

  // Deactivate legacy placeholder users (keep admin + real-name ones)
  const legacyEmails = [
    "vn@dbsarc.com", "shr@dbsarc.com", "ps@dbsarc.com", "ar@dbsarc.com",
    "gl@dbsarc.com", "nd@dbsarc.com", "wsh@dbsarc.com", "fsh@dbsarc.com",
    "jz@dbsarc.com", "imd@dbsarc.com", "pz@dbsarc.com", "col@dbsarc.com",
    "ev@dbsarc.com",
  ];
  await prisma.user.updateMany({
    where: { email: { in: legacyEmails } },
    data: { isActive: false, employmentStatus: "terminated" },
  });
  console.log(`Deactivated ${legacyEmails.length} legacy placeholder users`);

  // Upsert team
  const demoPassword = await bcrypt.hash("dbs2025", 10);
  const userIdByEmail = new Map<string, string>();

  for (const m of TEAM) {
    const e = email(m.first, m.last);
    const loc = OFFICE_LOC[m.office];
    const user = await prisma.user.upsert({
      where: { email: e },
      update: {
        name: `${m.first} ${m.last}`,
        initials: initials(m.first, m.last),
        role: m.role,
        isActive: true,
        employmentStatus: "active",
        defaultCountry: loc.country,
        defaultRegion: loc.region,
      },
      create: {
        email: e,
        name: `${m.first} ${m.last}`,
        password: demoPassword,
        role: m.role,
        initials: initials(m.first, m.last),
        isActive: true,
        canCreate: m.role !== "employee",
        canEdit: true,
        canDelete: m.role === "director",
        employmentStatus: "active",
        defaultCountry: loc.country,
        defaultRegion: loc.region,
      },
    });
    userIdByEmail.set(e, user.id);
  }
  console.log(`Upserted ${TEAM.length} real team members`);

  // Upsert projects
  const yearCounters = new Map<number, number>();
  for (const p of PROJECTS) {
    const n = (yearCounters.get(p.year) ?? 0) + 1;
    yearCounters.set(p.year, n);
    const code = `DBS-${p.year}-${String(n).padStart(3, "0")}`;

    const country = countryOf(p.location);
    const coords = COORDS[p.city] ?? null;
    const typology = p.tags.join(", ");
    const category = mapCategory(p.tags);
    const phase = mapPhase(p.status);

    await prisma.project.upsert({
      where: { code },
      update: {
        title: p.title,
        category,
        phase,
        year: p.year,
        commune: p.city,
        typology,
        country,
        operatingRegion: country === "CH" ? "Valais" : undefined,
        regionCode: country === "CH" ? "CH-VS" : undefined,
        address: p.location,
        latitude: coords?.[0] ?? null,
        longitude: coords?.[1] ?? null,
        status: "active",
        workStatus: p.status === "Built" ? "done" : p.status === "Planned" ? "doing" : "todo",
      },
      create: {
        code,
        title: p.title,
        category,
        phase,
        year: p.year,
        commune: p.city,
        typology,
        country,
        operatingRegion: country === "CH" ? "Valais" : undefined,
        regionCode: country === "CH" ? "CH-VS" : undefined,
        address: p.location,
        latitude: coords?.[0] ?? null,
        longitude: coords?.[1] ?? null,
        status: "active",
        workStatus: p.status === "Built" ? "done" : p.status === "Planned" ? "doing" : "todo",
      },
    });
  }
  console.log(`Upserted ${PROJECTS.length} real projects`);

  // Assign directors to every active project (they oversee everything)
  const directors = Array.from(userIdByEmail.entries())
    .filter(([e]) => e === email("Giulio", "Sovran") || e === email("Luigi", "Di Berardino"))
    .map(([, id]) => id);
  const activeProjects = await prisma.project.findMany({
    where: { workStatus: { in: ["doing", "todo"] } },
    select: { id: true },
  });
  let assignCount = 0;
  for (const proj of activeProjects) {
    for (const uid of directors) {
      const existing = await prisma.projectAssignment.findUnique({
        where: { projectId_userId: { projectId: proj.id, userId: uid } },
      });
      if (!existing) {
        await prisma.projectAssignment.create({
          data: { projectId: proj.id, userId: uid, role: "director" },
        });
        assignCount++;
      }
    }
  }

  // Spread remaining ~30 team across ongoing projects (round-robin managers + architects)
  const workers = TEAM.filter((t) => t.role !== "director")
    .map((t) => userIdByEmail.get(email(t.first, t.last))!)
    .filter(Boolean);
  let idx = 0;
  for (const proj of activeProjects) {
    const pick = [workers[idx % workers.length], workers[(idx + 1) % workers.length]];
    idx += 2;
    for (const uid of pick) {
      const existing = await prisma.projectAssignment.findUnique({
        where: { projectId_userId: { projectId: proj.id, userId: uid } },
      });
      if (!existing) {
        await prisma.projectAssignment.create({
          data: { projectId: proj.id, userId: uid, role: "architect" },
        });
        assignCount++;
      }
    }
  }
  console.log(`Created ${assignCount} project assignments`);

  console.log("\n✓ Done");
  console.log("Demo login for real team: <slug>@dbsarc.com / dbs2025");
  console.log("  e.g. giulio.sovran@dbsarc.com / dbs2025");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
