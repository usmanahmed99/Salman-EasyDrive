import { adminBookingSchema, adminRescheduleSchema, availabilityRequestSchema, bookingRequestSchema, centerMutationSchema, overrideRequestSchema, packageBookingRequestSchema, resourceMutationSchema } from "../shared/schemas";
import type { BookingForm } from "../shared/types";
import { validateBookingForm } from "../shared/types";
import { getSlots } from "./availability";
import { devLoginAvailable, getSessionUser, handleDevLogin, handleGoogleCallback, handleGoogleStart, logout, requireUser } from "./auth";
import { cancelBookingCalendar, confirmAdminBooking, confirmBooking, rescheduleAdminBooking, serviceResponse, syncBookingCalendar, type AdminBookingPayload, type ConfirmBookingPayload } from "./booking";
import { confirmPackageBooking, packageResponse, reserveSession, type PackageBookingPayload } from "./package";
import { createCalendar, deleteCalendar, listCalendars, shareCalendar } from "./google";
import { reconcileCalendar } from "./reconcile";
import type { DbCenter, DbService, Env } from "./types";
import {
  assertTrustedOrigin,
  cookie,
  corsHeaders,
  dateInTimeZone,
  HttpError,
  json,
  readJson,
  sha256,
  uuid
} from "./utils";

function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function rateLimit(request: Request, env: Env, limit: number, windowMinutes: number) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const route = new URL(request.url).pathname;
  const bucket = Math.floor(Date.now() / (windowMinutes * 60_000));
  const key = await sha256(`${ip}:${route}:${bucket}`);
  const current = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE key = ?").bind(key).first<{ request_count: number }>();
  if (current && current.request_count >= limit) {
    throw new HttpError(429, `Too many requests. Please try again in ${windowMinutes} minutes.`, "rate_limited");
  }
  await env.DB.prepare(`
    INSERT INTO rate_limits(key, window_start, request_count) VALUES (?, CURRENT_TIMESTAMP, 1)
    ON CONFLICT(key) DO UPDATE SET request_count = request_count + 1
  `).bind(key).run();
}

async function verifyTurnstile(request: Request, env: Env, token?: string) {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw new HttpError(400, "Please complete the security check.", "turnstile_required");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || ""
    })
  });
  const body = await response.json() as { success: boolean };
  if (!body.success) throw new HttpError(400, "The security check failed. Please try again.", "turnstile_failed");
}

async function audit(env: Env, userId: string, action: string, entityType: string, entityId: string, after: unknown, request: Request) {
  await env.DB.prepare(`
    INSERT INTO audit_log(id, user_id, action, entity_type, entity_id, after_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(uuid(), userId, action, entityType, entityId, JSON.stringify(after), request.headers.get("CF-Connecting-IP")).run();
}

function parseId(path: string, prefix: string) {
  const rest = path.slice(prefix.length).replace(/^\/|\/$/g, "");
  return rest || null;
}

async function publicBookingByToken(request: Request, env: Env, reference: string) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT bookings.id, bookings.reference, bookings.start_at, bookings.end_at, bookings.status,
      centers.name AS center_name, services.name_en, services.name_fr
    FROM bookings JOIN centers ON centers.id = bookings.center_id
    JOIN services ON services.id = bookings.service_id
    WHERE bookings.reference = ? AND bookings.public_token_hash = ?
  `).bind(reference, tokenHash).first<Record<string, string>>();
  if (!row) throw new HttpError(404, "This booking link is invalid or expired.", "invalid_booking_token");
  return row;
}

async function adminCrud(request: Request, env: Env, path: string, user: Awaited<ReturnType<typeof requireUser>>) {
  const method = request.method;
  if (path === "/api/admin/centers/reorder" && method === "PUT") {
    const body = await readJson(request) as { orderedIds?: unknown };
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    if (!orderedIds.length) throw new HttpError(400, "orderedIds is required.");
    await env.DB.batch(
      orderedIds.map((centerId, index) =>
        env.DB.prepare("UPDATE centers SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").bind(index, centerId)
      )
    );
    await audit(env, user.id, "reorder", "center", "", { orderedIds }, request);
    return json({ ok: true });
  }

  // Explicitly (re)create a center's canonical Google Calendar. Center calendars live in
  // calendar_mappings (not a column), so this upserts the canonical mapping. Matched before the
  // generic /api/admin/centers block below.
  const centerCalMatch = path.match(/^\/api\/admin\/centers\/([^/]+)\/calendar$/);
  if (centerCalMatch && method === "POST") {
    const ctrId = centerCalMatch[1];
    const ctr = await env.DB.prepare("SELECT name FROM centers WHERE id=? AND deleted_at IS NULL").bind(ctrId).first<{ name: string }>();
    if (!ctr) throw new HttpError(404, "Center not found.");
    const prev = await env.DB.prepare(
      "SELECT calendar_id FROM calendar_mappings WHERE center_id=? AND mapping_type='center' AND event_role='canonical' AND enabled=1 LIMIT 1"
    ).bind(ctrId).first<{ calendar_id: string }>();
    const newCalendarId = await createCalendar(env, `Easy Driving - Center ${ctr.name}`);
    if (!newCalendarId) throw new HttpError(503, "Google Calendar is not connected. Connect it under the Google Calendar tab and try again.", "google_not_connected");
    // Disable existing canonical mapping(s) (old Google calendar left intact), insert the new one.
    await env.DB.prepare("UPDATE calendar_mappings SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE center_id=? AND mapping_type='center' AND event_role='canonical'").bind(ctrId).run();
    await env.DB.prepare("INSERT INTO calendar_mappings(id,center_id,mapping_type,mapping_id,calendar_id,event_role) VALUES(?,?,?,?,?,'canonical')")
      .bind(uuid(), ctrId, "center", ctrId, newCalendarId).run();
    await audit(env, user.id, "create_calendar", "center", ctrId, { calendarId: newCalendarId, previousCalendarId: prev?.calendar_id ?? null }, request);
    return json({ id: ctrId, calendarId: newCalendarId, previousCalendarId: prev?.calendar_id ?? null });
  }
  // Unlink a center's canonical calendar (mode=unlink) or also delete it from Google (mode=google).
  if (centerCalMatch && method === "DELETE") {
    const ctrId = centerCalMatch[1];
    const mode = new URL(request.url).searchParams.get("mode") === "google" ? "google" : "unlink";
    const ctr = await env.DB.prepare("SELECT id FROM centers WHERE id=? AND deleted_at IS NULL").bind(ctrId).first();
    if (!ctr) throw new HttpError(404, "Center not found.");
    const mapping = await env.DB.prepare(
      "SELECT calendar_id FROM calendar_mappings WHERE center_id=? AND mapping_type='center' AND event_role='canonical' AND enabled=1 LIMIT 1"
    ).bind(ctrId).first<{ calendar_id: string }>();
    if (mode === "google" && mapping?.calendar_id) {
      // Block only if a future, non-cancelled booking still has a live calendar event on THIS
      // calendar. Cancelled/completed bookings (events removed → sync_status='deleted') do not block.
      const future = await env.DB.prepare(`
        SELECT COUNT(*) AS count FROM booking_calendar_events bce JOIN bookings b ON b.id=bce.booking_id
        WHERE bce.calendar_id=? AND bce.sync_status != 'deleted'
          AND b.start_at>CURRENT_TIMESTAMP
          AND b.status IN ('confirmed','pending_confirmation','calendar_sync_failed','rescheduled')
      `).bind(mapping.calendar_id).first<{ count: number }>();
      if (future?.count) throw new HttpError(409, "This calendar has events for future active bookings; cancel them before deleting it from Google.", "future_bookings_exist");
      await deleteCalendar(env, mapping.calendar_id);
    }
    await env.DB.prepare("UPDATE calendar_mappings SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE center_id=? AND mapping_type='center' AND event_role='canonical'").bind(ctrId).run();
    await audit(env, user.id, mode === "google" ? "delete_calendar" : "unlink_calendar", "center", ctrId, { calendarId: mapping?.calendar_id ?? null }, request);
    return new Response(null, { status: 204 });
  }

  if (path.startsWith("/api/admin/centers")) {
    const id = parseId(path, "/api/admin/centers");
    if (method === "GET") {
      const results = await env.DB.prepare("SELECT * FROM centers WHERE deleted_at IS NULL ORDER BY sort_order, name").all();
      return json({ centers: results.results });
    }
    if (method === "POST") {
      const payload = centerMutationSchema.parse(await readJson(request));
      const nextId = uuid();
      // New centers sort to the end of the current order until reordered.
      const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS max FROM centers WHERE deleted_at IS NULL").first<{ max: number }>();
      const nextSortOrder = (maxRow?.max ?? -1) + 1;
      await env.DB.prepare(`
        INSERT INTO centers(id, name, slug, address, timezone, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(nextId, payload.name, payload.slug, payload.address || null, payload.timezone, Number(payload.enabled), nextSortOrder).run();
      await audit(env, user.id, "create", "center", nextId, payload, request);
      // Best-effort: auto-create a Google Calendar and link it as the canonical calendar for this center.
      const calId = await createCalendar(env, `Easy Driving - Center ${payload.name}`).catch((err: unknown) => {
        console.error("[auto-calendar] center calendar creation failed", err);
        return null;
      });
      if (calId) {
        const mappingId = uuid();
        await env.DB.prepare(
          "INSERT INTO calendar_mappings(id,center_id,mapping_type,mapping_id,calendar_id,event_role) VALUES(?,?,?,?,?,?)"
        ).bind(mappingId, nextId, "center", nextId, calId, "canonical").run();
      }
      // Auto-create "Cars" and "Instructors" resource groups for this center.
      const carGroupId = uuid();
      await env.DB.prepare(
        "INSERT INTO resource_groups(id, center_id, name, type, mode, capacity, enabled) VALUES(?, ?, ?, 'cars', 'pooled', 3, 1)"
      ).bind(carGroupId, nextId, `${payload.name} Cars`).run();
      const instructorGroupId = uuid();
      await env.DB.prepare(
        "INSERT INTO resource_groups(id, center_id, name, type, mode, capacity, enabled) VALUES(?, ?, ?, 'instructors', 'named', 0, 1)"
      ).bind(instructorGroupId, nextId, `${payload.name} Instructors`).run();
      // Link all existing enabled services to this new center.
      const allServices = await env.DB.prepare("SELECT id FROM services WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
      for (const svc of allServices.results) {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO service_centers(service_id, center_id, enabled) VALUES(?,?,1)"
        ).bind(svc.id, nextId).run();
      }
      return json({ id: nextId, calendarId: calId ?? undefined, ...payload }, 201);
    }
    if (method === "PATCH" && id) {
      const payload = centerMutationSchema.parse(await readJson(request));
      // Slug is an immutable identifier (booking URLs, availability lookups); never updated.
      await env.DB.prepare(`
        UPDATE centers SET name = ?, address = ?, timezone = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(payload.name, payload.address || null, payload.timezone, Number(payload.enabled), id).run();
      await audit(env, user.id, "update", "center", id, payload, request);
      return json({ id, ...payload });
    }
    if (method === "DELETE" && id) {
      const future = await env.DB.prepare(`
        SELECT COUNT(*) AS count FROM bookings WHERE center_id = ? AND start_at > CURRENT_TIMESTAMP
        AND status IN ('confirmed', 'calendar_sync_failed', 'pending_confirmation')
      `).bind(id).first<{ count: number }>();
      if (future?.count) throw new HttpError(409, "This center has future bookings and cannot be deleted.", "future_bookings_exist");
      await env.DB.prepare("UPDATE centers SET deleted_at = CURRENT_TIMESTAMP, enabled = 0 WHERE id = ?").bind(id).run();
      await audit(env, user.id, "delete", "center", id, {}, request);
      // Best-effort: delete the associated Google Calendar.
      const centerMapping = await env.DB.prepare(
        "SELECT calendar_id FROM calendar_mappings WHERE center_id=? AND mapping_type='center' AND enabled=1 LIMIT 1"
      ).bind(id).first<{ calendar_id: string }>();
      if (centerMapping?.calendar_id) {
        deleteCalendar(env, centerMapping.calendar_id).catch((err: unknown) =>
          console.error("[auto-calendar] center calendar deletion failed", err)
        );
      }
      return new Response(null, { status: 204 });
    }
  }

  if (path === "/api/admin/services/reorder" && method === "PUT") {
    const body = await readJson(request) as { orderedIds?: unknown };
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    if (!orderedIds.length) throw new HttpError(400, "orderedIds is required.");
    await env.DB.batch(
      orderedIds.map((serviceId, index) =>
        env.DB.prepare("UPDATE services SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").bind(index, serviceId)
      )
    );
    await audit(env, user.id, "reorder", "service", "", { orderedIds }, request);
    return json({ ok: true });
  }

  if (path.startsWith("/api/admin/services")) {
    const id = parseId(path, "/api/admin/services");
    if (method === "GET") {
      const results = await env.DB.prepare("SELECT * FROM services WHERE deleted_at IS NULL ORDER BY sort_order, name_en").all<DbService>();
      return json({ services: results.results.map(serviceResponse) });
    }
    const body = await readJson(request) as Record<string, unknown>;
    const values = {
      slug: String(body.slug || ""),
      nameEn: String(body.nameEn || ""),
      nameFr: String(body.nameFr || body.nameEn || ""),
      descriptionEn: String(body.descriptionEn || ""),
      descriptionFr: String(body.descriptionFr || ""),
      duration: Number(body.durationMinutes || 60),
      bufferBefore: Number(body.bufferBeforeMinutes || 0),
      bufferAfter: Number(body.bufferAfterMinutes || 0),
      slotInterval: Number(body.slotIntervalMinutes || 30),
      price: body.priceDisplay ? String(body.priceDisplay) : null,
      priceTaxMode: (body.priceTaxMode === "incl" || body.priceTaxMode === "plus") ? body.priceTaxMode : "none",
      formId: String(body.formId || "form_lesson"),
      cutoff: Number(body.cutoffHours || 0),
      cancellationCutoff: body.cancellationCutoffHours == null ? null : Number(body.cancellationCutoffHours),
      concurrency: Number(body.baseConcurrency || 1),
      enabled: body.enabled === false ? 0 : 1,
      showDuration: body.showDuration === false ? 0 : 1,
      highlightEn: String(body.highlightEn || ""),
      highlightFr: String(body.highlightFr || "")
    };
    if (!values.slug || !values.nameEn) throw new HttpError(400, "Service name and slug are required.");
    if (method === "POST") {
      const nextId = uuid();
      // New services sort to the end of the current order until reordered.
      const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS max FROM services WHERE deleted_at IS NULL").first<{ max: number }>();
      const nextSortOrder = (maxRow?.max ?? -1) + 1;
      await env.DB.prepare(`
        INSERT INTO services(
          id, slug, name_en, name_fr, description_en, description_fr, duration_minutes,
          buffer_before_minutes, buffer_after_minutes, slot_interval_minutes, price_display, price_tax_mode,
          form_id, cutoff_hours, cancellation_cutoff_hours, base_concurrency, enabled, show_duration, highlight_en, highlight_fr, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(nextId, values.slug, values.nameEn, values.nameFr, values.descriptionEn, values.descriptionFr, values.duration, values.bufferBefore, values.bufferAfter, values.slotInterval, values.price, values.priceTaxMode, values.formId, values.cutoff, values.cancellationCutoff, values.concurrency, values.enabled, values.showDuration, values.highlightEn, values.highlightFr, nextSortOrder).run();
      // Offer the new service at every existing center by default (mirrors center creation).
      const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
      for (const ctr of allCenters.results) {
        await env.DB.prepare("INSERT OR IGNORE INTO service_centers(service_id, center_id, enabled) VALUES(?,?,1)").bind(nextId, ctr.id).run();
      }
      await audit(env, user.id, "create", "service", nextId, body, request);
      return json({ id: nextId }, 201);
    }
    if (method === "PATCH" && id) {
      // Slug is an immutable identifier (booking URLs, availability lookups); never updated.
      await env.DB.prepare(`
        UPDATE services SET name_en=?, name_fr=?, description_en=?, description_fr=?,
        duration_minutes=?, buffer_before_minutes=?, buffer_after_minutes=?, slot_interval_minutes=?,
        price_display=?, price_tax_mode=?, form_id=?, cutoff_hours=?, cancellation_cutoff_hours=?, base_concurrency=?, enabled=?, show_duration=?,
        highlight_en=?, highlight_fr=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(values.nameEn, values.nameFr, values.descriptionEn, values.descriptionFr, values.duration, values.bufferBefore, values.bufferAfter, values.slotInterval, values.price, values.priceTaxMode, values.formId, values.cutoff, values.cancellationCutoff, values.concurrency, values.enabled, values.showDuration, values.highlightEn, values.highlightFr, id).run();
      await audit(env, user.id, "update", "service", id, body, request);
      return json({ id });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("UPDATE services SET deleted_at=CURRENT_TIMESTAMP, enabled=0 WHERE id=?").bind(id).run();
      await audit(env, user.id, "delete", "service", id, {}, request);
      return new Response(null, { status: 204 });
    }
  }

  // Matched before the generic /api/admin/packages block, since parseId there would treat
  // "reorder" as the package id.
  if (path === "/api/admin/packages/reorder" && method === "PUT") {
    const body = await readJson(request) as { orderedIds?: unknown };
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];
    if (!orderedIds.length) throw new HttpError(400, "orderedIds is required.");
    await env.DB.batch(
      orderedIds.map((packageId, index) =>
        env.DB.prepare("UPDATE packages SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").bind(index, packageId)
      )
    );
    await audit(env, user.id, "reorder", "package", "", { orderedIds }, request);
    return json({ ok: true });
  }

  if (path.startsWith("/api/admin/packages")) {
    const id = parseId(path, "/api/admin/packages");
    if (method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM packages WHERE deleted_at IS NULL ORDER BY sort_order, name_en"
      ).all<Parameters<typeof packageResponse>[0]>();
      if (rows.results.length === 0) return json({ packages: [] });
      const ids = rows.results.map((row) => row.id);
      const items = (await env.DB.prepare(`
        SELECT package_items.*, services.slug AS service_slug, services.name_en AS service_name_en,
          services.name_fr AS service_name_fr, services.description_en AS service_description_en,
          services.description_fr AS service_description_fr, services.duration_minutes
        FROM package_items
        JOIN services ON services.id = package_items.service_id
        WHERE package_items.package_id IN (${ids.map(() => "?").join(",")})
      `).bind(...ids).all<Parameters<typeof packageResponse>[1][number]>()).results;
      return json({ packages: rows.results.map((row) => packageResponse(row, items)) });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("UPDATE packages SET deleted_at=CURRENT_TIMESTAMP, enabled=0 WHERE id=?").bind(id).run();
      await audit(env, user.id, "delete", "package", id, {}, request);
      return new Response(null, { status: 204 });
    }
    const body = await readJson(request) as Record<string, unknown>;
    const values = {
      slug: String(body.slug || ""),
      nameEn: String(body.nameEn || ""),
      nameFr: String(body.nameFr || body.nameEn || ""),
      descriptionEn: String(body.descriptionEn || ""),
      descriptionFr: String(body.descriptionFr || ""),
      price: body.priceDisplay ? String(body.priceDisplay) : null,
      priceTaxMode: (body.priceTaxMode === "incl" || body.priceTaxMode === "plus") ? body.priceTaxMode : "none",
      enabled: body.enabled === false ? 0 : 1
    };
    // Items: [{ serviceId, quantity }]. Replaced wholesale on every write.
    const rawItems = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
    const items = rawItems
      .map((item) => ({ serviceId: String(item.serviceId || ""), quantity: Math.max(1, Number(item.quantity || 1)) }))
      .filter((item) => item.serviceId);
    if (method === "POST") {
      if (!values.slug || !values.nameEn) throw new HttpError(400, "Package name and slug are required.");
      if (!items.length) throw new HttpError(400, "A package needs at least one service.");
      const nextId = uuid();
      const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS max FROM packages WHERE deleted_at IS NULL").first<{ max: number }>();
      const statements = [
        env.DB.prepare(`
          INSERT INTO packages(id, slug, name_en, name_fr, description_en, description_fr, price_display, price_tax_mode, enabled, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(nextId, values.slug, values.nameEn, values.nameFr, values.descriptionEn, values.descriptionFr, values.price, values.priceTaxMode, values.enabled, (maxRow?.max ?? -1) + 1),
        ...items.map((item, index) => env.DB.prepare(
          "INSERT INTO package_items(id, package_id, service_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)"
        ).bind(uuid(), nextId, item.serviceId, item.quantity, index))
      ];
      await env.DB.batch(statements);
      // Offer the package at every existing center by default (mirrors service creation).
      const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
      for (const ctr of allCenters.results) {
        await env.DB.prepare("INSERT OR IGNORE INTO package_centers(package_id, center_id, enabled) VALUES(?,?,1)").bind(nextId, ctr.id).run();
      }
      await audit(env, user.id, "create", "package", nextId, body, request);
      return json({ id: nextId }, 201);
    }
    if (method === "PATCH" && id) {
      if (!values.nameEn) throw new HttpError(400, "Package name is required.");
      if (!items.length) throw new HttpError(400, "A package needs at least one service.");
      const statements = [
        env.DB.prepare(`
          UPDATE packages SET name_en=?, name_fr=?, description_en=?, description_fr=?,
          price_display=?, price_tax_mode=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).bind(values.nameEn, values.nameFr, values.descriptionEn, values.descriptionFr, values.price, values.priceTaxMode, values.enabled, id),
        env.DB.prepare("DELETE FROM package_items WHERE package_id=?").bind(id),
        ...items.map((item, index) => env.DB.prepare(
          "INSERT INTO package_items(id, package_id, service_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)"
        ).bind(uuid(), id, item.serviceId, item.quantity, index))
      ];
      await env.DB.batch(statements);
      await audit(env, user.id, "update", "package", id, body, request);
      return json({ id });
    }
  }

  // Explicitly (re)create a Google Calendar for an existing resource. Matched before the generic
  // /api/admin/resources block below, since parseId there would treat ":id/calendar" as the id.
  const resourceCalMatch = path.match(/^\/api\/admin\/resources\/([^/]+)\/calendar$/);
  if (resourceCalMatch && method === "POST") {
    const resId = resourceCalMatch[1];
    const row = await env.DB.prepare(
      "SELECT type, name, email, calendar_id FROM resources WHERE id=? AND deleted_at IS NULL"
    ).bind(resId).first<{ type: string; name: string; email: string | null; calendar_id: string | null }>();
    if (!row) throw new HttpError(404, "Resource not found.");
    const previousCalendarId = row.calendar_id;
    const summary = `Easy Driving - ${row.type === "instructor" ? "Instructor" : "Resource"} ${row.name}`;
    const newCalendarId = await createCalendar(env, summary);
    if (!newCalendarId) throw new HttpError(503, "Google Calendar is not connected. Connect it under the Google Calendar tab and try again.", "google_not_connected");
    await env.DB.prepare("UPDATE resources SET calendar_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(newCalendarId, resId).run();
    // The old Google calendar (previousCalendarId) is intentionally NOT deleted — it may live in a
    // different Google account and hold historical events. Surfaced for manual cleanup instead.
    if (row.email) {
      shareCalendar(env, newCalendarId, row.email, "reader").catch((err: unknown) =>
        console.error("[create-calendar] resource calendar share failed", err)
      );
    }
    await audit(env, user.id, "create_calendar", "resource", resId, { calendarId: newCalendarId, previousCalendarId }, request);
    return json({ id: resId, calendarId: newCalendarId, previousCalendarId });
  }
  // Unlink the calendar from a resource (mode=unlink) or also delete it from Google (mode=google).
  if (resourceCalMatch && method === "DELETE") {
    const resId = resourceCalMatch[1];
    const mode = new URL(request.url).searchParams.get("mode") === "google" ? "google" : "unlink";
    const row = await env.DB.prepare(
      "SELECT calendar_id FROM resources WHERE id=? AND deleted_at IS NULL"
    ).bind(resId).first<{ calendar_id: string | null }>();
    if (!row) throw new HttpError(404, "Resource not found.");
    if (mode === "google" && row.calendar_id) {
      // Block only if a future, non-cancelled booking still has a live calendar event on THIS
      // calendar. Cancelled/completed bookings (events removed → sync_status='deleted') do not block.
      const future = await env.DB.prepare(`
        SELECT COUNT(*) AS count FROM booking_calendar_events bce JOIN bookings b ON b.id=bce.booking_id
        WHERE bce.calendar_id=? AND bce.sync_status != 'deleted'
          AND b.start_at>CURRENT_TIMESTAMP
          AND b.status IN ('confirmed','pending_confirmation','calendar_sync_failed','rescheduled')
      `).bind(row.calendar_id).first<{ count: number }>();
      if (future?.count) throw new HttpError(409, "This calendar has events for future active bookings; cancel or move them before deleting it from Google.", "future_bookings_exist");
      await deleteCalendar(env, row.calendar_id);
    }
    await env.DB.prepare("UPDATE resources SET calendar_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(resId).run();
    await audit(env, user.id, mode === "google" ? "delete_calendar" : "unlink_calendar", "resource", resId, { calendarId: row.calendar_id }, request);
    return new Response(null, { status: 204 });
  }

  if (path.startsWith("/api/admin/resources")) {
    const id = parseId(path, "/api/admin/resources");
    if (method === "GET") {
      const results = await env.DB.prepare("SELECT * FROM resources WHERE deleted_at IS NULL ORDER BY name").all();
      return json({ resources: results.results });
    }
    if (method === "DELETE" && id) {
      const future = await env.DB.prepare(`
        SELECT COUNT(*) AS count FROM booking_resource_allocations bra JOIN bookings b ON b.id=bra.booking_id
        WHERE bra.resource_id=? AND b.start_at>CURRENT_TIMESTAMP AND b.status IN ('confirmed','calendar_sync_failed')
      `).bind(id).first<{ count: number }>();
      if (future?.count) throw new HttpError(409, "This resource has future bookings and cannot be deleted.", "future_bookings_exist");
      const resourceRow = await env.DB.prepare("SELECT calendar_id FROM resources WHERE id=?").bind(id).first<{ calendar_id: string | null }>();
      await env.DB.prepare("UPDATE resources SET deleted_at=CURRENT_TIMESTAMP, enabled=0 WHERE id=?").bind(id).run();
      await audit(env, user.id, "delete", "resource", id, {}, request);
      if (resourceRow?.calendar_id) {
        deleteCalendar(env, resourceRow.calendar_id).catch((err: unknown) =>
          console.error("[auto-calendar] resource calendar deletion failed", err)
        );
      }
      return new Response(null, { status: 204 });
    }
    const payload = resourceMutationSchema.parse(await readJson(request));
    if (method === "POST") {
      const nextId = uuid();
      // Auto-create a Google Calendar for instructors when no calendar is manually provided.
      let resolvedCalendarId = payload.calendarId || null;
      if (!resolvedCalendarId && payload.type === "instructor") {
        resolvedCalendarId = await createCalendar(env, `Easy Driving - Instructor ${payload.name}`).catch((err: unknown) => {
          console.error("[auto-calendar] instructor calendar creation failed", err);
          return null;
        });
        // Share the new calendar with the instructor's email so it appears in their Google Calendar.
        if (resolvedCalendarId && payload.email) {
          shareCalendar(env, resolvedCalendarId, payload.email, "reader").catch((err: unknown) =>
            console.error("[auto-calendar] instructor calendar share failed", err)
          );
        }
      }
      await env.DB.prepare(`
        INSERT INTO resources(id, group_id, center_id, type, name, email, phone, calendar_id, enabled, public_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(nextId, payload.groupId, payload.centerId, payload.type, payload.name, payload.email || null, payload.phone || null, resolvedCalendarId, Number(payload.enabled), Number(payload.publicVisible)).run();
      await audit(env, user.id, "create", "resource", nextId, { ...payload, calendarId: resolvedCalendarId }, request);
      return json({ id: nextId, ...payload, calendarId: resolvedCalendarId }, 201);
    }
    if (method === "PATCH" && id) {
      let resolvedCalendarId = payload.calendarId || null;
      if (!resolvedCalendarId && payload.type === "instructor") {
        const existing = await env.DB.prepare("SELECT calendar_id FROM resources WHERE id=?").bind(id).first<{ calendar_id: string | null }>();
        if (!existing?.calendar_id) {
          resolvedCalendarId = await createCalendar(env, payload.name).catch((err: unknown) => {
            console.error("[auto-calendar] instructor calendar creation failed", err);
            return null;
          });
          if (resolvedCalendarId && payload.email) {
            shareCalendar(env, resolvedCalendarId, payload.email, "reader").catch((err: unknown) =>
              console.error("[auto-calendar] instructor calendar share failed", err)
            );
          }
        }
      }
      await env.DB.prepare(`
        UPDATE resources SET group_id=?, center_id=?, type=?, name=?, email=?, phone=?, calendar_id=?,
        enabled=?, public_visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(payload.groupId, payload.centerId, payload.type, payload.name, payload.email || null, payload.phone || null, resolvedCalendarId, Number(payload.enabled), Number(payload.publicVisible), id).run();
      await audit(env, user.id, "update", "resource", id, { ...payload, calendarId: resolvedCalendarId }, request);
      return json({ id, ...payload, calendarId: resolvedCalendarId });
    }
  }

  if (path.startsWith("/api/admin/forms")) {
    const id = parseId(path, "/api/admin/forms");
    if (method === "GET") {
      const results = await env.DB.prepare("SELECT * FROM forms WHERE deleted_at IS NULL ORDER BY name").all();
      return json({ forms: results.results });
    }
    const body = await readJson(request) as { name: string; schema: BookingForm };
    if (!body.name || !body.schema?.fields) throw new HttpError(400, "Form name and schema are required.");
    const schemaProblems = validateBookingForm(body.schema);
    if (schemaProblems.length) throw new HttpError(400, schemaProblems.join(" "));
    if (method === "POST") {
      const nextId = uuid();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO forms(id,name,active_version) VALUES(?,?,1)").bind(nextId, body.name),
        env.DB.prepare("INSERT INTO form_versions(id,form_id,version,schema_json,created_by) VALUES(?,?,1,?,?)")
          .bind(uuid(), nextId, JSON.stringify({ ...body.schema, id: nextId, version: 1 }), user.id)
      ]);
      await audit(env, user.id, "create", "form", nextId, body, request);
      return json({ id: nextId, version: 1 }, 201);
    }
    if (method === "PATCH" && id) {
      const current = await env.DB.prepare("SELECT active_version FROM forms WHERE id=?").bind(id).first<{ active_version: number }>();
      if (!current) throw new HttpError(404, "Form not found.");
      const version = current.active_version + 1;
      await env.DB.batch([
        env.DB.prepare("UPDATE forms SET name=?, active_version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.name, version, id),
        env.DB.prepare("INSERT INTO form_versions(id,form_id,version,schema_json,created_by) VALUES(?,?,?,?,?)")
          .bind(uuid(), id, version, JSON.stringify({ ...body.schema, id, version }), user.id)
      ]);
      await audit(env, user.id, "publish", "form", id, { version }, request);
      return json({ id, version });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("UPDATE forms SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      return new Response(null, { status: 204 });
    }
  }
  throw new HttpError(405, "Method not allowed.");
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/api/health") return json({ ok: true, service: "easy-driving-booking-api" });

  if (path === "/api/auth/config" && method === "GET") {
    return json({ google: Boolean(env.GOOGLE_CLIENT_ID), devLogin: devLoginAvailable(env) });
  }
  if (path === "/api/auth/google/start" && (method === "GET" || method === "POST")) return handleGoogleStart(env, "login");
  if (path === "/api/auth/google/callback" && method === "GET") return handleGoogleCallback(request, env);
  if (path === "/api/auth/dev-login" && method === "POST") {
    assertTrustedOrigin(request, env);
    return handleDevLogin(request, env);
  }
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);

  if (path === "/api/public/config" && method === "GET") {
    const retention = await env.DB.prepare("SELECT retention_days FROM retention_settings WHERE id='default'").first<{ retention_days: number }>();
    return json({
      brand: { name: "Easy Driving School", primaryColor: "#F03C02", supportPhone: "+1 (514) 463-1043" },
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined,
      retentionDays: retention?.retention_days || 90,
      languages: ["en", "fr"]
    });
  }
  if (path === "/api/public/centers" && method === "GET") {
    const results = await env.DB.prepare(`
      SELECT id, slug, name, address, timezone, enabled FROM centers
      WHERE enabled=1 AND deleted_at IS NULL ORDER BY sort_order, name
    `).all<DbCenter>();
    return json(results.results.map((center) => ({ ...center, enabled: Boolean(center.enabled) })));
  }
  if (path === "/api/public/services" && method === "GET") {
    const centerSlug = url.searchParams.get("centerSlug");
    if (!centerSlug) throw new HttpError(400, "centerSlug is required.");
    // A service is offered at a center when an enabled service_centers row links
    // them, OR when the service has no service_centers rows at all (= available
    // everywhere). Checking every center in the admin UI deletes all rows, so the
    // "no rows" case must resolve to available, not hidden.
    const results = await env.DB.prepare(`
      SELECT services.* FROM services
      JOIN centers ON centers.slug=? AND centers.enabled=1
      WHERE services.enabled=1 AND services.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM service_centers
            WHERE service_centers.service_id=services.id
              AND service_centers.center_id=centers.id AND service_centers.enabled=1
          )
          OR NOT EXISTS (
            SELECT 1 FROM service_centers WHERE service_centers.service_id=services.id
          )
        )
      ORDER BY services.sort_order, services.name_en
    `).bind(centerSlug).all<DbService>();
    return json(results.results.map(serviceResponse));
  }
  if (path === "/api/public/packages" && method === "GET") {
    const centerSlug = url.searchParams.get("centerSlug");
    if (!centerSlug) throw new HttpError(400, "centerSlug is required.");
    // Same center-availability semantics as services: a package_centers row enables it at a center,
    // and a package with no rows at all is available everywhere.
    const rows = await env.DB.prepare(`
      SELECT packages.* FROM packages
      JOIN centers ON centers.slug=? AND centers.enabled=1
      WHERE packages.enabled=1 AND packages.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM package_centers WHERE package_centers.package_id=packages.id
            AND package_centers.center_id=centers.id AND package_centers.enabled=1)
          OR NOT EXISTS (SELECT 1 FROM package_centers WHERE package_centers.package_id=packages.id)
        )
      ORDER BY packages.sort_order, packages.name_en
    `).bind(centerSlug).all<Parameters<typeof packageResponse>[0]>();
    if (rows.results.length === 0) return json([]);
    const ids = rows.results.map((row) => row.id);
    const items = (await env.DB.prepare(`
      SELECT package_items.*, services.slug AS service_slug, services.name_en AS service_name_en,
        services.name_fr AS service_name_fr, services.description_en AS service_description_en,
        services.description_fr AS service_description_fr, services.duration_minutes
      FROM package_items
      JOIN services ON services.id = package_items.service_id
      WHERE package_items.package_id IN (${ids.map(() => "?").join(",")})
    `).bind(...ids).all<Parameters<typeof packageResponse>[1][number]>()).results;
    return json(rows.results.map((row) => packageResponse(row, items)));
  }
  if (path.startsWith("/api/public/forms/") && method === "GET") {
    const formId = decodeURIComponent(path.slice("/api/public/forms/".length));
    const row = await env.DB.prepare(`
      SELECT form_versions.schema_json FROM forms
      JOIN form_versions ON form_versions.form_id=forms.id AND form_versions.version=forms.active_version
      WHERE forms.id=? AND forms.deleted_at IS NULL
    `).bind(formId).first<{ schema_json: string }>();
    if (!row) throw new HttpError(404, "Form not found.");
    return json(JSON.parse(row.schema_json));
  }
  if (path === "/api/public/availability" && method === "POST") {
    await rateLimit(request, env, 120, 5);
    const payload = availabilityRequestSchema.parse(await readJson(request));
    const result = await getSlots(env, payload.centerSlug, payload.serviceSlug, payload.dateFrom, Boolean(payload.debug));
    // Best-effort: reconcile this center's calendar in the background so externally-deleted
    // Google events free their slots before the next load. Never blocks the response, and the
    // booking lock re-checks availability at confirm time, so a slightly stale list is harmless.
    if (result.center?.id) {
      ctx.waitUntil(
        reconcileCalendar(env, { centerId: result.center.id }).catch((error) =>
          console.error("[reconcile] background availability run failed", error)
        )
      );
    }
    return json({ slots: result.slots });
  }
  if (path === "/api/public/bookings" && method === "POST") {
    await rateLimit(request, env, 20, 5);
    const payload = bookingRequestSchema.parse(await readJson(request));
    await verifyTurnstile(request, env, payload.turnstileToken);
    const center = await env.DB.prepare("SELECT id, timezone FROM centers WHERE slug=? AND enabled=1").bind(payload.centerSlug).first<{ id: string; timezone: string }>();
    if (!center) throw new HttpError(404, "Location is unavailable.");
    const localDate = dateInTimeZone(payload.start, center.timezone);
    const durableId = env.BOOKING_LOCK.idFromName(`center:${center.id}:${localDate}`);
    const response = await env.BOOKING_LOCK.get(durableId).fetch("https://booking-lock.internal/confirm", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
  }
  if (path === "/api/public/package-bookings" && method === "POST") {
    await rateLimit(request, env, 10, 5);
    const payload = packageBookingRequestSchema.parse(await readJson(request));
    await verifyTurnstile(request, env, payload.turnstileToken);
    // Orchestrated in the main worker (not a single DO): a package's sessions can span multiple
    // dates, so each session is serialized in its own per-date BookingLock during the reserve phase.
    const { turnstileToken: _t, ...orchestratorPayload } = payload;
    const result = await confirmPackageBooking(env, orchestratorPayload as PackageBookingPayload);
    return json(result, 201);
  }

  const publicBookingMatch = path.match(/^\/api\/public\/bookings\/([^/]+)\/public$/);
  if (publicBookingMatch && method === "GET") return json(await publicBookingByToken(request, env, publicBookingMatch[1]));
  const cancelMatch = path.match(/^\/api\/public\/bookings\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    await rateLimit(request, env, 10, 10);
    const booking = await publicBookingByToken(request, env, cancelMatch[1]);
    const service = await env.DB.prepare(`
      SELECT cancellation_cutoff_hours FROM services JOIN bookings ON bookings.service_id=services.id WHERE bookings.id=?
    `).bind(booking.id).first<{ cancellation_cutoff_hours: number | null }>();
    const cutoff = service?.cancellation_cutoff_hours || 0;
    if (new Date(booking.start_at).getTime() - Date.now() < cutoff * 3_600_000) {
      throw new HttpError(409, "Online cancellation is no longer available. Please call us.", "cancellation_cutoff");
    }
    await env.DB.prepare(`
      UPDATE bookings SET status='cancelled_by_student', cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(booking.id).run();
    // Best-effort: the booking is cancelled in D1 regardless; calendar cleanup failures are logged.
    const cleanup = await cancelBookingCalendar(env, booking.id).catch((error: unknown) => {
      console.error("[cancel] calendar cleanup failed", error);
      return { failed: 1 };
    });
    return json({ reference: booking.reference, status: "cancelled_by_student", calendarCleanup: cleanup });
  }
  const rescheduleMatch = path.match(/^\/api\/public\/bookings\/([^/]+)\/reschedule$/);
  if (rescheduleMatch && method === "POST") {
    const existing = await publicBookingByToken(request, env, rescheduleMatch[1]);
    const payload = bookingRequestSchema.parse(await readJson(request));
    const center = await env.DB.prepare("SELECT id, timezone FROM centers WHERE slug=?").bind(payload.centerSlug).first<{ id: string; timezone: string }>();
    if (!center) throw new HttpError(404, "Location is unavailable.");
    const durableId = env.BOOKING_LOCK.idFromName(`center:${center.id}:${dateInTimeZone(payload.start, center.timezone)}`);
    const response = await env.BOOKING_LOCK.get(durableId).fetch("https://booking-lock.internal/confirm", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (response.ok) await env.DB.prepare("UPDATE bookings SET status='rescheduled', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(existing.id).run();
    return response;
  }

  if (path.startsWith("/api/admin")) {
    assertTrustedOrigin(request, env);
    const user = await requireUser(request, env);
    if (path === "/api/admin/me" && method === "GET") return json({ user });
    if (path === "/api/admin/bookings" && method === "GET") {
      const results = await env.DB.prepare(`
        SELECT bookings.id, bookings.reference, bookings.start_at, bookings.created_at, bookings.status,
          bookings.calendar_last_error, bookings.package_booking_id,
          package_bookings.reference AS package_reference, packages.name_en AS package_name,
          services.name_en AS service, services.slug AS service_slug,
          centers.name AS center, centers.slug AS center_slug,
          COALESCE(booking_form_responses.student_name, 'Private') AS student,
          (
            SELECT group_concat(resources.name, ', ')
            FROM booking_resource_allocations bra
            JOIN resources ON resources.id = bra.resource_id
            WHERE bra.booking_id = bookings.id AND resources.type = 'instructor'
          ) AS instructor
        FROM bookings JOIN services ON services.id=bookings.service_id
        JOIN centers ON centers.id=bookings.center_id
        LEFT JOIN booking_form_responses ON booking_form_responses.booking_id=bookings.id
        LEFT JOIN package_bookings ON package_bookings.id=bookings.package_booking_id
        LEFT JOIN packages ON packages.id=package_bookings.package_id
        ORDER BY bookings.start_at DESC LIMIT 500
      `).all<Record<string, string>>();
      const fmt = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Montreal" });
      const dateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "America/Montreal" });
      const bookedFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Montreal" });
      // SQLite CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" (UTC, no offset); normalise to ISO so Date parses it reliably.
      const parse = (value: string) => new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(" ", "T") + "Z" : value);
      const safe = (formatter: Intl.DateTimeFormat, value: string) => {
        const d = parse(value);
        return Number.isNaN(d.getTime()) ? (value || "") : formatter.format(d);
      };
      return json({ bookings: results.results.map((booking) => ({
        ...booking,
        time: safe(fmt, booking.start_at),
        date: safe(dateFmt, booking.start_at),
        booked_at: safe(bookedFmt, booking.created_at),
        package_booking_id: booking.package_booking_id || "",
        package_reference: booking.package_reference || "",
        package_name: booking.package_name || "",
      })) });
    }
    if (path === "/api/admin/overrides" && method === "GET") {
      const results = await env.DB.prepare(`
        SELECT capacity_overrides.*, centers.name AS center, services.name_en AS target
        FROM capacity_overrides JOIN centers ON centers.id=capacity_overrides.center_id
        LEFT JOIN services ON services.id=capacity_overrides.service_id
        WHERE capacity_overrides.deleted_at IS NULL AND capacity_overrides.end_at>CURRENT_TIMESTAMP
        ORDER BY capacity_overrides.created_at DESC
      `).all<Record<string, string>>();
      return json({ overrides: results.results.map((item) => ({
        ...item,
        target: item.target || "All services",
        period: `${item.start_at} – ${item.end_at}`,
        detail: item.type === "service_capacity" ? `Limit: ${item.capacity_limit}` : "Closed"
      })) });
    }
    if (path === "/api/admin/overrides" && method === "POST") {
      const payload = overrideRequestSchema.parse(await readJson(request));
      const id = uuid();
      await env.DB.prepare(`
        INSERT INTO capacity_overrides(
          id, center_id, service_id, resource_id, type, start_at, end_at, capacity_limit, reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, payload.centerId, payload.serviceId || null, payload.resourceId || null, payload.type, payload.startAt, payload.endAt, payload.capacityLimit ?? null, payload.reason || null, user.id).run();
      await audit(env, user.id, "create", "capacity_override", id, payload, request);
      return json({ id, ...payload }, 201);
    }
    const deleteOverrideMatch = path.match(/^\/api\/admin\/overrides\/([^/]+)$/);
    if (deleteOverrideMatch && method === "DELETE") {
      await env.DB.prepare("UPDATE capacity_overrides SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").bind(deleteOverrideMatch[1]).run();
      await audit(env, user.id, "remove", "capacity_override", deleteOverrideMatch[1], {}, request);
      return new Response(null, { status: 204 });
    }
    if (path === "/api/admin/debug/availability" && method === "POST") {
      const payload = availabilityRequestSchema.parse({ ...(await readJson(request) as object), debug: true });
      return json(await getSlots(env, payload.centerSlug, payload.serviceSlug, payload.dateFrom, true));
    }
    if (path === "/api/admin/calendar/connections" && method === "GET") {
      const results = await env.DB.prepare("SELECT id, google_email, scopes, status, last_error, updated_at FROM google_connections").all();
      return json({ connections: results.results });
    }
    if (path === "/api/admin/calendar/connect" && (method === "POST" || method === "GET")) return handleGoogleStart(env, "calendar");
    if (path === "/api/admin/calendar/list" && method === "GET") return json({ calendars: await listCalendars(env) });
    if (path === "/api/admin/calendar/template") {
      if (method === "GET") {
        const setting = await env.DB.prepare(
          "SELECT title_template, description_template, description_template_fr, notification_email, updated_at FROM calendar_event_settings WHERE id='default'"
        ).first<{ title_template: string | null; description_template: string | null; description_template_fr: string | null; notification_email: string | null; updated_at: string }>();
        return json({ template: setting || { title_template: null, description_template: null, description_template_fr: null, notification_email: null } });
      }
      if (method === "PATCH") {
        const body = await readJson(request) as { titleTemplate?: string | null; descriptionTemplate?: string | null; descriptionTemplateFr?: string | null; notificationEmail?: string | null };
        // Empty string clears the override back to the built-in default.
        const title = body.titleTemplate?.trim() ? body.titleTemplate : null;
        const description = body.descriptionTemplate?.trim() ? body.descriptionTemplate : null;
        const descriptionFr = body.descriptionTemplateFr?.trim() ? body.descriptionTemplateFr : null;
        const notificationEmailRaw = body.notificationEmail?.trim() || null;
        if (notificationEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmailRaw)) {
          throw new HttpError(400, "Please enter a valid notification email address.", "invalid_email");
        }
        await env.DB.prepare(`
          UPDATE calendar_event_settings
          SET title_template=?, description_template=?, description_template_fr=?, notification_email=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
          WHERE id='default'
        `).bind(title, description, descriptionFr, notificationEmailRaw, user.id).run();
        await audit(env, user.id, "update", "calendar_event_settings", "default", { title, description, descriptionFr, notificationEmail: notificationEmailRaw }, request);
        return json({ template: { title_template: title, description_template: description, description_template_fr: descriptionFr, notification_email: notificationEmailRaw } });
      }
    }
    if (path === "/api/admin/calendar/mappings" && method === "GET") {
      const results = await env.DB.prepare(`
        SELECT calendar_mappings.*, centers.name AS center_name, services.name_en AS service_name
        FROM calendar_mappings
        LEFT JOIN centers ON centers.id = calendar_mappings.center_id
        LEFT JOIN services ON services.id = calendar_mappings.mapping_id AND calendar_mappings.mapping_type = 'service'
        WHERE calendar_mappings.enabled = 1
        ORDER BY calendar_mappings.created_at DESC
      `).all();
      return json({ mappings: results.results });
    }
    const deleteMappingMatch = path.match(/^\/api\/admin\/calendar\/mappings\/([^/]+)$/);
    if (deleteMappingMatch && method === "DELETE") {
      await env.DB.prepare("UPDATE calendar_mappings SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(deleteMappingMatch[1]).run();
      await audit(env, user.id, "delete", "calendar_mapping", deleteMappingMatch[1], {}, request);
      return new Response(null, { status: 204 });
    }
    if (path === "/api/admin/calendar/mappings" && method === "POST") {
      const body = await readJson(request) as { centerId?: string; mappingType: string; mappingId: string; calendarId: string; eventRole?: string };
      const id = uuid();
      await env.DB.prepare(`
        INSERT INTO calendar_mappings(id,center_id,mapping_type,mapping_id,calendar_id,event_role)
        VALUES(?,?,?,?,?,?)
      `).bind(id, body.centerId || null, body.mappingType, body.mappingId, body.calendarId, body.eventRole || "canonical").run();
      await audit(env, user.id, "create", "calendar_mapping", id, body, request);
      return json({ id, ...body }, 201);
    }
    const resyncMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/resync-calendar$/);
    if (resyncMatch && method === "POST") {
      const result = await syncBookingCalendar(env, resyncMatch[1]);
      return json(result);
    }
    const adminCancelMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/cancel$/);
    if (adminCancelMatch && method === "POST") {
      await env.DB.prepare("UPDATE bookings SET status='cancelled_by_admin', cancelled_at=CURRENT_TIMESTAMP WHERE id=?").bind(adminCancelMatch[1]).run();
      // Best-effort: the booking is cancelled in D1 regardless; calendar cleanup failures are logged.
      const cleanup = await cancelBookingCalendar(env, adminCancelMatch[1]).catch((error: unknown) => {
        console.error("[cancel] calendar cleanup failed", error);
        return { failed: 1 };
      });
      await audit(env, user.id, "cancel", "booking", adminCancelMatch[1], {}, request);
      return json({ id: adminCancelMatch[1], status: "cancelled_by_admin", calendarCleanup: cleanup });
    }

    if (path === "/api/admin/bookings/reconcile" && method === "POST") {
      // Manual trigger: ignore working-hours gating by checking all centers right now.
      const summary = await reconcileCalendar(env, { force: true });
      await audit(env, user.id, "reconcile", "booking", "all", summary, request);
      return json(summary);
    }

    // Ad-hoc admin booking. Routed through the BookingLock Durable Object so the
    // resource-conflict check is serialised against concurrent public bookings.
    // Cutoffs/closures are overridable; genuine resource double-bookings are not.
    if (path === "/api/admin/bookings" && method === "POST") {
      const payload = adminBookingSchema.parse(await readJson(request));
      const center = await env.DB.prepare("SELECT id, timezone FROM centers WHERE slug=?").bind(payload.centerSlug).first<{ id: string; timezone: string }>();
      if (!center) throw new HttpError(404, "Location is unavailable.");
      const durableId = env.BOOKING_LOCK.idFromName(`center:${center.id}:${dateInTimeZone(payload.start, center.timezone)}`);
      const response = await env.BOOKING_LOCK.get(durableId).fetch("https://booking-lock.internal/admin-confirm", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (response.ok) await audit(env, user.id, "create", "booking", "", payload, request);
      return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    const adminRescheduleMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/reschedule$/);
    if (adminRescheduleMatch && method === "POST") {
      const { start } = adminRescheduleSchema.parse(await readJson(request));
      const booking = await env.DB.prepare(
        "SELECT center_id, timezone FROM bookings WHERE id=?"
      ).bind(adminRescheduleMatch[1]).first<{ center_id: string; timezone: string }>();
      if (!booking) throw new HttpError(404, "Booking not found.");
      // Serialise against the target day's lock so a reschedule can't race a public booking onto the same resource.
      const durableId = env.BOOKING_LOCK.idFromName(`center:${booking.center_id}:${dateInTimeZone(start, booking.timezone)}`);
      const result = await env.BOOKING_LOCK.get(durableId).fetch("https://booking-lock.internal/admin-reschedule", {
        method: "POST",
        body: JSON.stringify({ bookingId: adminRescheduleMatch[1], start })
      });
      if (result.ok) await audit(env, user.id, "reschedule", "booking", adminRescheduleMatch[1], { start }, request);
      return new Response(result.body, { status: result.status, headers: { "Content-Type": "application/json" } });
    }

    if (path.startsWith("/api/admin/resource-groups")) {
      const id = parseId(path, "/api/admin/resource-groups");
      if (method === "GET") {
        const results = await env.DB.prepare(`
          SELECT resource_groups.*, centers.name AS center_name,
            (SELECT COUNT(*) FROM resources WHERE resources.group_id = resource_groups.id AND resources.deleted_at IS NULL) AS member_count
          FROM resource_groups JOIN centers ON centers.id = resource_groups.center_id
          WHERE centers.deleted_at IS NULL
          ORDER BY centers.name, resource_groups.type
        `).all();
        return json({ groups: results.results });
      }
      if (method === "PATCH" && id) {
        const body = await readJson(request) as { capacity?: number; enabled?: boolean };
        const current = await env.DB.prepare("SELECT capacity, enabled FROM resource_groups WHERE id=?").bind(id).first<{ capacity: number; enabled: number }>();
        if (!current) throw new HttpError(404, "Resource group not found.");
        const capacity = body.capacity === undefined ? current.capacity : Math.max(0, Number(body.capacity));
        const enabled = body.enabled === undefined ? current.enabled : Number(body.enabled);
        await env.DB.prepare("UPDATE resource_groups SET capacity=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(capacity, enabled, id).run();
        await audit(env, user.id, "update", "resource_group", id, { capacity, enabled }, request);
        return json({ id, capacity, enabled: Boolean(enabled) });
      }
    }

    const adminFormMatch = path.match(/^\/api\/admin\/forms\/([^/]+)$/);
    if (adminFormMatch && method === "GET") {
      const row = await env.DB.prepare(`
        SELECT forms.id, forms.name, forms.active_version, form_versions.schema_json
        FROM forms JOIN form_versions ON form_versions.form_id = forms.id AND form_versions.version = forms.active_version
        WHERE forms.id = ? AND forms.deleted_at IS NULL
      `).bind(adminFormMatch[1]).first<{ id: string; name: string; active_version: number; schema_json: string }>();
      if (!row) throw new HttpError(404, "Form not found.");
      return json({ id: row.id, name: row.name, version: row.active_version, schema: JSON.parse(row.schema_json) });
    }

    if (path === "/api/admin/retention") {
      if (method === "GET") {
        const setting = await env.DB.prepare("SELECT retention_days, token_expiry_days, updated_at FROM retention_settings WHERE id='default'").first();
        const lastJob = await env.DB.prepare("SELECT status, records_anonymized, completed_at FROM retention_jobs ORDER BY started_at DESC LIMIT 1").first();
        return json({ settings: setting, lastJob });
      }
      if (method === "PATCH") {
        const body = await readJson(request) as { retentionDays?: number; tokenExpiryDays?: number };
        const days = Math.max(1, Number(body.retentionDays || 90));
        await env.DB.prepare(`
          UPDATE retention_settings SET retention_days=?, token_expiry_days=COALESCE(?, token_expiry_days),
          updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id='default'
        `).bind(days, body.tokenExpiryDays ?? null, user.id).run();
        await audit(env, user.id, "update", "retention_settings", "default", { retentionDays: days }, request);
        return json({ retentionDays: days });
      }
    }

    if (path === "/api/admin/center-hours") {
      if (method === "GET") {
        const centerId = url.searchParams.get("centerId");
        if (!centerId) throw new HttpError(400, "centerId is required.");
        const results = await env.DB.prepare(
          "SELECT id, center_id, day_of_week, start_time, end_time, enabled FROM center_hours WHERE center_id=? ORDER BY day_of_week, start_time"
        ).bind(centerId).all();
        return json({ hours: results.results });
      }
      if (method === "PUT") {
        const body = await readJson(request) as { centerId: string; hours: Array<{ dayOfWeek: number; startTime: string; endTime: string; enabled?: boolean }> };
        if (!body.centerId || !Array.isArray(body.hours)) throw new HttpError(400, "centerId and hours are required.");
        const statements: D1PreparedStatement[] = [
          env.DB.prepare("DELETE FROM center_hours WHERE center_id=?").bind(body.centerId)
        ];
        for (const row of body.hours) {
          if (row.enabled === false) continue;
          if (!/^\d{2}:\d{2}$/.test(row.startTime) || !/^\d{2}:\d{2}$/.test(row.endTime)) continue;
          statements.push(env.DB.prepare(
            "INSERT INTO center_hours(id, center_id, day_of_week, start_time, end_time, enabled) VALUES(?,?,?,?,?,1)"
          ).bind(uuid(), body.centerId, row.dayOfWeek, row.startTime, row.endTime));
        }
        await env.DB.batch(statements);
        await audit(env, user.id, "update", "center_hours", body.centerId, body.hours, request);
        return json({ centerId: body.centerId, count: statements.length - 1 });
      }
    }

    if (path === "/api/admin/service-requirements" && method === "GET") {
      const serviceId = url.searchParams.get("serviceId");
      if (!serviceId) throw new HttpError(400, "serviceId is required.");
      const results = await env.DB.prepare(
        "SELECT resource_type, units FROM service_resource_requirements WHERE service_id=?"
      ).bind(serviceId).all();
      return json({ requirements: results.results });
    }

    if (path === "/api/admin/service-requirements" && method === "PUT") {
      const body = await readJson(request) as { serviceId: string; requirements: Array<{ resource_type: string; units: number }> };
      if (!body.serviceId) throw new HttpError(400, "serviceId is required.");
      const allowed = ["cars", "instructors", "seats", "generic"];
      const valid = (body.requirements || []).filter((r) => allowed.includes(r.resource_type) && r.units > 0);
      await env.DB.prepare("DELETE FROM service_resource_requirements WHERE service_id=?").bind(body.serviceId).run();
      for (const req of valid) {
        await env.DB.prepare(
          "INSERT INTO service_resource_requirements(id, service_id, resource_type, units) VALUES(?,?,?,?)"
        ).bind(uuid(), body.serviceId, req.resource_type, req.units).run();
      }
      return json({ requirements: valid });
    }

    if (path === "/api/admin/service-centers" && method === "GET") {
      const serviceId = url.searchParams.get("serviceId");
      if (!serviceId) throw new HttpError(400, "serviceId is required.");
      const results = await env.DB.prepare(
        "SELECT center_id, enabled FROM service_centers WHERE service_id=?"
      ).bind(serviceId).all<{ center_id: string; enabled: number }>();
      const enabled = results.results.filter((r) => r.enabled).map((r) => r.center_id);
      // No rows = available everywhere; return all active center IDs so UI shows all checked.
      if (results.results.length === 0) {
        const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
        return json({ centerIds: allCenters.results.map((c) => c.id), allCenters: true });
      }
      return json({ centerIds: enabled });
    }

    if (path === "/api/admin/service-centers" && method === "PUT") {
      const body = await readJson(request) as { serviceId: string; centerIds: string[] };
      if (!body.serviceId) throw new HttpError(400, "serviceId is required.");
      const ids: string[] = Array.isArray(body.centerIds) ? body.centerIds : [];
      const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
      const allSelected = allCenters.results.every((c) => ids.includes(c.id));
      // No rows = available at all centers. Delete all rows when all are checked.
      await env.DB.prepare("DELETE FROM service_centers WHERE service_id=?").bind(body.serviceId).run();
      if (!allSelected && ids.length > 0) {
        for (const centerId of ids) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO service_centers(service_id, center_id, enabled) VALUES(?,?,1)"
          ).bind(body.serviceId, centerId).run();
        }
      }
      await audit(env, user.id, "update", "service_centers", body.serviceId, body, request);
      return json({ serviceId: body.serviceId, centerIds: ids });
    }

    if (path === "/api/admin/package-centers" && method === "GET") {
      const packageId = url.searchParams.get("packageId");
      if (!packageId) throw new HttpError(400, "packageId is required.");
      const results = await env.DB.prepare(
        "SELECT center_id, enabled FROM package_centers WHERE package_id=?"
      ).bind(packageId).all<{ center_id: string; enabled: number }>();
      const enabled = results.results.filter((r) => r.enabled).map((r) => r.center_id);
      // No rows = available everywhere; return all active center IDs so UI shows all checked.
      if (results.results.length === 0) {
        const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
        return json({ centerIds: allCenters.results.map((c) => c.id), allCenters: true });
      }
      return json({ centerIds: enabled });
    }

    if (path === "/api/admin/package-centers" && method === "PUT") {
      const body = await readJson(request) as { packageId: string; centerIds: string[] };
      if (!body.packageId) throw new HttpError(400, "packageId is required.");
      const ids: string[] = Array.isArray(body.centerIds) ? body.centerIds : [];
      const allCenters = await env.DB.prepare("SELECT id FROM centers WHERE deleted_at IS NULL AND enabled=1").all<{ id: string }>();
      const allSelected = allCenters.results.every((c) => ids.includes(c.id));
      // No rows = available at all centers. Delete all rows when all are checked.
      await env.DB.prepare("DELETE FROM package_centers WHERE package_id=?").bind(body.packageId).run();
      if (!allSelected && ids.length > 0) {
        for (const centerId of ids) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO package_centers(package_id, center_id, enabled) VALUES(?,?,1)"
          ).bind(body.packageId, centerId).run();
        }
      }
      await audit(env, user.id, "update", "package_centers", body.packageId, body, request);
      return json({ packageId: body.packageId, centerIds: ids });
    }

    return adminCrud(request, env, path, user);
  }

  throw new HttpError(404, "Not found.", "not_found");
}

async function cleanupRetention(env: Env) {
  const setting = await env.DB.prepare("SELECT retention_days FROM retention_settings WHERE id='default'").first<{ retention_days: number }>();
  const days = setting?.retention_days || 90;
  const jobId = uuid();
  await env.DB.prepare("INSERT INTO retention_jobs(id,started_at,status) VALUES(?,CURRENT_TIMESTAMP,'running')").bind(jobId).run();
  try {
    const expired = (await env.DB.prepare(`
      SELECT id FROM bookings WHERE pii_anonymized_at IS NULL
      AND end_at < datetime('now', ?)
      AND status IN ('confirmed','completed','no_show','cancelled_by_student','cancelled_by_admin','calendar_sync_failed')
      LIMIT 500
    `).bind(`-${days} days`).all<{ id: string }>()).results;
    if (expired.length) {
      const ids = expired.map((item) => item.id);
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE booking_form_responses SET response_json='{}', student_name=NULL, student_email=NULL,
          student_phone=NULL, anonymized_at=CURRENT_TIMESTAMP WHERE booking_id IN (${ids.map(() => "?").join(",")})
        `).bind(...ids),
        env.DB.prepare(`
          UPDATE bookings SET pii_anonymized_at=CURRENT_TIMESTAMP, public_token_hash='expired',
          status=CASE WHEN status='confirmed' THEN 'completed' ELSE status END
          WHERE id IN (${ids.map(() => "?").join(",")})
        `).bind(...ids)
      ]);
    }
    await env.DB.prepare(`
      UPDATE retention_jobs SET completed_at=CURRENT_TIMESTAMP, records_anonymized=?, status='completed' WHERE id=?
    `).bind(expired.length, jobId).run();
  } catch (error) {
    await env.DB.prepare(`
      UPDATE retention_jobs SET completed_at=CURRENT_TIMESTAMP, status='failed', last_error=? WHERE id=?
    `).bind(error instanceof Error ? error.message : "Unknown cleanup error", jobId).run();
    throw error;
  }
}

export class BookingLock {
  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(request: Request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const route = new URL(request.url).pathname;
    try {
      if (route === "/admin-confirm") {
        const payload = adminBookingSchema.parse(await request.json()) as AdminBookingPayload;
        const result = await this.state.blockConcurrencyWhile(() => confirmAdminBooking(this.env, payload));
        return json(result, 201);
      }
      if (route === "/admin-reschedule") {
        const body = await request.json() as { bookingId: string; start: string };
        const result = await this.state.blockConcurrencyWhile(() => rescheduleAdminBooking(this.env, body.bookingId, body.start));
        return json(result, 200);
      }
      if (route === "/package-reserve") {
        const body = await request.json() as { payload: ConfirmBookingPayload; packageBookingId: string };
        // reserveSession returns a discriminated result (never throws) so a slot conflict does not
        // reset the Durable Object. Map a failed reserve to its real HTTP status for the orchestrator.
        const result = await this.state.blockConcurrencyWhile(() => reserveSession(this.env, body.payload, body.packageBookingId));
        if (!result.ok) return json({ error: result.error, code: result.code }, result.status);
        return json(result.session, 201);
      }
      const payload = bookingRequestSchema.parse(await request.json()) as ConfirmBookingPayload;
      const result = await this.state.blockConcurrencyWhile(() => confirmBooking(this.env, payload));
      return json(result, 201);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
      if (error && typeof error === "object" && "issues" in error) return json({ error: "Invalid booking request.", code: "validation_error" }, 400);
      console.error(error);
      return json({ error: "We could not complete the booking. Please try again.", code: "booking_failed" }, 500);
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return withCors(await route(request, env, ctx), request, env);
    } catch (error) {
      if (error instanceof HttpError) return withCors(json({ error: error.message, code: error.code }, error.status), request, env);
      if (error && typeof error === "object" && "issues" in error) {
        return withCors(json({ error: "Please check the submitted information.", code: "validation_error" }, 400), request, env);
      }
      console.error(error);
      return withCors(json({ error: "Something went wrong. Please try again.", code: "internal_error" }, 500), request, env);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron fires every 30 min for calendar reconciliation; reconcile gates itself to
    // centers within working hours and is cheap when everyone is closed.
    ctx.waitUntil(reconcileCalendar(env).catch((error) => console.error("[reconcile] failed", error)));
    // Retention is a once-a-day job: only run it on the early-morning tick.
    const now = new Date();
    if (now.getUTCHours() === 5 && now.getUTCMinutes() < 30) {
      ctx.waitUntil(cleanupRetention(env));
    }
  }
};
