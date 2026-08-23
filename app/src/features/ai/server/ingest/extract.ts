/**
 * Text extraction for DBS AI attachments.
 *
 * One entry point, three paths chosen by `kindForType`. Each returns text
 * plus a unit count, so the UI can say how much was read rather than implying
 * the whole file was understood.
 *
 * Every path fails loudly. A silent empty string would set `ingestedAt` and
 * tell the user the assistant can read a file it has no text for — the exact
 * failure the `ingestedAt` flag exists to prevent.
 */

import OpenAI from "openai";
import {
  isIngestibleUpload,
  kindForType,
  type IngestKind,
} from "../../domain/attachments";
import {
  createOpenAIStructuredCompletion,
  parseStructuredOutput,
} from "@/platform/ai/provider";

/** Cap on stored text. Beyond this, context cost outweighs the marginal page,
 *  and truncation is stated rather than hidden. */
export const MAX_EXTRACTED_CHARS = 120_000;
export const EXTRACTION_TRUNCATION_MARKER =
  "[Friday: extraction stopped at the safe text limit; the remainder was not read.]";

export type ExtractResult = {
  text: string;
  /** Pages, sheets or rows covered. */
  units: number;
  truncated: boolean;
};

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_ARCHIVE_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 500;
const MAX_TABLE_ROWS = 100_000;

/** Check that stored bytes still match the metadata signed at upload time. */
export function validateAttachmentBytes(input: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  expectedBytes: number;
  storedContentType?: string | null;
}): void {
  const { bytes, filename } = input;
  const contentType = normaliseMime(input.contentType);
  if (!isIngestibleUpload(filename, contentType)) {
    throw new ExtractError("The filename does not match the declared file type.");
  }
  if (bytes.byteLength !== input.expectedBytes) {
    throw new ExtractError("The stored file does not match the uploaded file size.");
  }
  if (
    input.storedContentType &&
    normaliseMime(input.storedContentType) !== contentType
  ) {
    throw new ExtractError("The stored file content type does not match the upload.");
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (contentType === "application/pdf") {
    assertExtension(extension, ["pdf"]);
    assertMagic(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  } else if (contentType === "image/png") {
    assertMagic(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  } else if (contentType === "image/jpeg") {
    assertMagic(bytes, [0xff, 0xd8, 0xff]);
  } else if (contentType === "image/gif") {
    const header = ascii(bytes, 0, 6);
    if (header !== "GIF87a" && header !== "GIF89a") invalidSignature();
  } else if (contentType === "image/webp") {
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
      invalidSignature();
    }
  } else if (contentType === "image/bmp") {
    assertMagic(bytes, [0x42, 0x4d]);
  } else if (contentType === "image/tiff") {
    const little = matchesMagic(bytes, [0x49, 0x49, 0x2a, 0x00]);
    const big = matchesMagic(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
    if (!little && !big) invalidSignature();
  } else if (contentType === "image/heic" || contentType === "image/heif") {
    if (ascii(bytes, 4, 4) !== "ftyp") invalidSignature();
  } else if (
    contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    assertExtension(extension, contentType.includes("spreadsheet") ? ["xlsx"] : ["docx"]);
    assertMagic(bytes, [0x50, 0x4b]);
    assertSafeZip(bytes);
  } else if (contentType === "text/csv" || contentType === "application/csv") {
    assertExtension(extension, ["csv"]);
    if (bytes.includes(0)) {
      throw new ExtractError("The CSV contains binary data and could not be read safely.");
    }
  }
}

function normaliseMime(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function matchesMagic(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function assertMagic(bytes: Uint8Array, signature: number[]): void {
  if (!matchesMagic(bytes, signature)) invalidSignature();
}

function invalidSignature(): never {
  throw new ExtractError("The file contents do not match the declared file type.");
}

function assertExtension(extension: string, allowed: string[]): void {
  if (!allowed.includes(extension)) {
    throw new ExtractError("The filename does not match the declared file type.");
  }
}

/** Read the ZIP central directory without expanding it. OOXML parsers otherwise
 * accept tiny archives whose entries inflate to hundreds of megabytes. */
function assertSafeZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) invalidSignature();

  const entries = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (
    entries > MAX_ARCHIVE_ENTRIES ||
    centralOffset + centralSize > bytes.byteLength
  ) {
    throw new ExtractError("The document archive is too complex to read safely.");
  }

  let offset = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      invalidSignature();
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ExtractError("ZIP64 documents are not supported for AI reading.");
    }
    expandedBytes += uncompressedSize;
    if (
      expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 200)
    ) {
      throw new ExtractError("The document expands beyond the safe reading limit.");
    }
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + filenameLength + extraLength + commentLength;
  }
}

export async function extractText(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
): Promise<ExtractResult> {
  const kind: IngestKind | null = kindForType(contentType);
  if (!kind) {
    throw new ExtractError(`${contentType} is not a supported type.`);
  }

  const result =
    kind === "pdf"
      ? await extractPdf(bytes)
      : kind === "table"
        ? await extractTable(bytes, contentType, filename)
        : kind === "doc"
          ? await extractDoc(bytes)
          : await extractImage(bytes, contentType);

  if (result.text.trim().length === 0) {
    // A scanned PDF with no text layer lands here. Saying so is more useful
    // than storing an empty string and calling the file readable.
    throw new ExtractError(
      "No text could be read from this file. If it is a scan, try exporting it as an image.",
    );
  }
  return result;
}

function cap(text: string, units: number): ExtractResult {
  if (text.length <= MAX_EXTRACTED_CHARS) {
    return { text, units, truncated: false };
  }
  const suffix = `\n\n${EXTRACTION_TRUNCATION_MARKER}`;
  return {
    text: text.slice(0, MAX_EXTRACTED_CHARS - suffix.length) + suffix,
    units,
    truncated: true,
  };
}

// ── PDF ───────────────────────────────────────────────────────────

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  // unpdf is imported lazily so its pdf.js payload is not pulled into every
  // serverless bundle that happens to import this module.
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  try {
    // unpdf rejects a Node Buffer outright, even though Buffer extends
    // Uint8Array and so satisfies this module's signature. Normalised to a
    // plain view over the same memory — no copy — so any caller holding a
    // Buffer works rather than failing on a type check it cannot see.
    const plain = new Uint8Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    const pdf = await getDocumentProxy(plain);
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ExtractError(
        `PDFs are limited to ${MAX_PDF_PAGES.toLocaleString("en-GB")} pages for AI reading.`,
      );
    }
    const { totalPages, text } = await unpdfExtract(pdf, { mergePages: true });
    // mergePages:true narrows the return type to a single string, so no
    // array branch is needed — TypeScript rejects one as unreachable.
    return cap(text, totalPages);
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError("Could not read the PDF safely.");
  }
}

// ── CSV and Excel ─────────────────────────────────────────────────

async function extractTable(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
): Promise<ExtractResult> {
  const isCsv =
    contentType.startsWith("text/csv") ||
    contentType === "application/csv" ||
    filename.toLowerCase().endsWith(".csv");

  if (isCsv) {
    // CSV needs no dependency. Decoded as UTF-8 and passed through as-is:
    // a model reads delimited text perfectly well, and re-formatting it into
    // prose would lose the column structure that makes it useful.
    const text = new TextDecoder("utf-8").decode(bytes);
    const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
    if (rows > MAX_TABLE_ROWS) {
      throw new ExtractError(
        `Tables are limited to ${MAX_TABLE_ROWS.toLocaleString("en-GB")} rows for AI reading.`,
      );
    }
    return cap(text, rows);
  }

  const ExcelJS = (await import("exceljs")).default;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

    const parts: string[] = [];
    let sheets = 0;
    let rows = 0;
    workbook.eachSheet((sheet) => {
      sheets += 1;
      // Sheet names carry meaning in a project workbook — "Phase 2 costs" is
      // context the rows alone do not give.
      parts.push(`### ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        rows += 1;
        if (rows > MAX_TABLE_ROWS) return;
        const cells = (row.values as unknown[])
          .slice(1)
          .map((v) => (v === null || v === undefined ? "" : formatCell(v)));
        if (cells.some((c) => c !== "")) parts.push(cells.join("\t"));
      });
      parts.push("");
    });
    if (rows > MAX_TABLE_ROWS) {
      throw new ExtractError(
        `Tables are limited to ${MAX_TABLE_ROWS.toLocaleString("en-GB")} rows for AI reading.`,
      );
    }
    return cap(parts.join("\n"), sheets);
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError("Could not read the spreadsheet safely.");
  }
}

/** ExcelJS cell values can be rich objects — formulas, hyperlinks, rich text.
 *  Flatten to what a reader would see, not the internal shape. */
function formatCell(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    if (typeof v.result === "string" || typeof v.result === "number") {
      return String(v.result);
    }
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((r) => (r as { text?: string }).text ?? "")
        .join("");
    }
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}

// ── Word documents ────────────────────────────────────────────────

/**
 * .docx via mammoth's raw-text reader.
 *
 * Raw text rather than mammoth's HTML converter on purpose. The HTML path
 * would put document-authored markup into a string that later becomes model
 * context and, through the preview, the DOM — an injection surface with no
 * upside, since the agent needs the words, not the styling.
 *
 * Units are paragraphs. Pages are not a property of a .docx at all: pagination
 * is decided by whatever renders it, so reporting a page count would be
 * inventing a number.
 */
async function extractDoc(bytes: Uint8Array): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  try {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    const paragraphs = value
      .split(/\n+/)
      .filter((line) => line.trim().length > 0);
    return cap(paragraphs.join("\n\n"), paragraphs.length);
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    // The usual cause is a legacy .doc renamed to .docx — mammoth cannot open
    // an OLE container. Saying which file is wrong beats a parser stack trace.
    throw new ExtractError(
      "Could not read the document safely. Legacy .doc files must be saved as .docx first.",
    );
  }
}

// ── Images ────────────────────────────────────────────────────────

/**
 * Images go to a vision model rather than an OCR engine.
 *
 * Two reasons. Practically, tesseract.js is roughly 30 MB of WASM plus
 * training data, which does not belong in a serverless function. More
 * importantly, OCR on an architectural drawing returns scattered label text
 * with no sense of what the drawing shows; a vision model describes the plan
 * AND reads the labels, which is what makes it usable as context.
 *
 * Degrades gracefully — if no key is configured the extraction fails with a
 * clear reason rather than silently marking the file readable.
 */
async function extractImage(
  bytes: Uint8Array,
  contentType: string,
): Promise<ExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ExtractError(
      "Image reading is unavailable — no vision provider is configured.",
    );
  }

  const base64 = Buffer.from(bytes).toString("base64");
  try {
    const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
    const completion = await createOpenAIStructuredCompletion(
      client,
      {
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "Transcribe the supplied image for later reference. Report all legible text verbatim, including dimensions, room names, revision marks and title-block fields. Describe what the image shows in two or three sentences. Never infer a value that is not visible; record uncertainty in legibilityNotes.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${contentType};base64,${base64}` },
              },
            ],
          },
        ],
      },
      {
        model: "gpt-4o-mini",
        temperature: 0,
        schemaName: "AttachmentImageExtraction",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            transcription: { type: "string" },
            description: { type: "string" },
            legibilityNotes: { type: "array", items: { type: "string" } },
          },
          required: ["transcription", "description", "legibilityNotes"],
        },
      },
    );
    const output = parseStructuredOutput(
      completion.choices[0]?.message.content ?? "",
      parseImageExtraction,
    );
    const text = [
      output.transcription && `Transcription\n${output.transcription}`,
      output.description && `Description\n${output.description}`,
      output.legibilityNotes.length > 0
        ? `Legibility notes\n${output.legibilityNotes.map((note) => `- ${note}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");
    return cap(text, 1);
  } catch {
    throw new ExtractError("Image reading is temporarily unavailable. Please retry shortly.");
  }
}

function parseImageExtraction(value: Record<string, unknown>): {
  transcription: string;
  description: string;
  legibilityNotes: string[];
} {
  if (
    typeof value.transcription !== "string" ||
    typeof value.description !== "string" ||
    !Array.isArray(value.legibilityNotes) ||
    !value.legibilityNotes.every((note) => typeof note === "string")
  ) {
    throw new TypeError("Invalid image extraction response.");
  }
  return {
    transcription: value.transcription,
    description: value.description,
    legibilityNotes: value.legibilityNotes as string[],
  };
}
