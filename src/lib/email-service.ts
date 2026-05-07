import { Resend } from "resend";

const FROM    = process.env.RESEND_FROM_EMAIL ?? "Chronix ERP <notifications@chronix.tech>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://chronix-erp.vercel.app";

/* Lazy singleton — only instantiated when RESEND_API_KEY is present at runtime.
   Avoids a build-time crash when the env var is not set in CI. */
let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  if (!to.length) return;
  const client = getResend();
  if (!client) return;
  await client.emails.send({ from: FROM, to, subject, html });
}

/* ── Email templates ─────────────────────────────────────────── */

function shell(accentColor: string, badge: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090f;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
  <tr><td style="background:${accentColor};padding:20px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.08em;font-family:monospace;">CHRONIX ERP</p>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">${badge}</p>
  </td></tr>
  ${content}
  <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
    <p style="margin:0;color:rgba(255,255,255,0.25);font-size:10px;line-height:1.6;">
      Chronix Technology Limited · Lekki Phase 1, Lagos, Nigeria<br>
      This is an automated system notification from Chronix ERP. Do not reply to this email.
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
    disclaimer("This notification was triggered by a recorded action in Chronix ERP."),
  );
}

export function subscriptionAlertEmail(title: string, message: string, link: string): string {
  return shell(
    "#1a1a2e",
    "Subscription Alert",
    bodyRow(title, message, link, "View Subscription"),
  );
}
