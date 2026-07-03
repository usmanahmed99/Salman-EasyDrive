import type { Env } from "./types";
import { getCalendarEvent, deleteCalendarEvent } from "./google";
import { syncBookingCalendar } from "./booking";
import { HttpError } from "./utils";

// Bookings whose calendar sync failed transiently (most often Google's per-account
// "Calendar usage limits exceeded." invitation quota) are retried by the cron until they
// succeed or hit this cap. At one attempt per 30-min tick, the cap gives ~a day of retries —
// long enough for any rolling quota window to clear — before we stop and leave the booking
// for a manual admin Retry, so a genuinely-broken booking doesn't retry forever.
const MAX_SYNC_ATTEMPTS = 10;
// Per-run ceiling so a large backlog can't exhaust Worker CPU or re-trip the quota in one tick.
const RETRY_BATCH_SIZE = 20;

// Google's invitation-quota error is transient — the whole point of retrying. When we see it,
// stop the run immediately: continuing would just keep hitting the limit and burn attempts.
function isQuotaError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("usage limit") || message.includes("rate limit") || message.includes("ratelimit");
}

/**
 * Retry bookings stuck in calendar_sync_status='failed'. syncBookingCalendar is idempotent and
 * flips the booking to 'synced' (resetting the attempt counter) on success, or re-records the
 * error on failure. We only touch future bookings (a past slot's invite is moot), cap attempts
 * per booking (MAX_SYNC_ATTEMPTS) and per run (RETRY_BATCH_SIZE), and bail early the moment Google
 * signals a quota error so we don't hammer a rate-limited account — the next tick resumes.
 */
export async function retryFailedSyncs(env: Env): Promise<{ retried: number; recovered: number; quotaStopped: boolean }> {
  const now = new Date().toISOString();
  const rows = (await env.DB.prepare(`
    SELECT id FROM bookings
    WHERE calendar_sync_status = 'failed'
      AND calendar_sync_attempts < ?
      AND start_at > ?
    ORDER BY start_at
    LIMIT ?
  `).bind(MAX_SYNC_ATTEMPTS, now, RETRY_BATCH_SIZE).all<{ id: string }>()).results;

  let retried = 0;
  let recovered = 0;
  for (const row of rows) {
    // Count the attempt up front so a booking that keeps failing still advances toward the cap.
    await env.DB.prepare(
      "UPDATE bookings SET calendar_sync_attempts = calendar_sync_attempts + 1 WHERE id = ?"
    ).bind(row.id).run();
    retried += 1;
    try {
      const result = await syncBookingCalendar(env, row.id);
      if (result.status === "synced") recovered += 1;
    } catch (error) {
      // syncBookingCalendar already re-recorded the error on the booking. A quota error means the
      // account is rate-limited right now, so stop the whole run and let the next tick resume.
      if (isQuotaError(error)) {
        console.log(`[reconcile] retry stopped early on quota limit after ${retried} attempt(s)`);
        return { retried, recovered, quotaStopped: true };
      }
    }
  }

  if (retried) console.log(`[reconcile] retried ${retried} failed sync(s), ${recovered} recovered`);
  return { retried, recovered, quotaStopped: false };
}

interface OpenCenter {
  id: string;
  timezone: string;
}

/** Centers whose local "now" falls within today's center_hours window. */
async function openCenters(env: Env, now: Date): Promise<OpenCenter[]> {
  const centers = (await env.DB.prepare(
    "SELECT id, timezone FROM centers WHERE enabled = 1 AND deleted_at IS NULL"
  ).all<{ id: string; timezone: string }>()).results;

  const open: OpenCenter[] = [];
  for (const center of centers) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: center.timezone,
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[get("weekday")];
    const localMinutes = Number(get("hour")) * 60 + Number(get("minute"));

    const hours = (await env.DB.prepare(
      "SELECT start_time, end_time FROM center_hours WHERE center_id = ? AND day_of_week = ? AND enabled = 1"
    ).bind(center.id, weekday).all<{ start_time: string; end_time: string }>()).results;

    const isOpen = hours.some((row) => {
      const [sh, sm] = row.start_time.split(":").map(Number);
      const [eh, em] = row.end_time.split(":").map(Number);
      return localMinutes >= sh * 60 + sm && localMinutes < eh * 60 + em;
    });
    if (isOpen) open.push(center);
  }
  return open;
}

/**
 * Reconcile D1 bookings against Google Calendar. When a booking's canonical event was
 * deleted directly in Google, treat it as a cancellation: cancel in D1 (freeing the slot),
 * tear down any sibling resource events, and flag the reason so admins can see it in-app.
 *
 * Only runs for centers currently within their working hours; outside hours it exits cheaply.
 *
 * Scoping options:
 * - `force`: ignore working-hours gating and reconcile all enabled centers (manual admin run).
 * - `centerId`: reconcile only this one center (e.g. fired in the background on page load for the
 *   center being viewed). Skips the open-hours scan entirely.
 */
export async function reconcileCalendar(
  env: Env,
  options: { force?: boolean; centerId?: string } = {}
): Promise<{ checked: number; cleaned: number; skipped: number }> {
  const now = new Date();
  // Scoped run: a single center, regardless of working hours.
  // Forced run: all centers, regardless of working hours (manual admin trigger).
  // Otherwise: only centers currently within their working hours (scheduled cron).
  let centers: { id: string; timezone: string }[];
  if (options.centerId) {
    centers = (await env.DB.prepare(
      "SELECT id, timezone FROM centers WHERE id = ? AND enabled = 1 AND deleted_at IS NULL"
    ).bind(options.centerId).all<{ id: string; timezone: string }>()).results;
  } else if (options.force) {
    centers = (await env.DB.prepare(
      "SELECT id, timezone FROM centers WHERE enabled = 1 AND deleted_at IS NULL"
    ).all<{ id: string; timezone: string }>()).results;
  } else {
    centers = await openCenters(env, now);
  }
  if (!centers.length) return { checked: 0, cleaned: 0, skipped: 0 };

  const centerIds = centers.map((c) => c.id);
  const placeholders = centerIds.map(() => "?").join(",");

  // Future, still-active bookings at open centers that have a live canonical Google event.
  const rows = (await env.DB.prepare(`
    SELECT bookings.id AS booking_id, bce.calendar_id, bce.google_event_id
    FROM bookings
    JOIN booking_calendar_events bce
      ON bce.booking_id = bookings.id AND bce.event_role = 'canonical'
    WHERE bookings.center_id IN (${placeholders})
      AND bookings.status IN ('pending_confirmation', 'confirmed', 'calendar_sync_failed')
      AND bookings.start_at > ?
      AND bce.google_event_id IS NOT NULL
      AND bce.sync_status != 'deleted'
  `).bind(...centerIds, now.toISOString()).all<{ booking_id: string; calendar_id: string; google_event_id: string }>()).results;

  let checked = 0;
  let cleaned = 0;
  let skipped = 0;

  for (const row of rows) {
    checked += 1;
    let result: { exists: boolean; cancelled: boolean };
    try {
      result = await getCalendarEvent(env, row.calendar_id, row.google_event_id);
    } catch (error) {
      // Auth/transient errors: skip this booking, leave it untouched for the next run.
      if (error instanceof HttpError && error.code === "google_reconnect_required") return { checked, cleaned, skipped };
      skipped += 1;
      continue;
    }
    if (result.exists) continue;

    // Event is gone in Google → cancel the booking and free the slot.
    await env.DB.prepare(
      "UPDATE bookings SET status='cancelled_by_admin', cancelled_at=CURRENT_TIMESTAMP, calendar_last_error='event_deleted_externally', updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(row.booking_id).run();

    // Best-effort: remove sibling resource events; the canonical one is already gone.
    // No attendee email is re-sent — the event no longer exists to cancel.
    const siblings = (await env.DB.prepare(`
      SELECT id, calendar_id, google_event_id FROM booking_calendar_events
      WHERE booking_id = ? AND sync_status != 'deleted' AND google_event_id IS NOT NULL
    `).bind(row.booking_id).all<{ id: string; calendar_id: string; google_event_id: string }>()).results;
    for (const sibling of siblings) {
      try {
        await deleteCalendarEvent(env, sibling.calendar_id, sibling.google_event_id, false);
      } catch { /* idempotent best-effort */ }
      await env.DB.prepare(
        "UPDATE booking_calendar_events SET sync_status='deleted', updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(sibling.id).run();
    }
    cleaned += 1;
  }

  if (cleaned) console.log(`[reconcile] cleaned ${cleaned} externally-deleted booking(s) of ${checked} checked`);
  return { checked, cleaned, skipped };
}
