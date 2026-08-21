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

import { kindForType, type IngestKind } from "../../domain/attachments";

/** Cap on stored text. Beyond this, context cost outweighs the marginal page,
 *  and truncation is stated rather than hidden. */
export const MAX_EXTRACTED_CHARS = 120_000;

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
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), units, truncated: true };
}

// ── PDF ───────────────────────────────────────────────────────────

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  // unpdf is imported lazily so its pdf.js payload is not pulled into every
  // serverless bundle that happens to import this module.
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await unpdfExtract(pdf, { mergePages: true });
    // mergePages:true narrows the return type to a single string, so no
    // array branch is needed — TypeScript rejects one as unreachable.
    return cap(text, totalPages);
  } catch (err) {
    throw new ExtractError(
      `Could not read the PDF: ${err instanceof Error ? err.message : "unknown error"}`,
    );
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
    return cap(text, rows);
  }

  const ExcelJS = (await import("exceljs")).default;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

    const parts: string[] = [];
    let sheets = 0;
    workbook.eachSheet((sheet) => {
      sheets += 1;
      // Sheet names carry meaning in a project workbook — "Phase 2 costs" is
      // context the rows alone do not give.
      parts.push(`### ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = (row.values as unknown[])
          .slice(1)
          .map((v) => (v === null || v === undefined ? "" : formatCell(v)));
        if (cells.some((c) => c !== "")) parts.push(cells.join("\t"));
      });
      parts.push("");
    });
    return cap(parts.join("\n"), sheets);
  } catch (err) {
    throw new ExtractError(
      `Could not read the spreadsheet: ${err instanceof Error ? err.message : "unknown error"}`,
    );
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      // store:false per the provider posture in MEMORY.md — attachment
      // contents are DBS's and are not retained by the provider.
      store: false,
      // Extraction, not interpretation. Temperature 0 for the same reason the
      // grounding contract clamps it: this output becomes context for a later
      // answer, and invention here propagates.
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "Transcribe and describe the supplied image for later reference. " +
            "Report all legible text verbatim, including dimensions, room " +
            "names, revision marks and title-block fields. Then describe what " +
            "the image shows in two or three sentences. Do not infer values " +
            "that are not visible, and say explicitly when something is " +
            "illegible rather than guessing it.",
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
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ExtractError(
      `Vision provider returned ${res.status}. ${detail.slice(0, 160)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  // One image, one unit.
  return cap(text, 1);
}
