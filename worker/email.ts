import type { Env } from "./types";

/**
 * Transactional email via Brevo's HTTP API (https://api.brevo.com/v3/smtp/email).
 *
 * Why Brevo and not Cloudflare Email Routing: easydriving.ca's MX points at Microsoft 365
 * (info@easydriving.ca is a live Outlook mailbox). Enabling Email Routing would seize the
 * domain's MX and break their real inbound mail, so we send *outbound* through Brevo's API,
 * which needs no MX change — the notification simply lands in the existing Outlook inbox.
 *
 * Free tier is 300 emails/day, comfortably above a couple hundred bookings/day. Sending is
 * strictly best-effort: any failure is logged and swallowed so it can never block or fail a
 * booking's calendar sync. Staff also see every booking via calendar reader ACL, so a missed
 * email degrades gracefully to "visible on the calendar, just no email ping".
 */

interface StaffNotification {
  to: string[];
  subject: string;
  /** Plain-text body (fallback for clients that don't render HTML). */
  text: string;
  /**
   * Optional pre-rendered HTML body. When provided it is sent verbatim as Brevo htmlContent
   * (NOT escaped) — the caller is responsible for it being safe, branded markup. When omitted,
   * `text` is shown in a minimal escaped <pre> wrapper.
   */
  html?: string;
}

/**
 * Result of a staff-notification send. `ok: true` means Brevo accepted the message (or there was
 * nothing to do — no key/recipients). On failure, `error` is a short reason the caller can persist
 * on the booking so a silent misconfiguration (e.g. an unverified Brevo sender) surfaces to admins.
 */
export interface StaffNotificationResult {
  ok: boolean;
  error?: string;
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export async function sendStaffNotification(
  env: Env,
  notification: StaffNotification
): Promise<StaffNotificationResult> {
  if (!env.BREVO_API_KEY) {
    // No key configured — notifications are opt-in. Not an error, nothing to record.
    return { ok: true };
  }
  const recipients = notification.to
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!recipients.length) return { ok: true };

  const fromEmail = env.NOTIFY_FROM_EMAIL?.trim() || "notifications@easydriving.ca";
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: "Easy Driving Bookings" },
        to: recipients.map((email) => ({ email })),
        subject: notification.subject,
        textContent: notification.text,
        // Brevo requires at least one content field; send both for wide client support. Use the
        // caller's branded HTML when supplied, otherwise fall back to an escaped <pre> of the text.
        htmlContent: notification.html
          || `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(notification.text)}</pre>`
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[email] staff notification failed", response.status, detail);
      // Surface a compact, admin-readable reason (Brevo returns JSON like {"message":"..."}).
      return { ok: false, error: `Brevo ${response.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    console.error("[email] staff notification threw", error);
    return { ok: false, error: error instanceof Error ? error.message : "email send failed" };
  }
}

/**
 * Wrap booking content in the Easy Driving branded HTML email shell — header bar in the brand
 * colour, white content card, and a footer with contact details. `title` is the banner heading;
 * `bodyHtml` is the inner content (already valid HTML — e.g. the rendered admin template, which
 * uses <b>/<br>). Uses inline styles and table layout for broad email-client compatibility.
 */
export function renderBrandedEmail(title: string, bodyHtml: string): string {
  const BRAND = "#EF4423";
  const INK = "#14100F";
  const CREAM = "#F6F3F2";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="background:${BRAND};padding:20px 28px">
          <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.2px">Easy Driving School</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:${INK}">${title}</h1>
          <div style="font-size:14px;line-height:1.6;color:${INK}">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #eee;font-size:12px;line-height:1.6;color:#6b6461">
          Easy Driving School &nbsp;·&nbsp; 514-463-1043 &nbsp;·&nbsp;
          <a href="mailto:info@easydriving.ca" style="color:${BRAND};text-decoration:none">info@easydriving.ca</a> &nbsp;·&nbsp;
          <a href="https://www.easydriving.ca" style="color:${BRAND};text-decoration:none">easydriving.ca</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Strip HTML tags to a readable plain-text fallback (collapses <br> and block tags to newlines). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
