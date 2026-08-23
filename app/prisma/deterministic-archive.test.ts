import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  createDeterministicDocx,
  createDeterministicXlsx,
  serialiseDeterministicArchive,
} from "./deterministic-archive";

async function archiveWithDate(date: Date) {
  const zip = new JSZip();
  zip.file("word/document.xml", "<document>Friday</document>", { date });
  return serialiseDeterministicArchive(zip);
}

test("normalises changing ZIP timestamps to byte-identical output", async () => {
  const first = await archiveWithDate(new Date("2025-01-01T10:30:00Z"));
  const second = await archiveWithDate(new Date("2026-08-23T18:45:00Z"));
  assert.deepEqual(first, second);
});

test("generates byte-identical, readable XLSX fixtures", async () => {
  const sheets = [
    {
      name: "Projects",
      rows: [
        ["Code", "Fee"],
        ["FR-001", 125_000],
      ],
    },
  ];
  const first = await createDeterministicXlsx(sheets);
  const second = await createDeterministicXlsx(sheets);
  assert.deepEqual(first, second);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    first as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  assert.equal(workbook.getWorksheet("Projects")?.getCell("A2").value, "FR-001");
});

test("generates byte-identical, readable DOCX fixtures", async () => {
  const paragraphs = ["Friday project brief", "Client & architect aligned."];
  const first = await createDeterministicDocx(paragraphs);
  const second = await createDeterministicDocx(paragraphs);
  assert.deepEqual(first, second);

  const archive = await JSZip.loadAsync(first);
  const document = await archive.file("word/document.xml")?.async("string");
  assert.match(document ?? "", /Friday project brief/);
  assert.match(document ?? "", /Client &amp; architect aligned\./);
});
