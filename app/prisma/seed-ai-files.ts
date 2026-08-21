/**
 * Demo seed for DBS AI — attached files and conversations.
 *
 * Generates the files rather than downloading them. Three reasons:
 *   1. No network dependency, so the seed is reproducible and cannot fail
 *      because a URL rotted.
 *   2. Provenance is ours. A random PDF pulled off the web has unclear
 *      licensing and unknown contents.
 *   3. Relevance. The point of the demo is a cost plan for Résidence
 *      Belvédère, not a stock brochure — a file named after a seeded project
 *      is what makes the surface read as real.
 *
 * Everything here is invented, consistent with prisma/seed-demo.ts. No DBS
 * client data, no scraped identities.
 *
 * Extraction is NOT faked. The generated PDFs, spreadsheets, CSVs and
 * documents are pushed through the application's own extractor, so a
 * successful seed is also a live check that the ingestion pipeline works.
 * Images are the exception: they need a vision provider, so they are read for
 * real when OPENAI_API_KEY is set and left honestly "stored" when it is not.
 *
 *   npx tsx prisma/seed-ai-files.ts
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  extractText,
  ExtractError,
} from "../src/features/ai/server/ingest/extract";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Where the local-disk upload adapter serves from, so seeded rows carry the
 *  same shape of URL a real upload would produce. */
const DISK_DIR = path.join(process.cwd(), "public", "uploads", "demo");
const URL_PREFIX = "/uploads/demo";

/** The demo logins from seed-demo.ts. Attachments are per-user, so every role
 *  account gets its own rows pointing at the same files on disk — otherwise
 *  the surface is empty for whichever account the demo happens to use. */
const DEMO_EMAILS = [
  "owner@dbsarc.com",
  "admin@dbsarc.com",
  "director@dbsarc.com",
  "manager@dbsarc.com",
  "pm@dbsarc.com",
  "employee@dbsarc.com",
  "partner@dbsarc.com",
  "intern@dbsarc.com",
  "viewer@dbsarc.com",
];

const MIME = {
  csv: "text/csv",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

// ─────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────

function csv(rows: string[][]): Buffer {
  // Quote only what needs it, the way an exported sheet would.
  const cell = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return Buffer.from(rows.map((r) => r.map(cell).join(",")).join("\n"), "utf8");
}

/**
 * A minimal but genuinely valid PDF with a real text layer.
 *
 * Hand-built because no PDF library is in this project's dependency tree and
 * adding one to write demo fixtures would be the wrong trade. The structure is
 * the plain uncompressed form: catalog, pages, one page object per page, a
 * content stream of text-showing operators, and a correct xref table. unpdf
 * reads it, which is the only requirement.
 *
 * Encoded latin1 against WinAnsiEncoding so accented Swiss and Italian names
 * survive — "Résidence Belvédère" is not optional in this product.
 */
function pdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const LINES_PER_PAGE = 46;

  const pages: string[][] = [];
  const all = [title, "", ...lines];
  for (let i = 0; i < all.length; i += LINES_PER_PAGE) {
    pages.push(all.slice(i, i + LINES_PER_PAGE));
  }

  const pageCount = pages.length;
  // Object numbering: 1 catalog, 2 pages, then per page a page object and a
  // content stream, then the font last.
  const fontObj = 3 + pageCount * 2;
  const objects: string[] = [];

  objects.push("<</Type/Catalog/Pages 2 0 R>>");
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push(`<</Type/Pages/Kids[${kids}]/Count ${pageCount}>>`);

  pages.forEach((pageLines, i) => {
    const contentObj = 4 + i * 2;
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]` +
        `/Resources<</Font<</F1 ${fontObj} 0 R>>>>/Contents ${contentObj} 0 R>>`,
    );
    const body =
      "BT\n/F1 10.5 Tf\n15 TL\n50 780 Td\n" +
      pageLines.map((l) => `(${esc(l)}) Tj T*`).join("\n") +
      "\nET";
    objects.push(
      `<</Length ${Buffer.byteLength(body, "latin1")}>>\nstream\n${body}\nendstream`,
    );
  });

  objects.push(
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
  );

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out +=
    `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

async function xlsx(
  sheets: Array<{ name: string; rows: (string | number)[][] }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Friday demo seed";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    s.rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * A minimal OOXML word document.
 *
 * Three parts is the whole requirement for a readable .docx: the content-type
 * map, the package relationship pointing at the main document, and the
 * document body itself. mammoth opens this, which is the bar.
 */
async function docx(paragraphs: string[]): Promise<Buffer> {
  const xmlEsc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * A plan-like drawing as SVG.
 *
 * SVG rather than a raster because it is text — no image encoder is needed,
 * it renders crisply at any size in the preview, and it is an accepted
 * ingest type. Deliberately schematic: outer wall, partitions, room labels,
 * a dimension string, a north point and a title block. Enough that the
 * preview shows a drawing rather than a placeholder.
 */
function drawing(input: {
  project: string;
  sheetTitle: string;
  sheetNo: string;
  scale: string;
  rooms: Array<{ x: number; y: number; w: number; h: number; label: string }>;
}): Buffer {
  const W = 900;
  const H = 620;
  const rooms = input.rooms
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#1e3a8a" stroke-width="1.6"/>` +
        `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#1e3a8a" text-anchor="middle">${r.label}</text>` +
        `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 15}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#6b7280" text-anchor="middle">${(r.w / 10).toFixed(1)} × ${(r.h / 10).toFixed(1)} m</text>`,
    )
    .join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fafaf8"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#111827" stroke-width="1"/>

  <!-- outer wall, drawn heavier than partitions as a plan would be -->
  <rect x="70" y="80" width="560" height="380" fill="none" stroke="#111827" stroke-width="4"/>
  ${rooms}

  <!-- dimension string -->
  <line x1="70" y1="490" x2="630" y2="490" stroke="#6b7280" stroke-width="1"/>
  <line x1="70" y1="484" x2="70" y2="496" stroke="#6b7280" stroke-width="1"/>
  <line x1="630" y1="484" x2="630" y2="496" stroke="#6b7280" stroke-width="1"/>
  <text x="350" y="506" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#6b7280" text-anchor="middle">56 000</text>

  <!-- north point -->
  <circle cx="700" cy="120" r="22" fill="none" stroke="#111827" stroke-width="1"/>
  <path d="M 700 100 L 706 124 L 700 118 L 694 124 Z" fill="#111827"/>
  <text x="700" y="156" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#111827" text-anchor="middle">N</text>

  <!-- title block -->
  <rect x="660" y="330" width="220" height="130" fill="none" stroke="#111827" stroke-width="1"/>
  <text x="672" y="352" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#111827">DBS Architectes</text>
  <text x="672" y="374" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#1e3a8a">${input.project}</text>
  <text x="672" y="392" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#374151">${input.sheetTitle}</text>
  <text x="672" y="414" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#6b7280">Sheet ${input.sheetNo}</text>
  <text x="672" y="430" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#6b7280">Scale ${input.scale}</text>
  <text x="672" y="446" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#6b7280">Sion · Milano</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

// ─────────────────────────────────────────────────────────────────
// The file set
// ─────────────────────────────────────────────────────────────────

type Spec = {
  filename: string;
  mime: string;
  bytes: Buffer;
  /** Deliberately left unreadable to demonstrate the "stored" state. */
  keepStored?: boolean;
  /** Deliberately failed, to demonstrate that state honestly. */
  failWith?: string;
};

function plan(project: string, sheetNo: string, sheetTitle: string) {
  return drawing({
    project,
    sheetTitle,
    sheetNo,
    scale: "1:100",
    rooms: [
      { x: 90, y: 100, w: 200, h: 150, label: "Séjour" },
      { x: 300, y: 100, w: 150, h: 150, label: "Cuisine" },
      { x: 460, y: 100, w: 150, h: 150, label: "Bureau" },
      { x: 90, y: 260, w: 160, h: 180, label: "Chambre 1" },
      { x: 260, y: 260, w: 160, h: 180, label: "Chambre 2" },
      { x: 430, y: 260, w: 180, h: 180, label: "Terrasse" },
    ],
  });
}

async function buildSpecs(): Promise<Spec[]> {
  const specs: Spec[] = [];
  const add = (
    filename: string,
    mime: string,
    bytes: Buffer,
    extra: Partial<Spec> = {},
  ) => specs.push({ filename, mime, bytes, ...extra });

  // ── CSV ────────────────────────────────────────────────────────
  add(
    "belvedere-cost-plan-phase2.csv",
    MIME.csv,
    csv([
      ["Element", "Quantity", "Unit", "Rate CHF", "Total CHF"],
      ["Substructure", "410", "m2", "285", "116850"],
      ["Frame and upper floors", "1240", "m2", "410", "508400"],
      ["External walls", "860", "m2", "395", "339700"],
      ["Windows and external doors", "142", "nr", "1850", "262700"],
      ["Roof", "430", "m2", "340", "146200"],
      ["Internal partitions", "690", "m2", "155", "106950"],
      ["Fittings and fixtures", "1", "sum", "184000", "184000"],
      ["Sanitary installations", "34", "nr", "3200", "108800"],
      ["Heating and ventilation", "1240", "m2", "220", "272800"],
      ["Electrical installations", "1240", "m2", "165", "204600"],
      ["External works", "1", "sum", "227000", "227000"],
      ["Preliminaries", "1", "sum", "268000", "268000"],
      ["Contingency 5%", "1", "sum", "137300", "137300"],
      ["TOTAL", "", "", "", "2883300"],
    ]),
  );
  add(
    "ateliers-rhone-room-schedule.csv",
    MIME.csv,
    csv([
      ["Room", "Level", "Area m2", "Floor finish", "Ceiling", "Occupancy"],
      ["Atelier A", "00", "184.5", "Sealed concrete", "Exposed slab", "24"],
      ["Atelier B", "00", "176.2", "Sealed concrete", "Exposed slab", "24"],
      ["Workshop", "00", "96.4", "Resin", "Acoustic raft", "12"],
      ["Store", "00", "42.1", "Sealed concrete", "Exposed slab", "2"],
      ["Meeting", "01", "38.6", "Oak boards", "Plasterboard", "10"],
      ["Studio North", "01", "142.0", "Oak boards", "Acoustic raft", "18"],
      ["Studio South", "01", "138.7", "Oak boards", "Acoustic raft", "18"],
      ["Kitchen", "01", "28.3", "Terrazzo", "Plasterboard", "8"],
      ["WC accessible", "01", "6.4", "Terrazzo", "Plasterboard", "1"],
      ["Plant", "02", "54.8", "Screed", "Exposed", "0"],
    ]),
  );
  add(
    "deadlines-q4-2026.csv",
    MIME.csv,
    csv([
      ["Project", "Milestone", "Authority", "Due", "Status"],
      ["Résidence Belvédère", "Permit submission", "Commune de Sion", "2026-09-18", "On track"],
      ["Ateliers du Rhône", "Tender return", "—", "2026-09-30", "At risk"],
      ["École des Vergers", "Fire strategy sign-off", "Canton du Valais", "2026-10-09", "On track"],
      ["Villa Mirasole", "Permesso di costruire", "Comune di Milano", "2026-10-16", "Submitted"],
      ["Palazzo Sant'Orso", "Heritage consultation", "Soprintendenza", "2026-10-23", "Awaiting"],
      ["Biblioteca Verdi", "Stage 3 issue", "—", "2026-11-06", "On track"],
      ["Clinique du Léman", "Coordination freeze", "—", "2026-11-13", "On track"],
      ["Halle Polyvalente Nendaz", "Contractor appointment", "—", "2026-11-27", "Not started"],
    ]),
  );
  add(
    "ecole-vergers-door-schedule.csv",
    MIME.csv,
    csv([
      ["Ref", "Location", "Width mm", "Height mm", "Fire rating", "Access control"],
      ["D-001", "Main entrance", "1800", "2400", "—", "Card reader"],
      ["D-002", "Lobby to corridor", "1500", "2100", "EI30", "None"],
      ["D-003", "Classroom 1", "1000", "2100", "EI30", "None"],
      ["D-004", "Classroom 2", "1000", "2100", "EI30", "None"],
      ["D-005", "Stair core north", "1200", "2100", "EI60", "None"],
      ["D-006", "Stair core south", "1200", "2100", "EI60", "None"],
      ["D-007", "Plant room", "900", "2100", "EI60", "Key"],
      ["D-008", "Kitchen", "1100", "2100", "EI30", "None"],
      ["D-009", "Staff room", "900", "2100", "—", "Card reader"],
      ["D-010", "Refuse store", "1000", "2100", "EI60", "Key"],
    ]),
  );
  add(
    "contractor-tender-comparison.csv",
    MIME.csv,
    csv([
      ["Contractor", "Canton", "Tender CHF", "Programme weeks", "Qualifications", "Rank"],
      ["Constructions Valaisannes SA", "VS", "2841000", "62", "None", "1"],
      ["Bâtir Rhône Sàrl", "VS", "2903500", "58", "Provisional sums", "2"],
      ["Alpes Bau AG", "BE", "2917200", "64", "Access assumptions", "3"],
      ["Edilizia Lombarda Srl", "IT-MI", "2788000", "71", "Currency, labour", "4"],
      ["Sion Bâtiment SA", "VS", "3102400", "60", "None", "5"],
    ]),
  );
  add(
    "energy-performance-summary.csv",
    MIME.csv,
    csv([
      ["Project", "Standard", "kWh/m2.a", "U wall", "U roof", "U glazing", "Compliant"],
      ["Résidence Belvédère", "MINERGIE-P", "28", "0.14", "0.11", "0.80", "Yes"],
      ["Ateliers du Rhône", "MINERGIE", "41", "0.17", "0.14", "1.00", "Yes"],
      ["École des Vergers", "MINERGIE-A", "22", "0.12", "0.10", "0.70", "Yes"],
      ["Villa Mirasole", "CasaClima B", "48", "0.22", "0.19", "1.10", "Yes"],
      ["Palazzo Sant'Orso", "Existing retained", "96", "0.61", "0.34", "2.40", "Derogation"],
      ["Refuge de Moiry", "Off-grid", "12", "0.15", "0.13", "0.90", "Yes"],
    ]),
  );
  add(
    "site-visit-log-august.csv",
    MIME.csv,
    csv([
      ["Date", "Project", "Attended by", "Weather", "Observations", "Action"],
      ["2026-08-04", "Résidence Belvédère", "Site team", "Dry, 24C", "Excavation to level 2 complete", "None"],
      ["2026-08-06", "Ateliers du Rhône", "Site team", "Rain", "Slab pour deferred", "Reprogramme"],
      ["2026-08-11", "École des Vergers", "Site team", "Dry, 27C", "Steel frame 60% erected", "None"],
      ["2026-08-13", "Villa Mirasole", "Site team", "Dry, 31C", "Render sample rejected", "Resubmit"],
      ["2026-08-18", "Résidence Belvédère", "Site team", "Overcast", "Drainage set out", "Confirm invert"],
      ["2026-08-20", "Clinique du Léman", "Site team", "Dry, 22C", "Survey discrepancy at grid C", "Investigate"],
    ]),
  );
  add(
    "material-schedule-comparison.csv",
    MIME.csv,
    csv([
      ["Material", "Application", "Origin", "kgCO2e/m2", "Cost CHF/m2", "Lead weeks"],
      ["Larch, untreated", "Facade cladding", "Valais", "8.4", "182", "6"],
      ["Fibre cement panel", "Facade cladding", "Switzerland", "21.6", "148", "8"],
      ["Anodised aluminium", "Facade cladding", "Germany", "74.2", "310", "12"],
      ["Recycled concrete", "Structure", "Valais", "112.0", "96", "2"],
      ["CLT panel 160mm", "Structure", "Austria", "42.5", "214", "14"],
      ["Terrazzo, local aggregate", "Floor finish", "Ticino", "18.9", "196", "10"],
      ["Oak boards", "Floor finish", "France", "11.2", "168", "9"],
    ]),
  );

  // ── Drawings ───────────────────────────────────────────────────
  const drawings: Array<[string, string, string, string]> = [
    ["belvedere-site-plan.svg", "Résidence Belvédère", "A-100", "Site plan"],
    ["belvedere-ground-floor.svg", "Résidence Belvédère", "A-101", "Ground floor plan"],
    ["belvedere-elevation-south.svg", "Résidence Belvédère", "A-201", "South elevation"],
    ["ateliers-rhone-section-aa.svg", "Ateliers du Rhône", "A-301", "Section A-A"],
    ["ecole-vergers-ground-floor.svg", "École des Vergers", "A-101", "Ground floor plan"],
    ["villa-mirasole-roof-detail.svg", "Villa Mirasole", "A-501", "Roof eaves detail"],
    ["palazzo-santorso-facade.svg", "Palazzo Sant'Orso", "A-202", "Facade study"],
    ["biblioteca-verdi-massing.svg", "Biblioteca Verdi", "A-010", "Massing study"],
    ["chalet-grande-dixence-plan.svg", "Chalet Grande Dixence", "A-102", "First floor plan"],
    ["refuge-moiry-section.svg", "Refuge de Moiry", "A-302", "Section B-B"],
  ];
  for (const [filename, project, sheetNo, sheetTitle] of drawings) {
    add(filename, MIME.svg, plan(project, sheetNo, sheetTitle));
  }

  // ── PDF ────────────────────────────────────────────────────────
  add(
    "belvedere-planning-application.pdf",
    MIME.pdf,
    pdf("Résidence Belvédère — Planning application, covering statement", [
      "Commune de Sion · Canton du Valais",
      "Application reference SI-2026-0418 · Prepared by DBS Architectes",
      "",
      "1. Proposal",
      "Construction of a residential building of eleven dwellings over two",
      "levels with a partial basement, on parcel 4182 at Chemin des Collines.",
      "Gross internal area 1 240 m2. Eleven parking spaces are provided at",
      "basement level, with cycle storage for twenty-two.",
      "",
      "2. Planning context",
      "The parcel lies within zone R2 of the communal plan, permitting",
      "residential use at a floor area ratio of 0.55. The proposal achieves",
      "0.52. Building height at 9.4 m is below the 11.0 m limit. Setbacks of",
      "6.0 m north and 4.5 m east comply with the cantonal minimum.",
      "",
      "3. Energy",
      "The building is designed to MINERGIE-P. Predicted demand is 28",
      "kWh/m2.a. Heating is by ground-source heat pump with two boreholes to",
      "140 m. Photovoltaic capacity of 34 kWp is proposed on the south roof.",
      "",
      "4. Materials and appearance",
      "External walls are insulated timber frame with untreated larch",
      "cladding, chosen for local supply and weathering without maintenance.",
      "Windows are triple-glazed timber with an aluminium capping.",
      "",
      "5. Access and parking",
      "Vehicular access is taken from the existing crossing to Chemin des",
      "Collines, unaltered. Refuse storage is at the boundary for collection.",
      "",
      "6. Drainage",
      "Surface water discharges to soakaway following infiltration testing on",
      "12 June 2026, which recorded a rate of 4.2 x 10-5 m/s. Foul drainage",
      "connects to the communal sewer in Chemin des Collines.",
      "",
      "7. Documents accompanying this application",
      "A-100 Site plan · A-101 to A-103 Floor plans · A-201 to A-204",
      "Elevations · A-301 Sections · Energy report · Drainage calculations.",
    ]),
  );
  add(
    "minutes-2026-08-14-belvedere.pdf",
    MIME.pdf,
    pdf("Résidence Belvédère — Design team meeting 14, minutes", [
      "Date 14 August 2026 · Sion office and video",
      "",
      "1. Previous minutes",
      "Minutes of meeting 13 were accepted without amendment.",
      "",
      "2. Cost plan",
      "The phase 2 cost plan returned at CHF 2 883 300 against a budget of",
      "CHF 2 750 000, an overrun of CHF 133 300 or 4.8 per cent. The largest",
      "movements are external walls, up CHF 61 000 following the change to",
      "larch cladding, and heating and ventilation, up CHF 48 000 following",
      "the borehole depth revision. Action: value engineering options to be",
      "prepared for meeting 15.",
      "",
      "3. Permit programme",
      "Submission remains 18 September 2026. The drainage calculations are",
      "the only outstanding item; infiltration testing is complete.",
      "",
      "4. Structural coordination",
      "The engineer confirmed the transfer beam at grid C can be reduced in",
      "depth from 700 to 600 mm, releasing ceiling zone in the north flats.",
      "",
      "5. Facade",
      "The larch sample was approved. Fixing is to be secret, with a 20 mm",
      "ventilated cavity. The maintenance statement is to record that no",
      "treatment is intended and that silvering is expected within two years.",
      "",
      "6. Risks",
      "Cost overrun of 4.8 per cent is the principal open risk. Contractor",
      "availability in Valais for a Q1 2027 start is a secondary concern.",
      "",
      "7. Next meeting",
      "Meeting 15 on 28 August 2026, Sion office.",
    ]),
  );
  add(
    "ateliers-rhone-structural-report.pdf",
    MIME.pdf,
    pdf("Ateliers du Rhône — Structural appraisal of the existing frame", [
      "Prepared for DBS Architectes · August 2026",
      "",
      "1. Scope",
      "Appraisal of the existing reinforced concrete frame of the former",
      "warehouse at Ateliers du Rhône, to establish capacity for the proposed",
      "change of use to studios and workshops.",
      "",
      "2. Existing construction",
      "The frame is in-situ reinforced concrete on a 6.0 by 7.2 m grid, built",
      "in 1962. Slabs are 180 mm one-way spanning. Columns are 400 by 400 mm.",
      "Foundations are pad bases, assumed 1.8 m square from trial holes.",
      "",
      "3. Condition",
      "Cover meter survey found cover between 18 and 34 mm against a nominal",
      "25 mm. Carbonation depth averaged 11 mm. Chloride content is below the",
      "threshold. Two areas of spalling were noted at the east elevation, both",
      "associated with rainwater goods rather than systemic corrosion.",
      "",
      "4. Capacity",
      "Existing slab capacity is 3.0 kN/m2 imposed. The proposed workshop use",
      "requires 5.0 kN/m2. Strengthening is required to bays B3 to B6 and C3",
      "to C6. Carbon fibre plate bonded to the soffit is recommended.",
      "",
      "5. New openings",
      "The proposed stair opening at grid B4 requires trimming. A steel frame",
      "picking up on the existing columns is recommended over slab widening.",
      "",
      "6. Conclusions",
      "The frame is sound and suitable for retention. Strengthening of eight",
      "bays and local repair of two spalled areas is required. Retention",
      "avoids an estimated 340 tonnes of embodied carbon against rebuild.",
    ]),
  );
  add(
    "ecole-vergers-fire-strategy.pdf",
    MIME.pdf,
    pdf("École des Vergers — Fire safety strategy, revision C", [
      "Canton du Valais · AEAI/VKF directives 2015 edition",
      "",
      "1. Building description",
      "Two-storey school for 220 pupils and 26 staff. Gross area 2 480 m2.",
      "Construction is steel frame with concrete floors. Building class 2.",
      "",
      "2. Escape",
      "Two protected stair cores, north and south, each discharging directly",
      "to open air. Maximum travel distance to a protected route is 28 m",
      "against a permitted 35 m. Classroom doors open in the direction of",
      "escape. Final exit widths total 4.8 m against a required 3.6 m.",
      "",
      "3. Compartmentation",
      "Stair cores are EI60. Classrooms are separated from the corridor at",
      "EI30. The plant room and refuse store are EI60. The kitchen is EI30",
      "with an EI30 shutter to the servery.",
      "",
      "4. Detection and alarm",
      "Category L1 automatic detection throughout, with sounders achieving 65",
      "dB(A) at the bedhead equivalent position in all occupied rooms. Manual",
      "call points at each final exit and at each stair core on each level.",
      "",
      "5. Fire service access",
      "A hardstanding within 18 m of the north entrance accommodates a",
      "pumping appliance. A dry riser is not required at this height.",
      "",
      "6. Outstanding items",
      "Confirmation of the smoke ventilation opening area to the south stair",
      "remains outstanding pending the facade contractor's shop drawings.",
      "Sign-off is programmed for 9 October 2026.",
    ]),
  );
  add(
    "villa-mirasole-permit-decision.pdf",
    MIME.pdf,
    pdf("Villa Mirasole — Permesso di costruire, decision notice", [
      "Comune di Milano · Sportello Unico per l'Edilizia",
      "Practice number PDC-2026-1174",
      "",
      "Decision: granted subject to conditions.",
      "",
      "Condition 1",
      "The render sample submitted on 13 August 2026 is not approved. A",
      "revised sample in a lime-based finish is to be submitted for approval",
      "before the relevant work commences.",
      "",
      "Condition 2",
      "Works are to be carried out in accordance with the approved drawings",
      "A-100 revision D, A-101 to A-104 revision C and A-201 revision C.",
      "",
      "Condition 3",
      "A construction management plan addressing hours of work, wheel washing",
      "and dust suppression is to be submitted at least fourteen days before",
      "commencement.",
      "",
      "Condition 4",
      "The two lime trees at the southern boundary are to be retained and",
      "protected in accordance with the arboricultural method statement.",
      "",
      "Condition 5",
      "Energy performance is to achieve CasaClima class B as stated. A test",
      "certificate is to be provided before occupation.",
      "",
      "Reasons",
      "The proposal accords with the Piano di Governo del Territorio and does",
      "not harm the character of the surrounding area. The conditions secure",
      "the quality of materials and the protection of existing trees.",
    ]),
  );
  add(
    "sion-commune-zoning-extract.pdf",
    MIME.pdf,
    pdf("Commune de Sion — Zoning regulation extract, zone R2", [
      "Règlement communal des constructions et des zones · extract",
      "",
      "Article 12 — Zone résidentielle R2",
      "",
      "12.1 Permitted use",
      "Residential use. Ancillary professional use is permitted to a maximum",
      "of 30 per cent of the floor area of a dwelling.",
      "",
      "12.2 Floor area ratio",
      "The indice d'utilisation du sol shall not exceed 0.55.",
      "",
      "12.3 Height",
      "Maximum height to the eaves is 11.0 m measured from natural ground",
      "level at the centre of the facade. An attic storey is permitted within",
      "the roof volume.",
      "",
      "12.4 Setbacks",
      "The minimum distance to a boundary is 6.0 m to the north and west, and",
      "4.5 m to the south and east.",
      "",
      "12.5 Roof",
      "Pitched roofs between 20 and 35 degrees. Flat roofs are permitted on",
      "ancillary volumes not exceeding 40 m2, and shall be planted.",
      "",
      "12.6 Parking",
      "One space per dwelling, plus one visitor space per four dwellings.",
      "Cycle parking at two spaces per dwelling, covered.",
      "",
      "12.7 Trees",
      "Trees of a trunk diameter exceeding 200 mm at 1.0 m above ground may",
      "not be felled without authorisation.",
    ]),
  );
  add(
    "minutes-2026-07-31-studio.pdf",
    MIME.pdf,
    pdf("DBS Architectes — Studio review, 31 July 2026", [
      "Sion office · attended by the project leads and the directors",
      "",
      "1. Portfolio position",
      "Twenty-four live projects. Four are in permit, nine in design",
      "development, six on site, three in feasibility and two on hold.",
      "",
      "2. Résidence Belvédère",
      "Permit submission 18 September. Cost plan returning above budget; a",
      "value engineering exercise is to be prepared.",
      "",
      "3. Ateliers du Rhône",
      "Tender return 30 September. Structural appraisal complete and",
      "supporting retention of the existing frame.",
      "",
      "4. École des Vergers",
      "On site, steel frame 60 per cent erected. Fire strategy sign-off",
      "programmed 9 October.",
      "",
      "5. Villa Mirasole",
      "Permit granted with five conditions. The render sample was refused and",
      "a lime-based alternative is to be submitted.",
      "",
      "6. Palazzo Sant'Orso",
      "Heritage consultation awaited from the Soprintendenza. No date given.",
      "",
      "7. Resourcing",
      "September is over-committed by approximately 1.4 full-time equivalents",
      "across the Sion office. Options are to defer the Biblioteca Verdi",
      "stage 3 issue by two weeks, or to draw on the Srinagar collaborators",
      "for production drawing work.",
      "",
      "8. Milano office",
      "Workload steady. Two enquiries received in July, both residential.",
    ]),
  );
  add(
    "contractor-prequalification.pdf",
    MIME.pdf,
    pdf("Contractor prequalification — Ateliers du Rhône", [
      "Assessment of five tendering contractors · August 2026",
      "",
      "Method",
      "Contractors were assessed on financial standing, relevant experience,",
      "proposed programme, health and safety record, and the extent of",
      "qualifications attached to the tender. Price is reported but was not",
      "the sole determinant.",
      "",
      "Constructions Valaisannes SA — recommended",
      "Tender CHF 2 841 000. Programme 62 weeks. No qualifications. Three",
      "comparable adaptive reuse projects in Valais in the last five years.",
      "Accounts show adequate cover against the contract value.",
      "",
      "Bâtir Rhône Sàrl",
      "Tender CHF 2 903 500. Programme 58 weeks, the shortest offered.",
      "Provisional sums retained for the strengthening works, which transfers",
      "risk back to the client.",
      "",
      "Alpes Bau AG",
      "Tender CHF 2 917 200. Programme 64 weeks. Access assumptions attached",
      "that are not consistent with the site constraints.",
      "",
      "Edilizia Lombarda Srl",
      "Tender CHF 2 788 000, the lowest. Programme 71 weeks. Qualifications on",
      "currency and cross-border labour. The programme is the concern.",
      "",
      "Sion Bâtiment SA",
      "Tender CHF 3 102 400. Programme 60 weeks. No qualifications. Price is",
      "not competitive against the field.",
    ]),
  );

  // ── Excel ──────────────────────────────────────────────────────
  add(
    "portfolio-fee-forecast-2026.xlsx",
    MIME.xlsx,
    await xlsx([
      {
        name: "Fee forecast",
        rows: [
          ["Project", "Stage", "Fee CHF", "Invoiced", "Remaining", "Q4 forecast"],
          ["Résidence Belvédère", "Permit", 248000, 149000, 99000, 62000],
          ["Ateliers du Rhône", "Tender", 196000, 137000, 59000, 41000],
          ["École des Vergers", "Construction", 312000, 218000, 94000, 58000],
          ["Villa Mirasole", "Construction", 164000, 131000, 33000, 22000],
          ["Palazzo Sant'Orso", "Design", 142000, 58000, 84000, 34000],
          ["Biblioteca Verdi", "Design", 208000, 74000, 134000, 51000],
          ["Clinique du Léman", "Design", 286000, 96000, 190000, 68000],
          ["Refuge de Moiry", "Feasibility", 48000, 18000, 30000, 12000],
        ],
      },
      {
        name: "By office",
        rows: [
          ["Office", "Live projects", "Fee CHF", "Q4 forecast"],
          ["Sion", 16, 1298000, 291000],
          ["Milano", 6, 386000, 47000],
          ["Srinagar (collaborators)", 2, 20000, 10000],
        ],
      },
    ]),
  );
  add(
    "belvedere-quantities.xlsx",
    MIME.xlsx,
    await xlsx([
      {
        name: "Measured quantities",
        rows: [
          ["Item", "Description", "Unit", "Quantity"],
          ["2.1", "Excavation to reduce level", "m3", 1840],
          ["2.2", "Disposal off site", "m3", 1420],
          ["3.1", "Concrete C30/37 to foundations", "m3", 312],
          ["3.2", "Reinforcement, high yield", "t", 28.4],
          ["4.1", "Timber frame external wall", "m2", 860],
          ["4.2", "Larch cladding, untreated", "m2", 742],
          ["5.1", "Triple glazed timber window", "nr", 128],
          ["5.2", "External door, timber", "nr", 14],
          ["6.1", "Warm roof, single ply", "m2", 430],
          ["7.1", "Metal stud partition", "m2", 690],
        ],
      },
      {
        name: "Areas by level",
        rows: [
          ["Level", "GIA m2", "NIA m2", "Efficiency"],
          ["Basement", 410, 268, 0.65],
          ["Ground", 424, 361, 0.85],
          ["First", 406, 348, 0.86],
          ["Total", 1240, 977, 0.79],
        ],
      },
    ]),
  );
  add(
    "team-allocation-september.xlsx",
    MIME.xlsx,
    await xlsx([
      {
        name: "September",
        rows: [
          ["Role", "Office", "Capacity days", "Allocated days", "Variance"],
          ["Director", "Sion", 18, 14, 4],
          ["Manager", "Sion", 20, 23, -3],
          ["Project manager", "Sion", 20, 24, -4],
          ["Employee A", "Sion", 20, 21, -1],
          ["Employee B", "Sion", 20, 17, 3],
          ["Intern", "Sion", 20, 11, 9],
          ["Manager", "Milano", 20, 19, 1],
          ["Employee C", "Milano", 20, 20, 0],
          ["Collaborator", "Srinagar", 15, 9, 6],
          ["TOTAL", "", 173, 158, 15],
        ],
      },
      {
        name: "By project",
        rows: [
          ["Project", "Days required", "Days allocated", "Shortfall"],
          ["Résidence Belvédère", 34, 34, 0],
          ["Ateliers du Rhône", 22, 22, 0],
          ["École des Vergers", 28, 24, 4],
          ["Biblioteca Verdi", 26, 18, 8],
          ["Clinique du Léman", 31, 29, 2],
        ],
      },
    ]),
  );
  add(
    "palazzo-santorso-cost-plan.xlsx",
    MIME.xlsx,
    await xlsx([
      {
        name: "Cost plan",
        rows: [
          ["Element", "EUR", "Note"],
          ["Enabling and scaffold", 184000, "Heritage scaffold to facade"],
          ["Structural repair", 341000, "Subject to opening up"],
          ["Facade restoration", 612000, "Soprintendenza approval pending"],
          ["Roof", 268000, ""],
          ["Windows, refurbish existing", 196000, "Retain 74 of 88"],
          ["Internal fit out", 428000, ""],
          ["Services", 384000, ""],
          ["Preliminaries", 246000, ""],
          ["Contingency 12%", 306000, "Elevated for heritage risk"],
          ["TOTAL", 2965000, ""],
        ],
      },
    ]),
  );
  add(
    "phase-milestones-tracker.xlsx",
    MIME.xlsx,
    await xlsx([
      {
        name: "Milestones",
        rows: [
          ["Project", "Feasibility", "Design", "Permit", "Tender", "Construction"],
          ["Résidence Belvédère", "Complete", "Complete", "Sep 2026", "Nov 2026", "Feb 2027"],
          ["Ateliers du Rhône", "Complete", "Complete", "Complete", "Sep 2026", "Jan 2027"],
          ["École des Vergers", "Complete", "Complete", "Complete", "Complete", "In progress"],
          ["Villa Mirasole", "Complete", "Complete", "Complete", "Complete", "In progress"],
          ["Palazzo Sant'Orso", "Complete", "In progress", "Q1 2027", "Q2 2027", "Q4 2027"],
          ["Biblioteca Verdi", "Complete", "In progress", "Q1 2027", "Q3 2027", "Q1 2028"],
          ["Refuge de Moiry", "In progress", "—", "—", "—", "—"],
        ],
      },
    ]),
  );

  // ── Word ───────────────────────────────────────────────────────
  add(
    "belvedere-design-brief.docx",
    MIME.docx,
    await docx([
      "Résidence Belvédère — Design brief",
      "Revision C · August 2026 · DBS Architectes",
      "1. The commission",
      "Eleven dwellings on parcel 4182 at Chemin des Collines, Sion. The site falls approximately 2.4 m from north to south and enjoys an open outlook to the Rhône valley. The brief is for a building that reads as one volume rather than a terrace, and that gives every dwelling a usable outdoor room.",
      "2. Accommodation",
      "Three two-room dwellings, five three-room and three four-room. Every dwelling has a balcony or terrace of at least 12 m2. Circulation is by two cores rather than a single corridor, so no dwelling is entered from a space longer than 9 m.",
      "3. Environmental ambition",
      "MINERGIE-P is a requirement, not an aspiration. Predicted demand is 28 kWh/m2.a. Heating is by ground-source heat pump. A 34 kWp photovoltaic array is proposed on the south roof. Embodied carbon is to be reported at each stage, and the timber frame was selected on that basis.",
      "4. Materials",
      "Untreated larch cladding on an insulated timber frame. The client accepts that the facade will silver and has agreed that no treatment will be applied. Windows are triple-glazed timber with aluminium capping. Balcony soffits are in the same larch.",
      "5. Budget",
      "The construction budget is CHF 2 750 000 excluding fees and VAT. The phase 2 cost plan returned CHF 2 883 300, an overrun of 4.8 per cent. Value engineering options are to be prepared without reducing the environmental standard or the balcony areas, both of which the client has identified as fixed.",
      "6. Programme",
      "Permit submission 18 September 2026. Tender November 2026. Start on site February 2027. Completion is sought before the 2028 heating season.",
      "7. Constraints",
      "Floor area ratio 0.55 maximum, achieved at 0.52. Height 11.0 m maximum, achieved at 9.4 m. The two mature trees at the north boundary are to be retained.",
    ]),
  );
  add(
    "client-meeting-notes-mirasole.docx",
    MIME.docx,
    await docx([
      "Villa Mirasole — Client meeting notes",
      "13 August 2026 · Milano office",
      "Present: the client, the project manager and the architect. Notes taken by the project manager and issued for comment.",
      "1. Permit",
      "The permesso di costruire has been granted with five conditions. The client was taken through each. Condition 1, the refusal of the render sample, was discussed at length.",
      "2. Render",
      "The submitted sample was a cement-based render. The comune requires a lime-based finish. The client initially resisted on cost, and was shown the comparison: lime adds approximately EUR 8 400 across the elevations. The client accepted this rather than appeal, on the basis that an appeal would cost more in delay than the difference in material.",
      "3. Trees",
      "The two lime trees at the southern boundary are to be retained under condition 4. The client asked whether one could be removed to widen the terrace. The answer is no without a separate authorisation, which is unlikely to succeed. The terrace is to be redesigned around the tree instead.",
      "4. Programme",
      "Start on site is confirmed for 5 October 2026. The construction management plan is due fourteen days before, so 21 September.",
      "5. Energy certificate",
      "CasaClima class B is a condition of occupation, not only of consent. The client was reminded that the test is at completion and that a failure at that point is expensive to remedy.",
      "6. Actions",
      "Revised lime render sample to the comune by 5 September. Terrace redesign for comment by 29 August. Construction management plan by 21 September.",
    ]),
  );
  add(
    "sustainability-statement-draft.docx",
    MIME.docx,
    await docx([
      "Sustainability statement — draft for comment",
      "DBS Architectes · portfolio position August 2026",
      "1. Purpose",
      "This statement sets out how environmental performance is addressed across the practice's live projects, and what is measured rather than asserted.",
      "2. Operational energy",
      "Every new-build project since 2024 has been designed to MINERGIE or better in Switzerland, and to CasaClima B or better in Italy. Predicted demand across the eight measured projects ranges from 12 kWh/m2.a at Refuge de Moiry to 48 at Villa Mirasole. Palazzo Sant'Orso, at 96, is a retained heritage building operating under a derogation.",
      "3. Embodied carbon",
      "Embodied carbon is reported at each design stage on all projects above 500 m2. The largest single reduction achieved to date is at Ateliers du Rhône, where retaining the existing concrete frame avoids an estimated 340 tonnes against rebuild.",
      "4. Materials",
      "Facade material selection is now made against a comparison of embodied carbon, cost and lead time together rather than appearance alone. Local untreated larch at 8.4 kgCO2e/m2 is preferred to anodised aluminium at 74.2 where the exposure allows it.",
      "5. What is not yet measured",
      "Water use is not currently reported. Post-occupancy energy performance is measured on two projects only, both by the client rather than by us. The gap between predicted and actual demand is therefore unknown across the portfolio, and that is the most significant weakness in this statement.",
      "6. Next steps",
      "Extend post-occupancy measurement to all projects completing after 2026. Introduce water reporting at the next revision of the design brief template.",
    ]),
  );
  add(
    "ecole-vergers-specification-extract.docx",
    MIME.docx,
    await docx([
      "École des Vergers — Specification extract, section K10",
      "Plasterboard linings and partitions",
      "K10/110 Metal stud partition, 100 mm",
      "Studs: galvanised steel C stud at 600 mm centres, 92 mm, to the head and floor channels specified. Deflection head to be provided where the partition abuts a concrete soffit.",
      "Linings: two layers of 12.5 mm plasterboard each side, joints staggered. Fire rating EI30 where scheduled. Tapered edge boards, jointed and filled ready for decoration.",
      "Insulation: 75 mm mineral wool, density 45 kg/m3, friction fitted between studs. Full fill, no gaps at the head or at service penetrations.",
      "Acoustic performance: minimum Rw 47 dB where the partition separates a classroom from a corridor. Test evidence for the exact build-up to be provided before installation.",
      "K10/120 Service penetrations",
      "All penetrations through fire-rated partitions to be sealed with a proprietary system tested in the same build-up. Sleeves, collars and batts to be recorded on the fire stopping register with a photograph of each before the lining is closed.",
      "K10/130 Junctions",
      "Partitions to be continuous to the soffit where the fire or acoustic rating requires it. Partitions stopping at ceiling level are permitted only where scheduled as non-rated. Where a partition abuts glazing, a flexible closer is to be used, not a rigid bead.",
      "K10/140 Tolerances",
      "Plumb within 3 mm in 2 400 mm. Flatness within 3 mm under a 1 800 mm straight edge. Board joints not to coincide with door openings.",
    ]),
  );
  add(
    "handover-checklist-template.docx",
    MIME.docx,
    await docx([
      "Project handover checklist — practice template",
      "To be completed by the project manager before final account.",
      "1. Statutory",
      "Building completion certificate received. Fire strategy as-built confirmed against the approved strategy. Energy performance certificate issued. All permit conditions discharged in writing, with the discharge correspondence filed.",
      "2. Drawings and models",
      "As-built drawing set issued and archived. Model federated and archived with a note of the software version. Superseded revisions removed from the live folder.",
      "3. Operation and maintenance",
      "O and M manuals received and checked for completeness, not merely receipt. Commissioning records for heating, ventilation and electrical installations. Warranties collated with start dates recorded.",
      "4. Defects",
      "Defects list agreed with the contractor at practical completion. Defects liability period start and end dates recorded and diarised. Responsibility for each open item assigned by name.",
      "5. Commercial",
      "Final account agreed. Retention release dates diarised. Fee account closed and any outstanding stage invoiced.",
      "6. Learning",
      "Post-project review held within six weeks of completion. Cost outturn compared against the stage cost plans, with the reasons for variance recorded. Anything learned that should change the design brief template is to be written down here rather than remembered.",
    ]),
  );

  // ── Deliberately unread and deliberately failed ────────────────
  //
  // A demo where every file is green teaches the wrong thing. These four
  // exercise the states the UI exists to distinguish, so the "the assistant
  // has not read this" copy can actually be seen.
  add(
    "belvedere-drainage-calcs.csv",
    MIME.csv,
    csv([
      ["Catchment", "Area m2", "Rate mm/hr", "Flow l/s", "Attenuation m3"],
      ["Roof north", "214", "50", "2.97", "1.8"],
      ["Roof south", "216", "50", "3.00", "1.8"],
      ["Terrace", "148", "50", "2.06", "1.2"],
      ["Access road", "312", "50", "4.33", "2.6"],
    ]),
    { keepStored: true },
  );
  add(
    "villa-mirasole-render-sample.svg",
    MIME.svg,
    plan("Villa Mirasole", "A-503", "Render sample board"),
    { keepStored: true },
  );
  add(
    "palazzo-santorso-survey-scan.pdf",
    MIME.pdf,
    // A page with no text operators at all — the closest honest equivalent of
    // a scan with no text layer, and the extractor's real failure case.
    Buffer.from(
      "%PDF-1.4\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n" +
        "2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n" +
        "3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>\nendobj\n" +
        "trailer\n<</Size 4/Root 1 0 R>>\n%%EOF\n",
      "latin1",
    ),
    {
      failWith:
        "No text could be read from this file. If it is a scan, try exporting it as an image.",
    },
  );

  return specs;
}

// ─────────────────────────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────────────────────────

/** Three conversations, each one anchored on a seeded file so the demo can
 *  show the assistant reasoning over an attachment rather than in a vacuum. */
const CHATS: Array<{
  title: string;
  /** Filenames to bind to this conversation. */
  files: string[];
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  /** Days ago, so the sidebar groups by date rather than piling into Today. */
  daysAgo: number;
}> = [
  {
    title: "Belvédère cost overrun",
    daysAgo: 0,
    files: [
      "belvedere-cost-plan-phase2.csv",
      "minutes-2026-08-14-belvedere.pdf",
      "belvedere-design-brief.docx",
    ],
    turns: [
      {
        role: "user",
        content:
          "I have attached the phase 2 cost plan, the minutes from meeting 14 and the design brief. How far over budget are we and where is it coming from?",
      },
      {
        role: "assistant",
        content:
          "The cost plan totals CHF 2 883 300 against the CHF 2 750 000 construction budget stated in the design brief — an overrun of CHF 133 300, or 4.8 per cent.\n\nThe minutes of meeting 14 attribute the movement to two elements:\n\n- **External walls**, up CHF 61 000 following the change to larch cladding. The cost plan carries 860 m² at CHF 395/m², totalling CHF 339 700.\n- **Heating and ventilation**, up CHF 48 000 following the borehole depth revision. The cost plan carries 1 240 m² at CHF 220/m², totalling CHF 272 800.\n\nThose two account for CHF 109 000 of the CHF 133 300. The remainder is not separately explained in either document.\n\nOne thing worth flagging: the design brief records that the client has fixed both the MINERGIE-P standard and the balcony areas, and the minutes ask for value engineering options for meeting 15. Those two constraints rule out the two largest levers you would normally reach for first, so the options will need to come from elsewhere in the plan — preliminaries at CHF 268 000 and the CHF 137 300 contingency are the largest remaining lines.",
      },
      {
        role: "user",
        content: "Which elements could absorb a CHF 130 000 reduction without touching the standard or the balconies?",
      },
      {
        role: "assistant",
        content:
          "Working only from the lines in the attached cost plan, there are three places with enough value to matter:\n\n1. **Internal partitions — CHF 106 950** (690 m² at CHF 155/m²). The quantities file measures the same 690 m² of metal stud. This is specification territory rather than performance, so a reduction here does not touch MINERGIE-P.\n\n2. **Fittings and fixtures — CHF 184 000**, carried as a lump sum with no breakdown in the plan. A sum that size without measurement usually has room in it, but I cannot tell you how much from this document.\n\n3. **Contingency — CHF 137 300 at 5 per cent.** Releasing this closes the gap arithmetically, but it is not a saving. At permit stage, with drainage calculations still outstanding per the minutes, reducing contingency transfers risk rather than removing cost.\n\nWhat I cannot answer from these files: the fittings and fixtures sum is undifferentiated, so the actual scope for reduction there is unknown. That is the line I would open up first.",
      },
    ],
  },
  {
    title: "École des Vergers — fire strategy open items",
    daysAgo: 2,
    files: [
      "ecole-vergers-fire-strategy.pdf",
      "ecole-vergers-door-schedule.csv",
      "ecole-vergers-specification-extract.docx",
    ],
    turns: [
      {
        role: "user",
        content:
          "Check the door schedule against the fire strategy. Anything inconsistent, and what is still outstanding?",
      },
      {
        role: "assistant",
        content:
          "The door schedule and the fire strategy agree. Checking each rated element the strategy calls for:\n\n- **Stair cores at EI60** — D-005 and D-006 are both scheduled EI60. Consistent.\n- **Classrooms to corridor at EI30** — D-003 and D-004 are both EI30. Consistent.\n- **Plant room and refuse store at EI60** — D-007 and D-010 are both EI60. Consistent.\n- **Kitchen at EI30** — D-008 is EI30. Consistent. The strategy also requires an EI30 shutter to the servery, which is not a door and does not appear in the schedule.\n\nOne open item, and the strategy names it itself: confirmation of the smoke ventilation opening area to the south stair, pending the facade contractor's shop drawings. Sign-off is programmed for 9 October 2026.\n\nSeparately, the specification extract requires that every penetration through a fire-rated partition is recorded on a fire stopping register with a photograph taken before the lining is closed. That is a sequencing obligation on site rather than a design item, but it is the kind of requirement that is easiest to miss and most expensive to prove after the fact.",
      },
    ],
  },
  {
    title: "September resourcing",
    daysAgo: 5,
    files: [
      "team-allocation-september.xlsx",
      "minutes-2026-07-31-studio.pdf",
      "deadlines-q4-2026.csv",
    ],
    turns: [
      {
        role: "user",
        content: "Are we over-committed in September, and what would you move?",
      },
      {
        role: "assistant",
        content:
          "The allocation sheet shows 158 days allocated against 173 days of capacity — a surplus of 15 days in total. But the total conceals the problem, because the surplus is not where the shortfall is.\n\nBy role, three people are over:\n\n- Manager, Sion: 23 allocated against 20 capacity (−3)\n- Project manager, Sion: 24 against 20 (−4)\n- Employee A, Sion: 21 against 20 (−1)\n\nAnd the spare capacity sits with the intern (+9 days) and the Srinagar collaborator (+6). Those are not interchangeable with a project manager's days.\n\nThe by-project sheet shows where the gap lands: **Biblioteca Verdi is short 8 days** of the 26 required, and **École des Vergers short 4** of 28.\n\nThe studio review of 31 July reached the same conclusion independently — it records September as over-committed by roughly 1.4 full-time equivalents in Sion, and names two options: defer the Biblioteca Verdi stage 3 issue by two weeks, or draw on the Srinagar collaborators for production drawing work.\n\nOf those two, deferring Biblioteca Verdi is the lower-risk move. The Q4 deadline list gives its stage 3 issue as 6 November with no external authority attached, so a two-week slip is an internal matter. Every other milestone in that window is answerable to someone outside the practice — Commune de Sion on 18 September, Canton du Valais on 9 October, Comune di Milano on 16 October.\n\nWorth noting that the same deadline list flags the Ateliers du Rhône tender return of 30 September as already at risk, and that project is not among those showing a shortfall in the allocation sheet. Whatever is putting it at risk is not resourcing.",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating demo files...");
  const specs = await buildSpecs();
  await mkdir(DISK_DIR, { recursive: true });

  type Prepared = Spec & {
    url: string;
    extractedText: string | null;
    extractedUnits: number | null;
    ingested: boolean;
    error: string | null;
  };

  const hasVision = Boolean(process.env.OPENAI_API_KEY);
  const prepared: Prepared[] = [];

  for (const spec of specs) {
    await writeFile(path.join(DISK_DIR, spec.filename), spec.bytes);
    const url = `${URL_PREFIX}/${spec.filename}`;

    if (spec.failWith) {
      // Recorded as the pipeline would record it, so the failed state in the
      // UI is reached by the same route a real failure takes.
      prepared.push({
        ...spec,
        url,
        extractedText: null,
        extractedUnits: null,
        ingested: false,
        error: spec.failWith,
      });
      console.log(`  ${spec.filename} — failed (intentional)`);
      continue;
    }
    if (spec.keepStored) {
      prepared.push({
        ...spec,
        url,
        extractedText: null,
        extractedUnits: null,
        ingested: false,
        error: null,
      });
      console.log(`  ${spec.filename} — stored (intentional)`);
      continue;
    }

    const isImage = spec.mime.startsWith("image/");
    if (isImage && !hasVision) {
      prepared.push({
        ...spec,
        url,
        extractedText: null,
        extractedUnits: null,
        ingested: false,
        error: null,
      });
      console.log(`  ${spec.filename} — stored (no vision provider)`);
      continue;
    }

    try {
      // The application's own extractor. If this throws, the pipeline is
      // broken and the seed should say so rather than paper over it with
      // hand-written text.
      const r = await extractText(spec.bytes, spec.mime, spec.filename);
      prepared.push({
        ...spec,
        url,
        extractedText: r.text,
        extractedUnits: r.units,
        ingested: true,
        error: r.truncated ? "Read the first 120,000 characters only." : null,
      });
      console.log(`  ${spec.filename} — read (${r.units} units)`);
    } catch (err) {
      const reason =
        err instanceof ExtractError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Extraction failed.";
      prepared.push({
        ...spec,
        url,
        extractedText: null,
        extractedUnits: null,
        ingested: false,
        error: reason.slice(0, 500),
      });
      console.log(`  ${spec.filename} — FAILED: ${reason}`);
    }
  }

  const byName = new Map(prepared.map((p) => [p.filename, p]));

  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true, email: true },
  });
  if (users.length === 0) {
    throw new Error(
      "No demo users found. Run `npm run db:seed` first — this seed attaches to those accounts.",
    );
  }
  console.log(`\nSeeding ${prepared.length} files for ${users.length} accounts.`);

  for (const user of users) {
    // Idempotent: clear this user's seeded rows before inserting, matched on
    // the demo URL prefix so anything they uploaded themselves is untouched.
    await prisma.aiChatAttachment.deleteMany({
      where: { userId: user.id, url: { startsWith: URL_PREFIX } },
    });
    await prisma.aiChatSession.deleteMany({
      where: { userId: user.id, title: { in: CHATS.map((c) => c.title) } },
    });

    const sessionIdByTitle = new Map<string, string>();

    for (const chat of CHATS) {
      const when = new Date(Date.now() - chat.daysAgo * 86_400_000);
      const session = await prisma.aiChatSession.create({
        data: {
          userId: user.id,
          title: chat.title,
          createdAt: when,
          updatedAt: when,
        },
      });
      sessionIdByTitle.set(chat.title, session.id);

      await prisma.aiChatMessage.createMany({
        data: chat.turns.map((t, i) => ({
          sessionId: session.id,
          role: t.role,
          content: t.content,
          // Sequenced a minute apart so ordering is stable and the transcript
          // does not read as though it happened in one instant.
          createdAt: new Date(when.getTime() + i * 60_000),
        })),
      });
    }

    /** Which conversation a file belongs to, if any. */
    const sessionForFile = new Map<string, string>();
    for (const chat of CHATS) {
      const id = sessionIdByTitle.get(chat.title)!;
      for (const f of chat.files) sessionForFile.set(f, id);
    }

    await prisma.aiChatAttachment.createMany({
      data: prepared.map((p, i) => ({
        userId: user.id,
        sessionId: sessionForFile.get(p.filename) ?? null,
        filename: p.filename,
        contentType: p.mime,
        sizeBytes: p.bytes.byteLength,
        url: p.url,
        extractedText: p.extractedText,
        extractedUnits: p.extractedUnits,
        ingestedAt: p.ingested
          ? new Date(Date.now() - (i % 9) * 86_400_000)
          : null,
        ingestError: p.error,
        // Spread across three weeks so the Files list is not one flat block.
        createdAt: new Date(Date.now() - (i % 21) * 86_400_000),
      })),
    });
  }

  const ready = prepared.filter((p) => p.ingested).length;
  const stored = prepared.filter((p) => !p.ingested && !p.error).length;
  const failed = prepared.filter((p) => p.error && !p.ingested).length;

  console.log(
    `\nDone. ${prepared.length} files per account — ${ready} readable, ` +
      `${stored} stored, ${failed} failed.`,
  );
  console.log(`${CHATS.length} conversations per account.`);
  if (!hasVision) {
    console.log(
      "No OPENAI_API_KEY set, so drawings were left stored rather than " +
        "given invented descriptions.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
