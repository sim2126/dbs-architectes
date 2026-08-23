import JSZip from "jszip";
import ExcelJS from "exceljs";

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

/** Remove clock and platform variance from generated OOXML ZIP containers. */
export async function serialiseDeterministicArchive(
  input: JSZip | Buffer | Uint8Array,
): Promise<Buffer> {
  const zip = input instanceof JSZip ? input : await JSZip.loadAsync(input);
  for (const entry of Object.values(zip.files)) {
    entry.date = FIXTURE_TIMESTAMP;
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}

export const FIXED_FIXTURE_TIMESTAMP = FIXTURE_TIMESTAMP;

export type DemoWorkbookSheet = {
  name: string;
  rows: (string | number)[][];
};

/** Generate the same XLSX bytes on every run and operating system. */
export async function createDeterministicXlsx(
  sheets: DemoWorkbookSheet[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Friday demo seed";
  workbook.created = new Date(FIXTURE_TIMESTAMP);
  workbook.modified = new Date(FIXTURE_TIMESTAMP);
  workbook.lastPrinted = new Date(FIXTURE_TIMESTAMP);
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
  }
  return serialiseDeterministicArchive(
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
}

/** Generate the minimal readable DOCX used by the demo fixture seed. */
export async function createDeterministicDocx(
  paragraphs: string[],
): Promise<Buffer> {
  const xmlEsc = (value: string) =>
    value
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
      (paragraph) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(paragraph)}</w:t></w:r></w:p>`,
    )
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body>
</w:document>`,
  );
  return serialiseDeterministicArchive(zip);
}
