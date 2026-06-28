import type { Package, PackageBookingConfirmation } from "../shared/types";
import type { Env } from "./types";
import type { ConfirmBookingPayload } from "./booking";
import { prepareSession, syncBookingCalendar } from "./booking";
import { dateInTimeZone, HttpError, randomToken, sha256, uuid } from "./utils";

// ---- Read serializers ---------------------------------------------------------------------

interface DbPackageRow {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  price_display: string | null;
  price_tax_mode: string;
  enabled: number;
  sort_order: number;
}

interface DbPackageItemRow {
  id: string;
  package_id: string;
  service_id: string;
  service_slug: string;
  service_name_en: string;
  service_name_fr: string;
  service_description_en: string;
  service_description_fr: string;
  duration_minutes: number;
  quantity: number;
  sort_order: number;
}

export function packageResponse(row: DbPackageRow, items: DbPackageItemRow[]): Package {
  const mapped = items
    .filter((item) => item.package_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      id: item.id,
      serviceId: item.service_id,
      serviceSlug: item.service_slug,
      serviceName: { en: item.service_name_en, fr: item.service_name_fr },
      serviceDescription: { en: item.service_description_en || "", fr: item.service_description_fr || "" },
      durationMinutes: item.duration_minutes,
      quantity: item.quantity,
      sortOrder: item.sort_order
    }));
  return {
    id: row.id,
    slug: row.slug,
    name: { en: row.name_en, fr: row.name_fr },
    description: { en: row.description_en, fr: row.description_fr },
    priceDisplay: row.price_display || undefined,
    priceTaxMode: (row.price_tax_mode === "incl" || row.price_tax_mode === "plus") ? row.price_tax_mode : "none",
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    items: mapped,
    sessionCount: mapped.reduce((sum, item) => sum + item.quantity, 0)
  };
}

/** Loads a package with its items. Returns null if not found / soft-deleted. */
export async function loadPackage(env: Env, slug: string): Promise<Package | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM packages WHERE slug=? AND deleted_at IS NULL"
  ).bind(slug).first<DbPackageRow>();
  if (!row) return null;
  const items = (await env.DB.prepare(`
    SELECT package_items.*, services.slug AS service_slug, services.name_en AS service_name_en,
      services.name_fr AS service_name_fr, services.description_en AS service_description_en,
      services.description_fr AS service_description_fr, services.duration_minutes
    FROM package_items
    JOIN services ON services.id = package_items.service_id
    WHERE package_items.package_id = ?
  `).bind(row.id).all<DbPackageItemRow>()).results;
  return packageResponse(row, items);
}

// ---- Booking orchestration ----------------------------------------------------------------

/**
 * Validates that the chosen sessions exactly match a package's expanded item list (service ×
 * quantity), and that no (service, instant) pair is picked twice. Pure so it can be unit-tested.
 * Returns null when valid, or a short reason code otherwise.
 */
export function validatePackageSessions(
  items: Array<{ serviceSlug: string; quantity: number }>,
  sessions: Array<{ serviceSlug: string; start: string }>
): "package_mismatch" | "duplicate_slot" | null {
  const expected = new Map<string, number>();
  for (const item of items) expected.set(item.serviceSlug, (expected.get(item.serviceSlug) || 0) + item.quantity);
  const chosen = new Map<string, number>();
  for (const session of sessions) chosen.set(session.serviceSlug, (chosen.get(session.serviceSlug) || 0) + 1);
  if (expected.size !== chosen.size || [...expected].some(([slug, qty]) => chosen.get(slug) !== qty)) {
    return "package_mismatch";
  }
  const seen = new Set<string>();
  for (const session of sessions) {
    const key = `${session.serviceSlug}@${session.start}`;
    if (seen.has(key)) return "duplicate_slot";
    seen.add(key);
  }
  return null;
}

export interface PackageBookingPayload {
  centerSlug: string;
  packageSlug: string;
  language: "en" | "fr";
  formVersion: number;
  answers: Record<string, unknown>;
  /** One entry per session, in the order the package items expand. */
  sessions: Array<{ serviceSlug: string; start: string }>;
}

export interface ReservedSession {
  id: string;
  reference: string;
  publicToken: string;
  start: string;
  end: string;
  centerName: string;
  serviceNameEn: string;
  serviceNameFr: string;
}

/** Discriminated result so the DO never throws inside blockConcurrencyWhile (which would reset it). */
export type ReserveResult =
  | { ok: true; session: ReservedSession }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Runs inside the per-(center, date) BookingLock Durable Object. Validates one session's slot and
 * inserts it as `pending_confirmation` (holding its resources against concurrent bookings — pending
 * rows are counted by the resource-conflict guard). Returns a discriminated result rather than
 * throwing: a throw inside blockConcurrencyWhile resets the whole Durable Object, which would turn
 * an ordinary slot conflict into an opaque 500 for the orchestrator.
 */
export async function reserveSession(
  env: Env,
  payload: ConfirmBookingPayload,
  packageBookingId: string
): Promise<ReserveResult> {
  try {
    const session = await prepareSession(env, payload, {
      status: "pending_confirmation",
      packageBookingId
    });
    await env.DB.batch(session.statements);
    return {
      ok: true,
      session: {
        id: session.id,
        reference: session.reference,
        publicToken: session.publicToken,
        start: payload.start,
        end: session.end,
        centerName: session.centerName,
        serviceNameEn: session.serviceNameEn,
        serviceNameFr: session.serviceNameFr
      }
    };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, status: error.status, error: error.message, code: error.code };
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "Reserve failed" };
  }
}

/** Deletes a session's rows (allocations, form response, booking). Used to roll back a partial package. */
async function deleteSessionRows(env: Env, bookingId: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_resource_allocations WHERE booking_id=?").bind(bookingId),
    env.DB.prepare("DELETE FROM booking_form_responses WHERE booking_id=?").bind(bookingId),
    env.DB.prepare("DELETE FROM bookings WHERE id=?").bind(bookingId)
  ]);
}

/**
 * Orchestrates an all-or-nothing package booking. Runs in the main worker (not a single DO) because
 * a package's sessions can span multiple dates → multiple per-date BookingLock instances.
 *
 *  1. Validate the package + that the chosen sessions match the package's item quantities.
 *  2. Create the parent package_bookings row.
 *  3. RESERVE: for each session, route to its (center, date) BookingLock to insert a pending row.
 *     Each insert is serialized against concurrent bookings inside that DO.
 *  4. If any reserve fails → roll back every reserved row + the parent, surface which session failed.
 *  5. FINALIZE: flip all sessions to confirmed and run calendar sync (full schedule in each invite).
 */
export async function confirmPackageBooking(env: Env, payload: PackageBookingPayload): Promise<PackageBookingConfirmation> {
  const pkg = await loadPackage(env, payload.packageSlug);
  if (!pkg || !pkg.enabled) throw new HttpError(404, "This package is unavailable.", "package_not_found");

  const center = await env.DB.prepare(
    "SELECT id, name, timezone FROM centers WHERE slug=? AND enabled=1 AND deleted_at IS NULL"
  ).bind(payload.centerSlug).first<{ id: string; name: string; timezone: string }>();
  if (!center) throw new HttpError(404, "Location is unavailable.", "center_not_found");

  // The chosen sessions must exactly match the package's expanded item list (service × quantity),
  // with no slot picked twice.
  const problem = validatePackageSessions(pkg.items, payload.sessions);
  if (problem === "package_mismatch") throw new HttpError(400, "The selected sessions do not match this package.", "package_mismatch");
  if (problem === "duplicate_slot") throw new HttpError(400, "Please choose a different time for each session.", "duplicate_slot");

  // At most 2 hours of lessons per local calendar day. The client disables over-cap slots, but
  // enforce it here too so the rule can't be bypassed by a crafted request.
  const minutesBySlug = new Map(pkg.items.map((item) => [item.serviceSlug, item.durationMinutes]));
  const minutesByDay = new Map<string, number>();
  for (const session of payload.sessions) {
    const day = dateInTimeZone(session.start, center.timezone);
    const total = (minutesByDay.get(day) ?? 0) + (minutesBySlug.get(session.serviceSlug) ?? 0);
    if (total > 120) throw new HttpError(400, "You can book at most 2 hours of lessons per day.", "package_daily_limit");
    minutesByDay.set(day, total);
  }

  const packageBookingId = uuid();
  const packageReference = `PKG-${Math.floor(100000 + Math.random() * 900000)}`;
  const packageToken = randomToken(32);
  const packageTokenHash = await sha256(packageToken);
  await env.DB.prepare(`
    INSERT INTO package_bookings(id, reference, package_id, center_id, public_token_hash)
    VALUES (?, ?, ?, ?, ?)
  `).bind(packageBookingId, packageReference, pkg.id, center.id, packageTokenHash).run();

  const reserved: ReservedSession[] = [];
  try {
    for (let index = 0; index < payload.sessions.length; index++) {
      const session = payload.sessions[index];
      const sessionPayload: ConfirmBookingPayload = {
        centerSlug: payload.centerSlug,
        serviceSlug: session.serviceSlug,
        start: session.start,
        language: payload.language,
        // Each service may carry a different form; per-session version is validated against that
        // service's own form inside prepareSession via the -1 sentinel (skip cross-service compare).
        formVersion: -1,
        answers: payload.answers
      };
      const localDate = dateInTimeZone(session.start, center.timezone);
      const durableId = env.BOOKING_LOCK.idFromName(`center:${center.id}:${localDate}`);
      const response = await env.BOOKING_LOCK.get(durableId).fetch("https://booking-lock.internal/package-reserve", {
        method: "POST",
        body: JSON.stringify({ payload: sessionPayload, packageBookingId })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
        // All-or-nothing: name the failed session (1-based) so the client can re-pick just that one.
        throw new HttpError(
          response.status === 409 ? 409 : 400,
          `Session ${index + 1} (${session.serviceSlug}) is no longer available. ${body.error || ""}`.trim(),
          "package_session_conflict"
        );
      }
      reserved.push(await response.json());
    }
  } catch (error) {
    // Roll back everything reserved so far, plus the parent. No calendar events exist yet.
    for (const session of reserved) await deleteSessionRows(env, session.id).catch(() => {});
    await env.DB.prepare("DELETE FROM package_bookings WHERE id=?").bind(packageBookingId).run().catch(() => {});
    throw error;
  }

  // FINALIZE: confirm each session and sync its calendar event (each invite carries the full schedule).
  const sessions: PackageBookingConfirmation["sessions"] = [];
  for (const session of reserved) {
    await env.DB.prepare(
      "UPDATE bookings SET status='confirmed', updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(session.id).run();
    const sync = await syncBookingCalendar(env, session.id, session.publicToken).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "Calendar sync failed";
      await env.DB.prepare(`
        UPDATE bookings SET status='calendar_sync_failed', calendar_sync_status='failed',
        calendar_last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(message.slice(0, 500), session.id).run();
      return { status: "failed" as const };
    });
    sessions.push({
      id: session.id,
      reference: session.reference,
      status: sync.status === "failed" ? "calendar_sync_failed" : "confirmed",
      start: session.start,
      end: session.end,
      centerName: session.centerName,
      serviceName: payload.language === "fr" ? session.serviceNameFr : session.serviceNameEn,
      manageToken: session.publicToken,
      calendarSyncStatus: sync.status
    });
  }

  return {
    reference: packageReference,
    packageName: payload.language === "fr" ? pkg.name.fr : pkg.name.en,
    manageToken: packageToken,
    sessions
  };
}
