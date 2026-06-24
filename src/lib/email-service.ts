import { Resend } from "resend";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";

/* Use configured FROM address, fall back to Resend's verified test address.
   Until chronixtechnology.com is verified in Resend, emails will only reach
   the Resend account owner email. Verify at resend.com/domains to send to all. */
const FROM    = process.env.RESEND_FROM_EMAIL ?? "Chronix ERP <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://workspace.chronixtechnology.com/";

/* Lazy singleton — only instantiated when RESEND_API_KEY is present at runtime.
   Avoids a build-time crash when the env var is not set in CI. */
let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export interface EmailResult {
  sent:     boolean;
  skipped?: string;   // reason if not sent
  error?:   string;   // Resend API error message
}

export interface EmailAttachment {
  filename: string;
  content:  Buffer;
}

export async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<EmailResult> {
  if (!to.length) return { sent: false, skipped: "no recipients" };

  const client = getResend();
  if (!client)    return { sent: false, skipped: "RESEND_API_KEY not configured — check env vars and restart the dev server" };

  try {
    const payload: Parameters<typeof client.emails.send>[0] = {
      from: FROM, to, subject, html,
      ...(attachments?.length ? {
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content:  a.content.toString("base64"),
        })),
      } : {}),
    };
    const { error } = await client.emails.send(payload);
    if (error) return { sent: false, error: `Resend: ${error.message}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: String(err) };
  }
}

/* ── Email templates ─────────────────────────────────────────── */

function shell(accentColor: string, badge: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090f;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
  <tr><td style="background:${accentColor};padding:20px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.08em;font-family:monospace;">CHRONIX TECHNOLOGY LIMITED</p>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${badge}</p>
  </td></tr>
  ${content}
  <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0;color:rgba(255,255,255,0.25);font-size:10px;line-height:1.6;">
      <a href="https://chronixtechnology.com" style="color:rgba(255,255,255,0.25);text-decoration:underline;">Chronix Technology Limited</a> · Lekki Phase 1, Lagos, Nigeria<br>
      This is an automated system notification from Chronix Technology Limited. Do not reply to this email.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function bodyRow(title: string, message: string, link: string, btnLabel: string): string {
  return `<tr><td style="padding:32px;">
    <p style="margin:0 0 8px;color:#fff;font-size:18px;font-weight:600;">${title}</p>
    <p style="margin:0 0 28px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">${message}</p>
    <a href="${APP_URL}${link}" style="display:inline-block;background:#e85d04;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;">${btnLabel} →</a>
  </td></tr>`;
}

function disclaimer(text: string): string {
  return `<tr><td style="padding:0 32px 24px;">
    <p style="margin:0;color:rgba(255,255,255,0.2);font-size:11px;">${text}</p>
  </td></tr>`;
}

export function taxReminderEmail(title: string, message: string, link: string): string {
  return shell(
    "#e85d04",
    "Tax Notification",
    bodyRow(title, message, link, "Open Tax Dashboard") +
    disclaimer("All tax figures are estimates only — always verify with a qualified tax advisor before filing with FIRS/LIRS."),
  );
}

export function taxActivityEmail(title: string, message: string, link: string): string {
  return shell(
    "#1a1a2e",
    "Tax Activity",
    bodyRow(title, message, link, "View Details") +
    disclaimer(`This notification was triggered by a recorded action in Chronix ERP ${APP_VERSION_SHORT_LABEL}.`),
  );
}

export function subscriptionAlertEmail(title: string, message: string, link: string): string {
  return shell(
    "#1a1a2e",
    "Subscription Alert",
    bodyRow(title, message, link, "View Subscription"),
  );
}

export function welcomeEmail(displayName: string, role: string): string {
  return shell(
    "#1a1a2e",
    "Welcome",
    `<tr><td style="padding:32px;">
      <p style="margin:0 0 8px;color:#fff;font-size:18px;font-weight:600;">Hello ${displayName},</p>
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">Welcome to Chronix Technology Limited! Your account has been successfully created, and you're now ready to access the Chronix platform.</p>
      <p style="margin:0 0 24px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">As a valued member of our team, you can sign in to manage your activities, access company resources, collaborate with colleagues, and stay updated with important information.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:28px;">
        <tr>
          <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;">Account Status</p>
            <p style="margin:2px 0 0;color:#fff;font-size:13px;">Active</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;color:rgba(255,255,255,0.3);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;">Role</p>
            <p style="margin:2px 0 0;color:#fff;font-size:13px;">${role}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Get Started</p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#e85d04;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;margin-bottom:28px;">Go to Dashboard →</a>
      <p style="margin:24px 0 16px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">If you experience any issues accessing your account, please contact the Chronix Technology support team for assistance.</p>
      <p style="margin:0 0 20px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">We are excited to have you on board and look forward to achieving great things together.</p>
      <p style="margin:0;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">Best regards,<br>Chronix Technology Limited</p>
    </td></tr>`,
  );
}

/** Password reset link comes from Admin SDK's generatePasswordResetLink() —
 * already a full, absolute URL (Firebase's own hosted action handler), so
 * it's used as-is here instead of via bodyRow() (which prefixes APP_URL). */
export function passwordResetEmail(link: string): string {
  return shell(
    "#1a1a2e",
    "Password Reset",
    `<tr><td style="padding:32px;">
      <p style="margin:0 0 8px;color:#fff;font-size:18px;font-weight:600;">Reset your password</p>
      <p style="margin:0 0 28px;color:rgba(255,255,255,0.55);font-size:14px;line-height:1.7;">Follow this link to choose a new password for your Chronix ERP account. If you didn't request this, you can ignore this email.</p>
      <a href="${link}" style="display:inline-block;background:#e85d04;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;">Reset Password →</a>
    </td></tr>`,
  );
}

export function invoiceEmail(invoiceNumber: string, clientName: string, total: string, dueDate: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr><td style="background:#003366;padding:28px 32px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:0.06em;font-family:monospace;">CHRONIX TECHNOLOGY LIMITED</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Invoice Notification</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 8px;color:#111;font-size:18px;font-weight:600;">Dear ${clientName},</p>
    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;">
      Please find attached your invoice <strong style="color:#003366;">${invoiceNumber}</strong>.
      A PDF copy is attached to this email for your records.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Invoice Number</p>
          <p style="margin:4px 0 0;color:#111;font-size:15px;font-weight:700;">${invoiceNumber}</p>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0;">
          <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Amount Due</p>
          <p style="margin:4px 0 0;color:#e85d04;font-size:15px;font-weight:700;">${total}</p>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0;">
          <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Due Date</p>
          <p style="margin:4px 0 0;color:#111;font-size:15px;font-weight:700;">${dueDate}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#555;font-size:13px;line-height:1.7;">
      Kindly make payment by the due date to the account details below:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:28px;">
      <tr>
        <td style="padding:12px 20px;border-right:1px solid #e2e8f0;">
          <p style="margin:0;color:#888;font-size:10px;text-transform:uppercase;">Bank</p>
          <p style="margin:3px 0 0;color:#111;font-size:12px;font-weight:600;">Fidelity Bank</p>
        </td>
        <td style="padding:12px 20px;border-right:1px solid #e2e8f0;">
          <p style="margin:0;color:#888;font-size:10px;text-transform:uppercase;">Account Number</p>
          <p style="margin:3px 0 0;color:#111;font-size:12px;font-weight:600;">5601601109</p>
        </td>
        <td style="padding:12px 20px;">
          <p style="margin:0;color:#888;font-size:10px;text-transform:uppercase;">Account Name</p>
          <p style="margin:3px 0 0;color:#111;font-size:12px;font-weight:600;">Chronix Technology Limited</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#555;font-size:13px;line-height:1.7;">
      If you have any questions about this invoice, please contact us at
      <a href="mailto:Info@chronixtechnology.com" style="color:#003366;">Info@chronixtechnology.com</a>
      or call <strong>+234 91 2664 3718</strong>.
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <p style="margin:0;color:#aaa;font-size:10px;line-height:1.6;">
      Chronix Technology Limited · No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos<br>
      TIN: 33646874-0001 · www.chronixtechnology.com
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
