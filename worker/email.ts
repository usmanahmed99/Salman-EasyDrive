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
  /** Plain-text body; also sent as a minimal HTML wrapper for client compatibility. */
  text: string;
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export async function sendStaffNotification(env: Env, notification: StaffNotification): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    // No key configured — notifications are opt-in. Not an error.
    return false;
  }
  const recipients = notification.to
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!recipients.length) return false;

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
        // Brevo requires at least one content field; send both for wide client support.
        htmlContent: `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(notification.text)}</pre>`
      })
    });
    if (!response.ok) {
      console.error("[email] staff notification failed", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] staff notification threw", error);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
