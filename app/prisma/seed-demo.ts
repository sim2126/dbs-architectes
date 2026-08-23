/**
 * Demo seed — invented data covering every role and every surface.
 *
 * Replaces the previous seed, which carried real DBS staff names and project
 * titles scraped from dbsarc.com. That data was never provided by the client,
 * and holding real people's names with inferred email addresses in a demo
 * database is a privacy exposure with no upside. Everything here is invented.
 *
 * Design goals:
 *   1. One predictable login per role, so every view can be demonstrated.
 *   2. Activity in every time bucket — overdue, today, this week, later,
 *      undated — so My Work and the dashboard are never empty.
 *   3. Enough spread across phases, countries and health states that the
 *      map, statistics and workload views all have something to show.
 *
 * Idempotent: upserts by natural key, so re-running does not duplicate.
 * Destructive only where stated — see wipeSeededData().
 *
 *   npx tsx prisma/seed-demo.ts
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import ws from "ws";
import { assertSafeDemoSeedTarget } from "./seed-safety";

// Prisma 7 requires a driver adapter; matching prisma/seed.ts exactly so
// there is one way this project connects from a script.
const seedTarget = assertSafeDemoSeedTarget();
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: seedTarget.connectionString });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "dbs2025";

/** Every role authorize() recognises, plus intern. One demo account each,
 *  at a predictable address so a demo never needs a lookup. */
const ROLE_ACCOUNTS: Array<{
  role: string;
  email: string;
  name: string;
  initials: string;
  jobTitle: string;
  country: string;
}> = [
  { role: "super_admin",     email: "owner@dbsarc.com",     name: "Alice Renaud",      initials: "AR", jobTitle: "Founding Partner",     country: "CH" },
  { role: "admin",           email: "admin@dbsarc.com",     name: "Bruno Casale",      initials: "BC", jobTitle: "Studio Administrator", country: "CH" },
  { role: "director",        email: "director@dbsarc.com",  name: "Clara Bettini",     initials: "CB", jobTitle: "Design Director",      country: "IT" },
  { role: "manager",         email: "manager@dbsarc.com",   name: "Denis Favre",       initials: "DF", jobTitle: "Studio Manager",       country: "CH" },
  { role: "project_manager", email: "pm@dbsarc.com",        name: "Elena Moretti",     initials: "EM", jobTitle: "Project Manager",      country: "IT" },
  { role: "employee",        email: "employee@dbsarc.com",  name: "Florian Aebi",      initials: "FA", jobTitle: "Architect",            country: "CH" },
  { role: "collaborator",    email: "partner@dbsarc.com",   name: "Gita Raman",        initials: "GR", jobTitle: "External Collaborator", country: "IN" },
  { role: "intern",          email: "intern@dbsarc.com",    name: "Hugo Delacroix",    initials: "HD", jobTitle: "Architecture Intern",  country: "CH" },
  { role: "viewer",          email: "viewer@dbsarc.com",    name: "Irene Pfister",     initials: "IP", jobTitle: "Client Representative", country: "CH" },
];

/** A wider cast so rosters, workload and assignee pickers look inhabited. */
const TEAM: Array<{ name: string; initials: string; role: string; country: string; jobTitle: string }> = [
  { name: "Jonas Widmer",    initials: "JW", role: "employee",        country: "CH", jobTitle: "Architect" },
  { name: "Katia Lombardi",  initials: "KL", role: "employee",        country: "IT", jobTitle: "Architect" },
  { name: "Luca Bianchi",    initials: "LB", role: "employee",        country: "IT", jobTitle: "Technician" },
  { name: "Maya Schaller",   initials: "MS", role: "employee",        country: "CH", jobTitle: "Architect" },
  { name: "Nadia Oberson",   initials: "NO", role: "project_manager", country: "CH", jobTitle: "Project Manager" },
  { name: "Omar Haddad",     initials: "OH", role: "employee",        country: "CH", jobTitle: "Draughtsperson" },
  { name: "Petra Nowak",     initials: "PN", role: "employee",        country: "IT", jobTitle: "Interior Architect" },
  { name: "Quentin Roulin",  initials: "QR", role: "intern",          country: "CH", jobTitle: "Architecture Intern" },
  { name: "Rina Kapoor",     initials: "RK", role: "collaborator",    country: "IN", jobTitle: "Visualisation Artist" },
  { name: "Silvio Ferrari",  initials: "SF", role: "employee",        country: "IT", jobTitle: "Site Architect" },
  { name: "Tanja Brunner",   initials: "TB", role: "manager",         country: "CH", jobTitle: "Delivery Manager" },
  { name: "Ugo Marchetti",   initials: "UM", role: "employee",        country: "IT", jobTitle: "Architect" },
  { name: "Vera Steiner",    initials: "VS", role: "director",        country: "CH", jobTitle: "Technical Director" },
  { name: "Wassim Trabelsi", initials: "WT", role: "employee",        country: "CH", jobTitle: "Architect" },
  { name: "Yara Costa",      initials: "YC", role: "intern",          country: "IT", jobTitle: "Architecture Intern" },
  { name: "Zoe Kaufmann",    initials: "ZK", role: "viewer",          country: "CH", jobTitle: "Client Representative" },
];

const WORK_STATUSES = ["todo", "doing", "stuck", "completed"] as const;

/** Invented projects. Communes are real Swiss/Italian places — a plausible
 *  geography makes the map and region filters meaningful — but every project
 *  title, client and code is fictional. */
const PROJECTS: Array<{
  title: string; commune: string; country: string; region: string;
  year: number; phase: string; category: string; client: string;
}> = [
  { title: "Résidence Belvédère",        commune: "Sion",          country: "CH", region: "Valais",    year: 2026, phase: "ETUDE/AP",     category: "Residenziale", client: "Belvédère SA" },
  { title: "Ateliers du Rhône",          commune: "Martigny",      country: "CH", region: "Valais",    year: 2026, phase: "MAE",          category: "Commerciale",  client: "Rhône Industries" },
  { title: "École des Vergers",          commune: "Conthey",       country: "CH", region: "Valais",    year: 2026, phase: "CHANTIER",     category: "Pubblico",     client: "Commune de Conthey" },
  { title: "Villa Mirasole",             commune: "Sierre",        country: "CH", region: "Valais",    year: 2025, phase: "EXE/DG/DV/3D", category: "Residenziale", client: "Private" },
  { title: "Palazzo Sant'Orso",          commune: "Milano",        country: "IT", region: "Lombardia", year: 2025, phase: "CHANTIER",     category: "Commerciale",  client: "Sant'Orso Srl" },
  { title: "Corte delle Magnolie",       commune: "Bergamo",       country: "IT", region: "Lombardia", year: 2025, phase: "MAE",          category: "Residenziale", client: "Magnolie Immobiliare" },
  { title: "Biblioteca Verdi",           commune: "Como",          country: "IT", region: "Lombardia", year: 2024, phase: "TERMINATO",    category: "Pubblico",     client: "Comune di Como" },
  { title: "Chalet Grande Dixence",      commune: "Hérémence",     country: "CH", region: "Valais",    year: 2024, phase: "TERMINATO",    category: "Residenziale", client: "Private" },
  { title: "Halle Polyvalente Nendaz",   commune: "Nendaz",        country: "CH", region: "Valais",    year: 2026, phase: "CONCORSO",     category: "Concorso",     client: "Commune de Nendaz" },
  { title: "Loft Navigli",               commune: "Milano",        country: "IT", region: "Lombardia", year: 2026, phase: "ETUDE/AP",     category: "Interni",      client: "Private" },
  { title: "Clinique du Léman",          commune: "Montreux",      country: "CH", region: "Vaud",      year: 2026, phase: "STUCK",        category: "Pubblico",     client: "Groupe Léman" },
  { title: "Terrazze di Lugano",         commune: "Lugano",        country: "CH", region: "Ticino",    year: 2025, phase: "CHANTIER",     category: "Residenziale", client: "Terrazze Holding" },
  { title: "Marché Couvert Aigle",       commune: "Aigle",         country: "CH", region: "Vaud",      year: 2025, phase: "MAE",          category: "Commerciale",  client: "Ville d'Aigle" },
  { title: "Casa Rovere",                commune: "Varese",        country: "IT", region: "Lombardia", year: 2024, phase: "TERMINATO",    category: "Residenziale", client: "Private" },
  { title: "Studio Aurora",              commune: "Torino",        country: "IT", region: "Piemonte",  year: 2026, phase: "ETUDE/AP",     category: "Interni",      client: "Aurora Media" },
  { title: "Pavillon des Bains",         commune: "Saillon",       country: "CH", region: "Valais",    year: 2026, phase: "EXE/DG/DV/3D", category: "Pubblico",     client: "Bains de Saillon" },
  { title: "Residenza Olivo",            commune: "Brescia",       country: "IT", region: "Lombardia", year: 2025, phase: "CHANTIER",     category: "Residenziale", client: "Olivo Costruzioni" },
  { title: "Foyer Saint-Guérin",         commune: "Sion",          country: "CH", region: "Valais",    year: 2024, phase: "TERMINATO",    category: "Pubblico",     client: "Fondation Saint-Guérin" },
  { title: "Kashmir Craft Centre",       commune: "Srinagar",      country: "IN", region: "Kashmir",   year: 2026, phase: "ETUDE/AP",     category: "Pubblico",     client: "Craft Council" },
  { title: "Atelier Verbier",            commune: "Verbier",       country: "CH", region: "Valais",    year: 2026, phase: "MAE",          category: "Interni",      client: "Private" },
  { title: "Cascina Bruzzano",           commune: "Milano",        country: "IT", region: "Lombardia", year: 2025, phase: "STUCK",        category: "Residenziale", client: "Bruzzano SpA" },
  { title: "Gare Routière Fully",        commune: "Fully",         country: "CH", region: "Valais",    year: 2026, phase: "CONCORSO",     category: "Concorso",     client: "Commune de Fully" },
  { title: "Corte Serena",               commune: "Monza",         country: "IT", region: "Lombardia", year: 2024, phase: "TERMINATO",    category: "Residenziale", client: "Serena Immobiliare" },
  { title: "Refuge de Moiry",            commune: "Grimentz",      country: "CH", region: "Valais",    year: 2026, phase: "EXE/DG/DV/3D", category: "Pubblico",     client: "Club Alpin" },
];

function slugEmail(name: string): string {
  return `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".")}@dbsarc.com`;
}

/** Days from today, as a UTC-midnight date. Matches the grouping module's
 *  UTC day boundaries so demo items land in the bucket they are meant to. */
function dayOffset(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Removes previously-seeded content so re-seeding does not layer demo data
 * on top of the scraped set. Order respects foreign keys.
 *
 * Deliberately explicit rather than a truncate-everything. This includes auth
 * artefacts because their users are replaced; the surrounding transaction
 * restores both the old data and its sessions if seeding fails.
 */
async function wipeSeededData(prisma: Prisma.TransactionClient) {
  // Order matters: children before parents. Not every relation cascades, so
  // a missing table here surfaces as a P2003 foreign-key violation on the
  // user delete rather than something subtler.
  await prisma.messageReaction.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.channelMember.deleteMany({});
  await prisma.channel.deleteMany({});

  await prisma.callParticipant.deleteMany({});
  await prisma.call.deleteMany({});

  await prisma.workItem.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.agendaItem.deleteMany({});

  await prisma.projectStatusUpdate.deleteMany({});
  await prisma.projectAssignment.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.favorite.deleteMany({});
  await prisma.sheet.deleteMany({});

  await prisma.savedAiResponse.deleteMany({});
  await prisma.aiChatSession.deleteMany({});

  await prisma.permissionGrant.deleteMany({});
  await prisma.userRegionAccess.deleteMany({});
  await prisma.roleChangeLog.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.googleCalendarToken.deleteMany({});
  await prisma.passwordReset.deleteMany({});

  // Auth artefacts. Clearing these signs everyone out, which is correct —
  // the accounts they point at are about to stop existing.
  await prisma.userSession.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});

  await prisma.project.deleteMany({});
  // Users last — everything above references them.
  await prisma.user.deleteMany({});
}

async function seedDatabase(prisma: Prisma.TransactionClient) {
  console.log(`Wiping previously-seeded content on ${seedTarget.identifier}…`);
  await wipeSeededData(prisma);

  const password = await bcrypt.hash(PASSWORD, 10);

  console.log("Seeding role accounts…");
  const roleUsers = [];
  for (const a of ROLE_ACCOUNTS) {
    roleUsers.push(
      await prisma.user.create({
        data: {
          email: a.email,
          name: a.name,
          initials: a.initials,
          role: a.role,
          defaultCountry: a.country,
          password,
          isActive: true,
          // Legacy convenience flags, derived so they agree with the role.
          canCreate: ["super_admin", "admin", "director", "manager", "project_manager"].includes(a.role),
          canEdit: a.role !== "viewer" && a.role !== "intern",
          canDelete: ["super_admin", "admin"].includes(a.role),
        },
      }),
    );
  }

  console.log("Seeding wider team…");
  const teamUsers = [];
  for (const t of TEAM) {
    teamUsers.push(
      await prisma.user.create({
        data: {
          email: slugEmail(t.name),
          name: t.name,
          initials: t.initials,
          role: t.role,
          defaultCountry: t.country,
          password,
          isActive: true,
          canCreate: ["director", "manager", "project_manager"].includes(t.role),
          canEdit: t.role !== "viewer" && t.role !== "intern",
          canDelete: false,
        },
      }),
    );
  }

  const allUsers = [...roleUsers, ...teamUsers];
  const byRole = (role: string) => allUsers.filter((u) => u.role === role);
  const assignable = allUsers.filter((u) => u.role !== "viewer");

  console.log("Seeding projects…");
  const yearCounters = new Map<number, number>();
  const projects = [];
  for (const p of PROJECTS) {
    const seq = (yearCounters.get(p.year) ?? 0) + 1;
    yearCounters.set(p.year, seq);
    projects.push(
      await prisma.project.create({
        data: {
          code: `DBS-${p.year}-${String(seq).padStart(3, "0")}`,
          title: p.title,
          category: p.category,
          phase: p.phase,
          workStatus:
            p.phase === "TERMINATO" ? "completed" : p.phase === "STUCK" ? "stuck" : "doing",
          client: p.client,
          commune: p.commune,
          country: p.country,
          operatingRegion: p.region,
          year: p.year,
          billing: p.phase === "TERMINATO" ? "Settled" : "In progress",
          notes: null,
        },
      }),
    );
  }

  console.log("Assigning teams…");
  // Every project gets a lead plus two to four others, so workload and the
  // assignee pickers are populated and no project is orphaned.
  const ASSIGNMENT_ROLES = ["lead", "editor", "reviewer", "viewer"];
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const size = 3 + (i % 3);
    for (let j = 0; j < size; j++) {
      const user = assignable[(i * 3 + j) % assignable.length];
      await prisma.projectAssignment.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: j === 0 ? "lead" : ASSIGNMENT_ROLES[j % ASSIGNMENT_ROLES.length],
        },
      });
    }
  }

  // Viewers get read-only access to a couple of projects. They own no work
  // items — a client representative has visibility, not a workload — but a
  // viewer with no assignments at all sees an empty product, which makes
  // the role impossible to demonstrate.
  const viewers = byRole("viewer");
  for (let i = 0; i < viewers.length; i++) {
    for (const project of [projects[i % projects.length], projects[(i + 5) % projects.length]]) {
      await prisma.projectAssignment.create({
        data: { projectId: project.id, userId: viewers[i].id, role: "viewer" },
      });
    }
  }

  console.log("Seeding work items across every time bucket…");
  // Offsets deliberately span the grouping module's buckets so My Work is
  // never empty and every bucket is demonstrable, including "No date".
  const OFFSETS: Array<number | null> = [-9, -4, -1, 0, 0, 2, 5, 6, 12, 40, null];
  const TITLES = [
    "Review structural drawings",
    "Coordinate with the engineer",
    "Prepare permit submission",
    "Site visit and photo record",
    "Update client on the programme",
    "Issue tender documents",
    "Check façade detail",
    "Confirm material samples",
    "Draft phase report",
    "Chase contractor response",
    "Revise floor plans",
  ];
  let itemCount = 0;
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    if (project.phase === "TERMINATO") continue;
    for (let j = 0; j < 4; j++) {
      const owner = assignable[(i * 2 + j) % assignable.length];
      const offset = OFFSETS[(i * 4 + j) % OFFSETS.length];
      await prisma.workItem.create({
        data: {
          userId: owner.id,
          projectId: project.id,
          title: TITLES[(i + j) % TITLES.length],
          type: j === 3 ? "meeting" : "task",
          status: WORK_STATUSES[(i + j) % 3],
          priority: ["low", "medium", "high", "critical"][(i + j) % 4],
          dueDate: offset === null ? null : dayOffset(offset),
          position: j,
        },
      });
      itemCount++;
    }
  }

  console.log("Seeding status updates…");
  const HEALTH = ["on_track", "at_risk", "off_track"] as const;
  const leads = [...byRole("project_manager"), ...byRole("manager"), ...byRole("director")];
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const author = leads[i % leads.length];
    if (!author) break;
    const health =
      project.phase === "STUCK" ? "off_track" : HEALTH[i % HEALTH.length];
    await prisma.projectStatusUpdate.create({
      data: {
        projectId: project.id,
        authorId: author.id,
        health,
        summary:
          health === "off_track"
            ? "Awaiting a decision from the client before the next phase can start."
            : health === "at_risk"
              ? "Programme is tight; the permit response is the critical path."
              : "Progressing to programme with no open blockers.",
        next: "Confirm the next coordination meeting.",
        blockers: health === "on_track" ? null : "Pending external response.",
        createdAt: dayOffset(-(i % 14)),
      },
    });
  }

  console.log("Seeding channels and messages…");
  const owner = roleUsers[0];
  // One workspace-wide channel, plus a project channel per project. Project
  // channels carry projectId so visibility follows assignment rather than a
  // mirrored membership row.
  const general = await prisma.channel.create({
    data: { name: "general", type: "public", createdBy: owner.id, description: "Studio-wide announcements" },
  });
  for (const u of allUsers) {
    await prisma.channelMember.create({ data: { channelId: general.id, userId: u.id, role: "member" } });
  }
  const GENERAL_MESSAGES = [
    "Morning. Reminder that the studio review moves to Thursday this week.",
    "Material samples for the façade are in the meeting room if anyone wants a look.",
    "Permit portal is down for maintenance until midday.",
    "Welcome to the two new interns joining the Sion office this week.",
  ];
  for (let i = 0; i < GENERAL_MESSAGES.length; i++) {
    await prisma.message.create({
      data: {
        channelId: general.id,
        userId: allUsers[i % allUsers.length].id,
        content: GENERAL_MESSAGES[i],
        createdAt: dayOffset(-(GENERAL_MESSAGES.length - i)),
      },
    });
  }

  let threadCount = 0;
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const assignments = await prisma.projectAssignment.findMany({
      where: { projectId: project.id },
      select: { userId: true },
    });
    if (assignments.length === 0) continue;

    const channel = await prisma.channel.create({
      data: {
        name: project.code,
        type: "project",
        createdBy: assignments[0].userId,
        projectId: project.id,
        description: project.title,
      },
    });
    for (const a of assignments) {
      await prisma.channelMember.create({
        data: { channelId: channel.id, userId: a.userId, role: "member" },
      });
    }

    const parent = await prisma.message.create({
      data: {
        channelId: channel.id,
        userId: assignments[0].userId,
        content: `Kicking off coordination for ${project.title}. Drawings are in the shared folder — comments by Friday please.`,
        createdAt: dayOffset(-(3 + (i % 5))),
      },
    });
    // A couple of projects get a real thread so the thread panel and its
    // task-conversion action have something to open onto.
    if (i % 4 === 0 && assignments.length > 1) {
      for (let r = 0; r < 2; r++) {
        await prisma.message.create({
          data: {
            channelId: channel.id,
            userId: assignments[(r + 1) % assignments.length].userId,
            content:
              r === 0
                ? "Looked through them. The stair core needs another look before we issue."
                : "Agreed. I will mark it up and send back tomorrow.",
            parentId: parent.id,
            createdAt: dayOffset(-(2 + (i % 4))),
          },
        });
      }
      threadCount++;
    }
  }

  console.log("");
  console.log("Demo data seeded.");
  console.log(`  users        ${allUsers.length}`);
  console.log(`  projects     ${projects.length}`);
  console.log(`  work items   ${itemCount}`);
  console.log(`  threads      ${threadCount}`);
  console.log("");
  console.log(`All accounts use the password: ${PASSWORD}`);
  console.log("Role logins:");
  for (const a of ROLE_ACCOUNTS) {
    console.log(`  ${a.role.padEnd(16)} ${a.email}`);
  }
}

async function main() {
  await prisma.$transaction(seedDatabase, {
    maxWait: 10_000,
    timeout: 120_000,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
