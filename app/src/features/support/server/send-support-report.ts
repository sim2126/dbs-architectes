/**
 * Support reports — the "Get help" path.
 *
 * Everything a user submits lands in one inbox in a fixed format, with the
 * context they would otherwise be asked for in a follow-up email: who they
 * are, what page they were on, what browser, and what they attached.
 *
 * The reporter's own address is set as Reply-To, so replying goes to them
 * rather than to the sending account.
 */

import { sendEmail, type EmailAttachment } from "@/platform/email/send";

/** Where reports go. Not env-configurable — a misconfigured env var here
 *  would silently route user problems into the void. */
export const SUPPORT_INBOX = "prabhakar@infralytica.tech";

export type ReportKind = "problem" | "question";

const KIND_LABEL: Record<ReportKind, string> = {
  problem: "Problem",
  question: "Question",
};

export type SupportReportInput = {
  kind: ReportKind;
  message: string;
  /** The page the user was on when they opened the dialog. */
  pageUrl: string;
  userAgent: string;
  reporter: { id: string; name: string | null; email: string; role: string };
  attachments: EmailAttachment[];
};

export async function sendSupportReport(input: SupportReportInput) {
  const label = KIND_LABEL[input.kind];
  const who = input.reporter.name ?? input.reporter.email;

  // Fixed subject shape so the inbox can be filtered and scanned. The page
  // path is in the subject because it is the single most useful field when
  // triaging a screenshot with no other context.
  const subject = `[Friday ${label}] ${who} — ${safePath(input.pageUrl)}`;

  const lines = [
    `${label} reported from DBS Friday`,
    "",
    `From:    ${who} <${input.reporter.email}>`,
    `Role:    ${input.reporter.role}`,
    `Page:    ${input.pageUrl}`,
    `Browser: ${input.userAgent}`,
    `Time:    ${new Date().toISOString()}`,
    `Files:   ${input.attachments.length === 0 ? "none" : input.attachments.map((a) => a.filename).join(", ")}`,
    "",
    "─".repeat(56),
    "",
    input.message.trim(),
    "",
  ];

  return sendEmail({
    to: SUPPORT_INBOX,
    replyTo: input.reporter.email,
    subject,
    text: lines.join("\n"),
    attachments: input.attachments,
  });
}

/** Path only — a full URL in a subject line makes it unreadable. */
function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.slice(0, 80);
  }
}
