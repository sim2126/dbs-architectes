import { spawnSync } from "node:child_process";

// These are reviewed upstream advisories with no non-breaking dependency
// update available. The check fails for every other moderate-or-higher
// advisory, and the review date prevents this exception list becoming silent
// permanent debt.
const acceptedAdvisories = new Map([
  [
    1119441,
    {
      package: "uuid (via exceljs)",
      owner: "sim2126",
      reviewBy: "2026-09-30",
      reason: "ExcelJS uses UUID v4; the advisory concerns v3/v5/v6 buffer APIs.",
    },
  ],
  [
    1121191,
    {
      package: "nodemailer (via Auth.js)",
      owner: "sim2126",
      reviewBy: "2026-09-30",
      reason: "Auth.js pins the affected major; Friday never accepts Nodemailer's raw message option.",
    },
  ],
  [
    1124298,
    {
      package: "valibot (via Prisma CLI)",
      owner: "sim2126",
      reviewBy: "2026-09-30",
      reason: "Only Prisma's trusted build-time configuration path is affected.",
    },
  ],
  [
    1145093,
    {
      package: "deepmerge-ts (via Prisma CLI)",
      owner: "sim2126",
      reviewBy: "2026-09-30",
      reason: "Only trusted Prisma configuration is merged; the offered fix downgrades Prisma.",
    },
  ],
]);

const npmCommand = process.platform === "win32" ? process.env.ComSpec : "npm";
const npmArguments =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", "audit", "--omit=dev", "--json"]
    : ["audit", "--omit=dev", "--json"];
const result = spawnSync(npmCommand, npmArguments, {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Production dependency audit did not return valid JSON.");
  if (result.error) console.error(result.error.message);
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

if (report.error || !report.vulnerabilities) {
  console.error(
    `Production dependency audit failed: ${report.error?.summary ?? "missing vulnerability report"}`,
  );
  process.exit(1);
}

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function advisoryIdsFor(packageName, seen = new Set()) {
  if (seen.has(packageName)) return new Set();
  seen.add(packageName);

  const ids = new Set();
  const vulnerability = report.vulnerabilities[packageName];
  for (const via of vulnerability?.via ?? []) {
    if (typeof via === "string") {
      for (const id of advisoryIdsFor(via, seen)) ids.add(id);
    } else if (typeof via.source === "number") {
      ids.add(via.source);
    }
  }
  return ids;
}

const unknown = [];
const acceptedIdsInReport = new Set();
for (const [packageName, vulnerability] of Object.entries(
  report.vulnerabilities,
)) {
  if ((severityRank[vulnerability.severity] ?? 0) < severityRank.moderate) {
    continue;
  }

  const ids = advisoryIdsFor(packageName);
  if (ids.size === 0 || [...ids].some((id) => !acceptedAdvisories.has(id))) {
    unknown.push({ packageName, severity: vulnerability.severity, ids: [...ids] });
    continue;
  }
  for (const id of ids) acceptedIdsInReport.add(id);
}

const today = new Date().toISOString().slice(0, 10);
const expired = [...acceptedIdsInReport].filter(
  (id) => acceptedAdvisories.get(id).reviewBy < today,
);

if (unknown.length > 0 || expired.length > 0) {
  for (const finding of unknown) {
    console.error(
      `Unreviewed ${finding.severity} advisory: ${finding.packageName}` +
        (finding.ids.length ? ` (${finding.ids.join(", ")})` : ""),
    );
  }
  for (const id of expired) {
    const accepted = acceptedAdvisories.get(id);
    console.error(
      `Accepted advisory ${id} (${accepted.package}) requires review; due ${accepted.reviewBy}.`,
    );
  }
  process.exit(1);
}

if (acceptedIdsInReport.size === 0) {
  console.log("Production dependency audit passed with no moderate-or-higher findings.");
} else {
  console.log(
    `Production dependency audit passed with ${acceptedIdsInReport.size} reviewed advisory exceptions:`,
  );
  for (const id of [...acceptedIdsInReport].sort()) {
    const accepted = acceptedAdvisories.get(id);
    console.log(
      `- ${id}: ${accepted.package}; owner ${accepted.owner}; review by ${accepted.reviewBy}. ${accepted.reason}`,
    );
  }
}
