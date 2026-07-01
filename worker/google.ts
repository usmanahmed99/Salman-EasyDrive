import type { Env } from "./types";
import { decrypt, HttpError } from "./utils";

interface GoogleConnection {
  encrypted_refresh_token: string;
}

async function accessToken(env: Env) {
  const connection = await env.DB.prepare(`
    SELECT encrypted_refresh_token FROM google_connections
    WHERE status = 'connected' ORDER BY updated_at DESC LIMIT 1
  `).first<GoogleConnection>();
  if (!connection) return null;
  const refreshToken = await decrypt(env.TOKEN_ENCRYPTION_KEY, connection.encrypted_refresh_token);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const body = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    await env.DB.prepare("UPDATE google_connections SET status = 'error', last_error = ?, updated_at = CURRENT_TIMESTAMP")
      .bind(body.error_description || "Token refresh failed").run();
    throw new HttpError(502, "Google Calendar needs to be reconnected.", "google_reconnect_required");
  }
  return body.access_token;
}

export async function createCalendar(env: Env, summary: string): Promise<string | null> {
  const token = await accessToken(env);
  if (!token) return null;
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary })
  });
  const body = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) {
    console.error("[google] createCalendar failed", response.status, JSON.stringify(body.error));
    return null;
  }
  return body.id;
}

export async function shareCalendar(env: Env, calendarId: string, email: string, role: "reader" | "freeBusyReader" = "reader") {
  const token = await accessToken(env);
  if (!token) return;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role, scope: { type: "user", value: email } })
    }
  );
  if (!response.ok) {
    console.error("[google] shareCalendar failed", response.status, await response.text());
  }
}

export async function listCalendars(env: Env) {
  const token = await accessToken(env);
  if (!token) return [];
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    console.error("[google] calendarList failed", response.status, await response.text());
    throw new HttpError(502, "Could not load Google calendars.", "google_calendar_list_failed");
  }
  const body = await response.json() as { items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> };
  return body.items || [];
}

export async function getFreeBusy(
  env: Env,
  calendarIds: string[],
  timeMin: string,
  timeMax: string
): Promise<Record<string, Array<{ start: string; end: string }>>> {
  if (!calendarIds.length) return {};
  const token = await accessToken(env);
  if (!token) return {};
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id }))
    })
  });
  if (!response.ok) {
    console.error("[google] freeBusy failed", response.status, await response.text());
    throw new HttpError(502, "Calendar availability is temporarily unavailable.", "google_freebusy_failed");
  }
  const body = await response.json() as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  return Object.fromEntries(
    Object.entries(body.calendars || {}).map(([id, value]) => [id, value.busy || []])
  );
}

export async function createCalendarEvent(
  env: Env,
  calendarId: string,
  event: {
    summary: string;
    description: string;
    start: string;
    end: string;
    timezone: string;
    attendeeEmail?: string;
    /**
     * Staff notification inbox(es) — added as attendees so the booking appears on their calendar.
     * Whether Google emails them is controlled by notifyStaffByEmail: on a booking's first sync they
     * are normal invited attendees (emailed); on a retry/resync they are marked responseStatus
     * 'accepted' so Google does not re-invite them. Re-inviting the same fixed staff address on every
     * retry trips Google's per-recipient guard ("Calendar usage limits exceeded.").
     */
    notifyEmails?: string[];
    /** True on first sync (email staff), false on retries (add staff without re-emailing). Default true. */
    notifyStaffByEmail?: boolean;
    bookingId: string;
    reference: string;
  },
  sendUpdates: boolean
) {
  const token = await accessToken(env);
  if (!token) throw new HttpError(503, "Google Calendar is not connected.", "google_not_connected");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates ? "all" : "none"}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start, timeZone: event.timezone },
        end: { dateTime: event.end, timeZone: event.timezone },
        // Attendees only matter when Google should email them (sendUpdates). The student is always a
        // normal invited attendee (gets the invite email). Staff notification inboxes are invited
        // normally on the first sync (notifyStaffByEmail), but on retries they are marked
        // responseStatus 'accepted' so the event still shows on their calendar WITHOUT Google
        // re-inviting them — re-inviting a fixed staff address on every retry trips Google's
        // per-recipient invitation guard ("Calendar usage limits exceeded.").
        attendees: (() => {
          if (!sendUpdates) return undefined;
          const student = event.attendeeEmail?.trim().toLowerCase();
          const staff = (event.notifyEmails || [])
            .map((value) => value?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value) && value !== student);
          const emailStaff = event.notifyStaffByEmail !== false;
          const attendees: Array<{ email: string; responseStatus?: string }> = [];
          if (student) attendees.push({ email: student });
          for (const email of [...new Set(staff)]) {
            // First sync: normal invitee (emailed). Retry: pre-accepted so Google won't re-invite.
            attendees.push(emailStaff ? { email } : { email, responseStatus: "accepted" });
          }
          return attendees.length ? attendees : undefined;
        })(),
        extendedProperties: {
          private: {
            easyDrivingBookingId: event.bookingId,
            easyDrivingReference: event.reference
          }
        }
      })
    }
  );
  const body = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) {
    console.error("[google] createCalendarEvent failed", response.status, JSON.stringify(body.error));
    throw new Error(body.error?.message || "Calendar event creation failed");
  }
  return body.id;
}

export async function deleteCalendar(env: Env, calendarId: string): Promise<void> {
  const token = await accessToken(env);
  if (!token) return;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.ok || response.status === 404 || response.status === 410) return;
  console.error("[google] deleteCalendar failed", response.status, await response.text());
}

/**
 * Look up a single calendar event by id. Used by the reconcile job to detect events
 * that were deleted directly in Google Calendar. Returns `exists: false` only when
 * Google is certain the event is gone (404/410) or reports it as cancelled; on auth
 * or transient errors it throws so the caller can skip rather than wrongly act.
 */
export async function getCalendarEvent(
  env: Env,
  calendarId: string,
  eventId: string
): Promise<{ exists: boolean; cancelled: boolean }> {
  const token = await accessToken(env);
  if (!token) throw new HttpError(503, "Google Calendar is not connected.", "google_not_connected");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 404 || response.status === 410) return { exists: false, cancelled: false };
  if (!response.ok) {
    console.error("[google] getCalendarEvent failed", response.status, await response.text());
    throw new Error(`Calendar event lookup failed (${response.status})`);
  }
  const body = await response.json() as { status?: string };
  return { exists: body.status !== "cancelled", cancelled: body.status === "cancelled" };
}

export async function deleteCalendarEvent(
  env: Env,
  calendarId: string,
  eventId: string,
  sendUpdates: boolean
) {
  const token = await accessToken(env);
  if (!token) throw new HttpError(503, "Google Calendar is not connected.", "google_not_connected");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates ? "all" : "none"}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  // 204 = deleted. 404/410 mean the event is already gone — treat as success (idempotent).
  if (response.ok || response.status === 404 || response.status === 410) return;
  console.error("[google] deleteCalendarEvent failed", response.status, await response.text());
  throw new Error(`Calendar event deletion failed (${response.status})`);
}
