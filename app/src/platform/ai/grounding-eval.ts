import type { AiSurface, GroundingContract, GroundingDataSource } from "./grounding";
import { resolveGrounding } from "./grounding";

/**
 * Offline projection of the complete real roster and project catalogue in
 * prisma/seed-dbsarc.ts. IDs are deterministic eval-only identifiers derived
 * from the seeded email addresses and project codes; no customer facts are
 * invented and no database connection is made.
 */
const SEEDED_TEAM = [
  ["Giulio Sovran", "giulio.sovran@dbsarc.com", "GS"],
  ["Luigi Di Berardino", "luigi.di.berardino@dbsarc.com", "LD"],
  ["Gianmarco Lapolla", "gianmarco.lapolla@dbsarc.com", "GL"],
  ["Florencia Schilling", "florencia.schilling@dbsarc.com", "FS"],
  ["Michele Moretti", "michele.moretti@dbsarc.com", "MM"],
  ["Ali Reza Hakim", "ali.reza.hakim@dbsarc.com", "AH"],
  ["Natalia Rincón", "natalia.rincon@dbsarc.com", "NR"],
  ["Giuseppe Marchica", "giuseppe.marchica@dbsarc.com", "GM"],
  ["Marco Iebba", "marco.iebba@dbsarc.com", "MI"],
  ["Erica Vidale", "erica.vidale@dbsarc.com", "EV"],
  ["Petko Slavov", "petko.slavov@dbsarc.com", "PS"],
  ["Noemi Verga", "noemi.verga@dbsarc.com", "NV"],
  ["Arnaud Zbinden", "arnaud.zbinden@dbsarc.com", "AZ"],
  ["Elodie G. Martins", "elodie.g.martins@dbsarc.com", "EG"],
  ["Edoardo Bernasconi", "edoardo.bernasconi@dbsarc.com", "EB"],
  ["Adriana Bakalyar", "adriana.bakalyar@dbsarc.com", "AB"],
  ["Nicolò Viozzi", "nicolo.viozzi@dbsarc.com", "NV"],
  ["Michèle Jemini", "michele.jemini@dbsarc.com", "MJ"],
  ["Juan Zamudio", "juan.zamudio@dbsarc.com", "JZ"],
  ["Daniel Siado", "daniel.siado@dbsarc.com", "DS"],
  ["Paul Perez", "paul.perez@dbsarc.com", "PP"],
  ["Valentina Poveda", "valentina.poveda@dbsarc.com", "VP"],
  ["Ausaf Syed", "ausaf.syed@dbsarc.com", "AS"],
  ["Shahran Rashid", "shahran.rashid@dbsarc.com", "SR"],
  ["Wasim Showkat", "wasim.showkat@dbsarc.com", "WS"],
  ["Moiz Behzad Khan", "moiz.behzad.khan@dbsarc.com", "MK"],
  ["Shahid Qayoom", "shahid.qayoom@dbsarc.com", "SQ"],
  ["Sergio Facchetti", "sergio.facchetti@dbsarc.com", "SF"],
  ["Sylvie Sarrassin", "sylvie.sarrassin@dbsarc.com", "SS"],
  ["Anaïs Morceau", "anais.morceau@dbsarc.com", "AM"],
] as const;

const SEEDED_PROJECTS = [
  ["DBS-2025-001", "Le Saillen", "ETUDE/AP", "Salins"],
  ["DBS-2025-002", "Plan Conthey Udry", "ETUDE/AP", "Conthey"],
  ["DBS-2025-003", "Le Hameau", "ETUDE/AP", "Grimisuat"],
  ["DBS-2024-001", "Kalush City Center", "ETUDE/AP", "Ukraine"],
  ["DBS-2024-002", "Lamberson Buildings", "TERMINATO", "Sierre"],
  ["DBS-2024-003", "Oscar Bider", "TERMINATO", "Sion"],
  ["DBS-2023-001", "Sierre Bourg", "TERMINATO", "Sierre"],
  ["DBS-2023-002", "Banque Cantonale du Valais", "TERMINATO", "Sion"],
  ["DBS-2023-003", "Corin Raye Apartments", "TERMINATO", "Corin"],
  ["DBS-2023-004", "Savioz House", "TERMINATO", "Uvrier"],
  ["DBS-2023-005", "Maurice Building", "TERMINATO", "Sion"],
  ["DBS-2023-006", "Clerc House", "TERMINATO", "Aproz"],
  ["DBS-2023-007", "Healing Resort", "ETUDE/AP", "Kashmir"],
  ["DBS-2023-008", "Priotto – 2 apartments", "TERMINATO", "St-Romain"],
  ["DBS-2022-001", "6 Houses in Ollon (VD)", "TERMINATO", "Ollon"],
  ["DBS-2022-002", "Riddes Buildings", "TERMINATO", "Riddes"],
  ["DBS-2022-003", "Tsampy Houses", "TERMINATO", "Luc"],
  ["DBS-2022-004", "Fontanay Building – 3 apartments", "TERMINATO", "Venthône"],
  ["DBS-2021-001", "Crans Villa", "TERMINATO", "Crans Montana"],
  ["DBS-2021-002", "Reynard House", "TERMINATO", "Blignou/Ayent"],
  ["DBS-2021-003", "Fortunau – 2 apartments", "TERMINATO", "Fortunau"],
  ["DBS-2021-004", "Fersini House", "TERMINATO", "Noës/Sierre"],
  ["DBS-2021-005", "Fortunau Houses", "TERMINATO", "Fortunau"],
  ["DBS-2021-006", "Luc Tsampy Building", "TERMINATO", "Luc"],
  ["DBS-2021-007", "Evionnaz Houses", "TERMINATO", "Evionnaz"],
  ["DBS-2021-008", "Blignou Houses", "TERMINATO", "Blignou/Ayent"],
  ["DBS-2021-009", "Poteu Building", "TERMINATO", "Chamoson"],
  ["DBS-2020-001", "Luisiana Building – 2 apartments", "TERMINATO", "Salins"],
  ["DBS-2020-002", "Condémines House", "TERMINATO", "Grimisuat"],
  ["DBS-2020-003", "St-Léonard Houses", "TERMINATO", "St-Léonard"],
  ["DBS-2020-004", "Tsânio Houses", "TERMINATO", "Grimisuat"],
  ["DBS-2020-005", "Monnat – 6 apartments", "TERMINATO", "Leytron"],
  ["DBS-2020-006", "Corbaraye House", "TERMINATO", "Ayent"],
  ["DBS-2020-007", "Grimisuat Houses", "TERMINATO", "Grimisuat"],
  ["DBS-2020-008", "Tsânio House", "TERMINATO", "Grimisuat"],
  ["DBS-2019-001", "Blignou Houses (2019)", "TERMINATO", "Blignou"],
  ["DBS-2019-002", "Mazette Building – 7 apartments", "TERMINATO", "Turin"],
  ["DBS-2019-003", "St. Romain (Houses)", "TERMINATO", "St. Romain"],
  ["DBS-2018-001", "Crans Carlton", "TERMINATO", "Crans Montana"],
  ["DBS-2017-001", "Sierre's House", "TERMINATO", "Sierre"],
  ["DBS-2017-002", "Pitteloud House", "TERMINATO", "St Léonard"],
  ["DBS-2017-003", "Bex Salvat Houses", "TERMINATO", "Bex"],
  ["DBS-2017-004", "Chalet in Villars-sur-Ollon", "TERMINATO", "Ollon"],
  ["DBS-2016-001", "Brice's Garden – 11 apartments", "TERMINATO", "Nendaz"],
  ["DBS-2016-002", "Transformation of a Historic Building – 7 apartments", "TERMINATO", "Martigny"],
  ["DBS-2015-001", "Mayoraz house", "TERMINATO", "Salins"],
  ["DBS-2015-002", "Laurina Building – 13 apartments", "TERMINATO", "Chalais"],
  ["DBS-2015-003", "Solaris", "TERMINATO", "Sion"],
] as const;

function userFixtureId(email: string): string {
  return `fixture-user:${email}`;
}

function projectFixtureId(code: string): string {
  return `fixture-project:${code}`;
}

const fixtureDataSource: GroundingDataSource = {
  listUsers: () => Promise.resolve(
    SEEDED_TEAM.map(([name, email, initials]) => ({
      id: userFixtureId(email),
      name,
      email,
      initials,
    })),
  ),
  listProjects: () => Promise.resolve(
    SEEDED_PROJECTS.map(([code, title, phase, commune]) => ({
      id: projectFixtureId(code),
      code,
      title,
      phase,
      client: null,
      commune,
    })),
  ),
  listMeetingMemories: () => Promise.resolve([]),
};

interface EvalCase {
  id: string;
  surface: AiSurface;
  prompt: string;
  userEmail: string;
  projectCode: string;
}

function evalCase(
  id: string,
  surface: AiSurface,
  prompt: string,
  userEmail: string,
  projectCode: string,
): EvalCase {
  return { id, surface, prompt, userEmail, projectCode };
}

const EVAL_CASES: readonly EvalCase[] = [
  evalCase("meeting-01", "meeting-summary", "Giulio Sovran opened the Le Saillen design review.", "giulio.sovran@dbsarc.com", "DBS-2025-001"),
  evalCase("meeting-02", "meeting-summary", "Luigi Di Berardino confirmed the Plan Conthey Udry minutes.", "luigi.di.berardino@dbsarc.com", "DBS-2025-002"),
  evalCase("meeting-03", "meeting-summary", "Natalia Rincon presented the Lamberson Buildings update.", "natalia.rincon@dbsarc.com", "DBS-2024-002"),
  evalCase("meeting-04", "meeting-summary", "Ali Reza Hakim reviewed DBS-2024-003 with the team.", "ali.reza.hakim@dbsarc.com", "DBS-2024-003"),
  evalCase("meeting-05", "meeting-summary", "Gianmarco Lapolla recorded a decision for Banque Cantonale du Valais.", "gianmarco.lapolla@dbsarc.com", "DBS-2023-002"),
  evalCase("meeting-06", "meeting-summary", "Florencia Schilling raised a risk on Healing Resort.", "florencia.schilling@dbsarc.com", "DBS-2023-007"),
  evalCase("meeting-07", "meeting-summary", "Marco Iebba owns the follow-up for Riddes Buildings.", "marco.iebba@dbsarc.com", "DBS-2022-002"),
  evalCase("meeting-08", "meeting-summary", "Nicolo Viozzi discussed the Condemines House programme.", "nicolo.viozzi@dbsarc.com", "DBS-2020-002"),
  evalCase("meeting-09", "meeting-summary", "Anais Morceau will circulate the Crans Carlton notes.", "anais.morceau@dbsarc.com", "DBS-2018-001"),
  evalCase("meeting-10", "meeting-summary", "Sergio Facchetti presented visuals for DBS-2019-002.", "sergio.facchetti@dbsarc.com", "DBS-2019-002"),

  evalCase("gpt-01", "dbs-gpt", "Show Giulio's current work on Le Hameau.", "giulio.sovran@dbsarc.com", "DBS-2025-003"),
  evalCase("gpt-02", "dbs-gpt", "What is Luigi Di Berardino doing on DBS-2024-001?", "luigi.di.berardino@dbsarc.com", "DBS-2024-001"),
  evalCase("gpt-03", "dbs-gpt", "Summarise Michele Moretti's actions for Sierre Bourg.", "michele.moretti@dbsarc.com", "DBS-2023-001"),
  evalCase("gpt-04", "dbs-gpt", "Find the Savioz House items assigned to Erica Vidale.", "erica.vidale@dbsarc.com", "DBS-2023-004"),
  evalCase("gpt-05", "dbs-gpt", "List Ali Reza Hakim's blockers for Maurice Building.", "ali.reza.hakim@dbsarc.com", "DBS-2023-005"),
  evalCase("gpt-06", "dbs-gpt", "Open Clerc House context for Giuseppe Marchica.", "giuseppe.marchica@dbsarc.com", "DBS-2023-006"),
  evalCase("gpt-07", "dbs-gpt", "What did Petko Slavov update on 6 Houses in Ollon (VD)?", "petko.slavov@dbsarc.com", "DBS-2022-001"),
  evalCase("gpt-08", "dbs-gpt", "Show Arnaud Zbinden the Fontanay Building - 3 apartments record.", "arnaud.zbinden@dbsarc.com", "DBS-2022-004"),
  evalCase("gpt-09", "dbs-gpt", "Compare Natalia's notes with DBS-2021-001.", "natalia.rincon@dbsarc.com", "DBS-2021-001"),
  evalCase("gpt-10", "dbs-gpt", "Retrieve Reynard House for florencia.schilling@dbsarc.com.", "florencia.schilling@dbsarc.com", "DBS-2021-002"),

  evalCase("agent-01", "chat-agent", "Ask Juan Zamudio about Fortunau - 2 apartments.", "juan.zamudio@dbsarc.com", "DBS-2021-003"),
  evalCase("agent-02", "chat-agent", "Daniel Siado needs the Fersini House thread.", "daniel.siado@dbsarc.com", "DBS-2021-004"),
  evalCase("agent-03", "chat-agent", "Find Fortunau Houses messages from Paul Perez.", "paul.perez@dbsarc.com", "DBS-2021-005"),
  evalCase("agent-04", "chat-agent", "Valentina Poveda asked about Luc Tsampy Building.", "valentina.poveda@dbsarc.com", "DBS-2021-006"),
  evalCase("agent-05", "chat-agent", "Show Ausaf Syed the Evionnaz Houses activity.", "ausaf.syed@dbsarc.com", "DBS-2021-007"),
  evalCase("agent-06", "chat-agent", "Shahran Rashid is reviewing DBS-2021-008.", "shahran.rashid@dbsarc.com", "DBS-2021-008"),
  evalCase("agent-07", "chat-agent", "Wasim Showkat needs the Poteu Building deadline.", "wasim.showkat@dbsarc.com", "DBS-2021-009"),
  evalCase("agent-08", "chat-agent", "Open Luisiana Building - 2 apartments for Moiz Behzad Khan.", "moiz.behzad.khan@dbsarc.com", "DBS-2020-001"),
  evalCase("agent-09", "chat-agent", "Shahid Qayoom updated St-Leonard Houses.", "shahid.qayoom@dbsarc.com", "DBS-2020-003"),
  evalCase("agent-10", "chat-agent", "Edoardo Bernasconi mentioned Tsanio Houses.", "edoardo.bernasconi@dbsarc.com", "DBS-2020-004"),

  evalCase("translation-01", "translation", "Translate to French: Giulio Sovran approved Le Saillen.", "giulio.sovran@dbsarc.com", "DBS-2025-001"),
  evalCase("translation-02", "translation", "Translate: Luigi Di Berardino will visit Plan Conthey Udry.", "luigi.di.berardino@dbsarc.com", "DBS-2025-002"),
  evalCase("translation-03", "translation", "Tradurre: Natalia Rincón ha aggiornato Oscar Bider.", "natalia.rincon@dbsarc.com", "DBS-2024-003"),
  evalCase("translation-04", "translation", "Traduire: Gianmarco Lapolla suit Corin Raye Apartments.", "gianmarco.lapolla@dbsarc.com", "DBS-2023-003"),
  evalCase("translation-05", "translation", "Translate: Florencia Schilling reviewed Priotto - 2 apartments.", "florencia.schilling@dbsarc.com", "DBS-2023-008"),
  evalCase("translation-06", "translation", "Translate: Elodie G. Martins checked Tsampy Houses.", "elodie.g.martins@dbsarc.com", "DBS-2022-003"),
  evalCase("translation-07", "translation", "Tradurre: Adriana Bakalyar segue Monnat - 6 apartments.", "adriana.bakalyar@dbsarc.com", "DBS-2020-005"),
  evalCase("translation-08", "translation", "Traduire: Michèle Jemini travaille sur Corbaraye House.", "michele.jemini@dbsarc.com", "DBS-2020-006"),
  evalCase("translation-09", "translation", "Translate: Sylvie Sarrassin filed Grimisuat Houses.", "sylvie.sarrassin@dbsarc.com", "DBS-2020-007"),
  evalCase("translation-10", "translation", "Translate: Noemi Verga discussed Tsânio House.", "noemi.verga@dbsarc.com", "DBS-2020-008"),

  evalCase("health-01", "project-health", "Assess DBS-2019-001 for Michele Moretti.", "michele.moretti@dbsarc.com", "DBS-2019-001"),
  evalCase("health-02", "project-health", "Check St. Romain (Houses) risk with Ali Reza Hakim.", "ali.reza.hakim@dbsarc.com", "DBS-2019-003"),
  evalCase("health-03", "project-health", "Review Sierre's House health for Marco Iebba.", "marco.iebba@dbsarc.com", "DBS-2017-001"),
  evalCase("health-04", "project-health", "Assess Pitteloud House with Erica Vidale.", "erica.vidale@dbsarc.com", "DBS-2017-002"),
  evalCase("health-05", "project-health", "Check Bex Salvat Houses for Petko Slavov.", "petko.slavov@dbsarc.com", "DBS-2017-003"),
  evalCase("health-06", "project-health", "Review Chalet in Villars-sur-Ollon for Nicolò Viozzi.", "nicolo.viozzi@dbsarc.com", "DBS-2017-004"),
  evalCase("health-07", "project-health", "Assess Brice's Garden - 11 apartments for Anaïs Morceau.", "anais.morceau@dbsarc.com", "DBS-2016-001"),
  evalCase("health-08", "project-health", "Check Transformation of a Historic Building - 7 apartments with Sergio Facchetti.", "sergio.facchetti@dbsarc.com", "DBS-2016-002"),
  evalCase("health-09", "project-health", "Review Mayoraz house for Gianmarco Lapolla.", "gianmarco.lapolla@dbsarc.com", "DBS-2015-001"),
  evalCase("health-10", "project-health", "Assess Solaris with Florencia Schilling.", "florencia.schilling@dbsarc.com", "DBS-2015-003"),
];

interface SurfaceStats {
  prompts: number;
  expectedUsers: number;
  correctUsers: number;
  unexpectedUsers: number;
  expectedProjects: number;
  correctProjects: number;
  unexpectedProjects: number;
}

const SURFACES: readonly AiSurface[] = [
  "meeting-summary",
  "dbs-gpt",
  "chat-agent",
  "translation",
  "project-health",
];
const USER_TARGET = 0.95;
const PROJECT_TARGET = 0.9;
const FIXED_NOW = new Date("2026-08-03T00:00:00.000Z");

function emptyStats(): SurfaceStats {
  return {
    prompts: 0,
    expectedUsers: 0,
    correctUsers: 0,
    unexpectedUsers: 0,
    expectedProjects: 0,
    correctProjects: 0,
    unexpectedProjects: 0,
  };
}

function accuracy(correct: number, expected: number): number {
  return expected === 0 ? 1 : correct / expected;
}

function resultCell(correct: number, expected: number): string {
  return `${(accuracy(correct, expected) * 100).toFixed(1)}% (${correct}/${expected})`;
}

async function main(): Promise<void> {
  if (EVAL_CASES.length !== 50) {
    throw new Error(`Grounding evaluation must contain exactly 50 prompts; found ${EVAL_CASES.length}.`);
  }
  if (SEEDED_TEAM.length !== 30 || SEEDED_PROJECTS.length !== 48) {
    throw new Error(
      `Grounding fixture is incomplete: ${SEEDED_TEAM.length} users and ` +
        `${SEEDED_PROJECTS.length} projects.`,
    );
  }

  const stats = new Map(SURFACES.map((surface) => [surface, emptyStats()]));
  const failures: string[] = [];

  for (const item of EVAL_CASES) {
    const contract: GroundingContract = {
      surface: item.surface,
      subject: { userId: "fixture-user:evaluator", role: "admin" },
      input: item.prompt,
      users: { scope: "mentions" },
      projects: { scope: "mentions" },
      phases: { scope: "none" },
      dates: { scope: "none" },
      recentMeetingDecisions: { scope: "none" },
    };
    const resolved = await resolveGrounding(contract, {
      dataSource: fixtureDataSource,
      now: FIXED_NOW,
    });
    const expectedUserId = userFixtureId(item.userEmail);
    const expectedProjectId = projectFixtureId(item.projectCode);
    const actualUserIds = new Set(resolved.users.map((user) => user.id));
    const actualProjectIds = new Set(resolved.projects.map((project) => project.id));
    const surfaceStats = stats.get(item.surface)!;

    surfaceStats.prompts += 1;
    surfaceStats.expectedUsers += 1;
    surfaceStats.expectedProjects += 1;
    if (actualUserIds.has(expectedUserId)) surfaceStats.correctUsers += 1;
    if (actualProjectIds.has(expectedProjectId)) surfaceStats.correctProjects += 1;
    surfaceStats.unexpectedUsers += [...actualUserIds].filter((id) => id !== expectedUserId).length;
    surfaceStats.unexpectedProjects += [...actualProjectIds].filter((id) => id !== expectedProjectId).length;

    if (!actualUserIds.has(expectedUserId) || !actualProjectIds.has(expectedProjectId)) {
      failures.push(
        `${item.id}: expected ${expectedUserId} and ${expectedProjectId}; got ` +
          `${[...actualUserIds].join(", ") || "no user"} / ` +
          `${[...actualProjectIds].join(", ") || "no project"}`,
      );
    }
  }

  console.log("Grounding evaluation — offline DBS seed fixture");
  console.log("| Surface | Prompts | User-ID resolution | Project-ID resolution |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const surface of SURFACES) {
    const row = stats.get(surface)!;
    console.log(
      `| ${surface} | ${row.prompts} | ${resultCell(row.correctUsers, row.expectedUsers)} | ` +
        `${resultCell(row.correctProjects, row.expectedProjects)} |`,
    );
    if (accuracy(row.correctUsers, row.expectedUsers) < USER_TARGET) {
      failures.push(`${surface}: user-ID resolution fell below 95%.`);
    }
    if (accuracy(row.correctProjects, row.expectedProjects) < PROJECT_TARGET) {
      failures.push(`${surface}: project-ID resolution fell below 90%.`);
    }
    if (row.unexpectedUsers > 0 || row.unexpectedProjects > 0) {
      failures.push(
        `${surface}: resolved ${row.unexpectedUsers} unexpected user IDs and ` +
          `${row.unexpectedProjects} unexpected project IDs.`,
      );
    }
  }

  const overall = [...stats.values()].reduce<SurfaceStats>((total, row) => ({
    prompts: total.prompts + row.prompts,
    expectedUsers: total.expectedUsers + row.expectedUsers,
    correctUsers: total.correctUsers + row.correctUsers,
    unexpectedUsers: total.unexpectedUsers + row.unexpectedUsers,
    expectedProjects: total.expectedProjects + row.expectedProjects,
    correctProjects: total.correctProjects + row.correctProjects,
    unexpectedProjects: total.unexpectedProjects + row.unexpectedProjects,
  }), emptyStats());
  console.log(
    `| overall | ${overall.prompts} | ${resultCell(overall.correctUsers, overall.expectedUsers)} | ` +
      `${resultCell(overall.correctProjects, overall.expectedProjects)} |`,
  );

  if (failures.length > 0) {
    console.error("\nGrounding evaluation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nThresholds met: user IDs >= 95%; project IDs >= 90%; no unexpected IDs.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
