/**
 * Email sender — Gmail SMTP with a dev/no-creds fallback.
 *
 * Production-targets AWS SES later (see CLAUDE.md tech stack). For
 * the current DBS scale (≤30 users, ≤a few invites/day) Gmail SMTP
 * is fine.
 *
 * Configuration (env):
 *   GMAIL_USER             — the gmail address that sends mail
 *   GMAIL_APP_PASSWORD     — a Google App Password (NOT the account
 *                            password). 2FA + app-password required;
 *                            see https://myaccount.google.com/apppasswords
 *   EMAIL_FROM             — optional. Defaults to GMAIL_USER. Format
 *                            "DBS Friday <gmail-address>".
 *
 * If GMAIL_USER / GMAIL_APP_PASSWORD are NOT set, sendEmail() falls
 * back to "console + return ok with deliveredVia: 'dev-log'". The
 * full message (incl. URLs and tokens) is logged so an admin running
 * the dev server can copy/paste invite + reset links into Slack /
 * WhatsApp manually. This keeps every flow end-to-end testable with
 * no third-party setup.
 *
 * Callers should:
 *   - Trust deliveredVia. If it's "dev-log" in production, surface a
 *     warning to the admin so they know to configure SMTP.
 *   - NEVER include secrets that aren't supposed to be in the message
 *     itself (e.g. don't log unrelated tokens for "debugging").
 */

import nodemailer from "nodemailer";

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded content, without a data: URL prefix. */
  content: string;
  contentType: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional attachments. Kept small — see the support route's caps. */
  attachments?: EmailAttachment[];
  /** Where a reply should go, when it differs from the sending account. */
  replyTo?: string;
};

export type SendEmailResult = {
  ok: boolean;
  deliveredVia: "gmail-smtp" | "dev-log" | "failed";
  error?: string;
};

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM ?? (GMAIL_USER ? `DBS Friday <${GMAIL_USER}>` : "DBS Friday");

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getTransporter();

  if (!transporter) {
    // Dev fallback — log so the admin (or you, during development)
    // can copy/paste the link out of the terminal.
    console.warn(
      "[email] No SMTP credentials configured (GMAIL_USER + GMAIL_APP_PASSWORD).",
      "Message NOT sent. Contents below for manual delivery:",
    );
    console.warn(`[email]   To:      ${input.to}`);
    console.warn(`[email]   Subject: ${input.subject}`);
    console.warn(`[email]   Body:`);
    console.warn(input.text.split("\n").map((l) => `[email]     ${l}`).join("\n"));
    return { ok: true, deliveredVia: "dev-log" };
  }

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64" as const,
        contentType: a.contentType,
      })),
    });
    return { ok: true, deliveredVia: "gmail-smtp" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown SMTP error";
    console.error("[email] SMTP send failed", { to: input.to, error: message });
    return { ok: false, deliveredVia: "failed", error: message };
  }
}
