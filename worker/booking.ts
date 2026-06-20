import type { BookingForm } from "../shared/types";
import type { Env } from "./types";
import { checkExactSlot } from "./availability";
import { createCalendarEvent, deleteCalendarEvent } from "./google";
import { addMinutes, HttpError, randomToken, sha256, uuid } from "./utils";

interface TemplateFields {
  service: string;
  center: string;
  reference: string;
  student: string;
  manageUrl: string;
  visibleFields: string;
}

// Replaces {placeholder} tokens; unknown placeholders are left untouched so a
// typo in the admin template is visible rather than silently dropping content.
function renderTemplate(template: string, fields: TemplateFields) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in fields ? String(fields[key as keyof TemplateFields]) : match
  );
}

export interface ConfirmBookingPayload {
  centerSlug: string;
  serviceSlug: string;
  start: string;
  language: "en" | "fr";
  formVersion: number;
  answers: Record<string, unknown>;
}

export function validateForm(form: BookingForm, answers: Record<string, unknown>) {
  for (const field of form.fields) {
    const value = answers[field.key];
    if (field.required && (value === undefined || value === null || value === "" || value === false)) {
      throw new HttpError(400, `${field.label.en} is required.`, "invalid_form");
    }
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      throw new HttpError(400, "Please enter a valid email address.", "invalid_form");
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      throw new HttpError(400, `${field.label.en} must be a number.`, "invalid_form");
    }
    if ((field.type === "select" || field.type === "radio") && field.options && !field.options.some((option) => option.value === value)) {
      throw new HttpError(400, `${field.label.en} has an invalid selection.`, "invalid_form");
    }
  }
}

function publicService(service: {
  id: string;
  name_en: string;
  name_fr: string;
}) {
  return { id: service.id, name: { en: service.name_en, fr: service.name_fr } };
}

export async function confirmBooking(env: Env, payload: ConfirmBookingPayload) {
  const context = await checkExactSlot(env, payload.centerSlug, payload.serviceSlug, payload.start);
  if (!context.slot.available) {
    throw new HttpError(409, "That time was just booked. Please choose another slot.", "booking_conflict");
  }
  const aligned = context.input.businessWindows.some((window) => {
    const difference = new Date(payload.start).getTime() - new Date(window.start).getTime();
    return difference >= 0 && difference % (context.service.slot_interval_minutes * 60_000) === 0;
  });
  if (!aligned) throw new HttpError(400, "Please choose a listed time slot.", "invalid_slot");

  const formRow = await env.DB.prepare(`
    SELECT form_versions.schema_json FROM forms
    JOIN form_versions ON form_versions.form_id = forms.id AND form_versions.version = forms.active_version
    WHERE forms.id = ? AND forms.deleted_at IS NULL
  `).bind(context.service.form_id).first<{ schema_json: string }>();
  if (!formRow) throw new HttpError(409, "This booking form is not available.", "form_not_found");
  const form = JSON.parse(formRow.schema_json) as BookingForm;
  if (form.version !== payload.formVersion) {
    throw new HttpError(409, "The booking form was updated. Please refresh and try again.", "stale_form");
  }
  validateForm(form, payload.answers);

  const id = uuid();
  const reference = `ED-${Math.floor(100000 + Math.random() * 900000)}`;
  const publicToken = randomToken(32);
  const tokenHash = await sha256(publicToken);
  const end = addMinutes(payload.start, context.service.duration_minutes);
  const operationalStart = addMinutes(payload.start, -context.service.buffer_before_minutes);
  const operationalEnd = addMinutes(end, context.service.buffer_after_minutes);
  const studentName = String(payload.answers.fullName || "");
  const studentEmail = String(payload.answers.email || "");
  const studentPhone = String(payload.answers.phone || "");

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO bookings(
        id, reference, center_id, service_id, start_at, end_at, operational_start_at,
        operational_end_at, timezone, language, status, form_version,
        form_schema_snapshot, public_token_hash, calendar_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, 'pending')
    `).bind(
      id,
      reference,
      context.center.id,
      context.service.id,
      payload.start,
      end,
      operationalStart,
      operationalEnd,
      context.center.timezone,
      payload.language,
      form.version,
      JSON.stringify(form),
      tokenHash
    ),
    env.DB.prepare(`
      INSERT INTO booking_form_responses(booking_id, response_json, student_name, student_email, student_phone)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, JSON.stringify(payload.answers), studentName, studentEmail, studentPhone)
  ];

  for (const requirement of context.input.requirements) {
    const allocation = context.slot.allocations[requirement.groupId];
    if (Array.isArray(allocation)) {
      allocation.forEach((resourceId) => {
        statements.push(env.DB.prepare(`
          INSERT INTO booking_resource_allocations(
            id, booking_id, resource_group_id, resource_id, units, start_at, end_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?)
        `).bind(uuid(), id, requirement.groupId, resourceId, operationalStart, operationalEnd));
      });
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO booking_resource_allocations(
          id, booking_id, resource_group_id, resource_id, units, start_at, end_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?)
      `).bind(uuid(), id, requirement.groupId, Number(allocation) || requirement.units, operationalStart, operationalEnd));
    }
  }
  await env.DB.batch(statements);

  const sync = await syncBookingCalendar(env, id, publicToken).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Calendar sync failed";
    await env.DB.prepare(`
      UPDATE bookings SET status = 'calendar_sync_failed', calendar_sync_status = 'failed',
      calendar_last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(message.slice(0, 500), id).run();
    return { status: "failed" as const, error: message };
  });

  return {
    id,
    reference,
    status: sync.status === "failed" ? "calendar_sync_failed" : "confirmed",
    start: payload.start,
    end,
    centerName: context.center.name,
    serviceName: payload.language === "fr" ? context.service.name_fr : context.service.name_en,
    calendarSyncStatus: sync.status,
    manageToken: publicToken
  };
}

export async function syncBookingCalendar(env: Env, bookingId: string, knownPublicToken?: string) {
  const booking = await env.DB.prepare(`
    SELECT bookings.*, centers.name AS center_name, services.name_en, services.name_fr,
      booking_form_responses.response_json, booking_form_responses.student_name,
      booking_form_responses.student_email
    FROM bookings
    JOIN centers ON centers.id = bookings.center_id
    JOIN services ON services.id = bookings.service_id
    LEFT JOIN booking_form_responses ON booking_form_responses.booking_id = bookings.id
    WHERE bookings.id = ?
  `).bind(bookingId).first<Record<string, string>>();
  if (!booking) throw new HttpError(404, "Booking not found.");

  const canonical = await env.DB.prepare(`
    SELECT calendar_id FROM calendar_mappings
    WHERE enabled = 1 AND (
      (mapping_type = 'service' AND mapping_id = ?) OR
      (mapping_type = 'center' AND mapping_id = ?)
    )
    ORDER BY CASE WHEN mapping_type = 'service' THEN 0 ELSE 1 END LIMIT 1
  `).bind(booking.service_id, booking.center_id).first<{ calendar_id: string }>();
  if (!canonical) throw new Error("No canonical Google Calendar is mapped for this service or center.");

  const form = JSON.parse(booking.form_schema_snapshot) as BookingForm;
  const answers = JSON.parse(booking.response_json || "{}") as Record<string, unknown>;
  const visibleAnswers = form.fields
    .filter((field) => field.calendarVisible && answers[field.key])
    .map((field) => `${field.label.en}: ${String(answers[field.key])}`);
  const manageUrl = knownPublicToken
    ? `${env.APP_BASE_URL.replace(/\/$/, "")}/booking/${booking.reference}?token=${encodeURIComponent(knownPublicToken)}`
    : "";

  const template = await env.DB.prepare(
    "SELECT title_template, description_template FROM calendar_event_settings WHERE id = 'default'"
  ).first<{ title_template: string | null; description_template: string | null }>();

  const fields: TemplateFields = {
    service: booking.name_en,
    center: booking.center_name,
    reference: booking.reference,
    student: booking.student_name || "Private",
    manageUrl,
    visibleFields: visibleAnswers.join("\n")
  };

  // Defaults are intentionally good on their own; templates only override when set.
  const defaultSummary = `${fields.service} - ${fields.center} - Booking ${fields.reference}`;
  const defaultDescription = [
    `Booking reference: ${fields.reference}`,
    `Student: ${fields.student}`,
    `Service: ${fields.service}`,
    `Center: ${fields.center}`,
    fields.visibleFields,
    manageUrl ? `Manage or cancel: ${manageUrl}` : ""
  ].filter(Boolean).join("\n");

  const summary = template?.title_template
    ? renderTemplate(template.title_template, fields)
    : defaultSummary;
  const description = template?.description_template
    ? renderTemplate(template.description_template, fields)
    : defaultDescription;

  const canonicalEventId = await createCalendarEvent(env, canonical.calendar_id, {
    summary,
    description,
    start: booking.start_at,
    end: booking.end_at,
    timezone: booking.timezone,
    attendeeEmail: booking.student_email || undefined,
    bookingId,
    reference: booking.reference
  }, true);
  await env.DB.prepare(`
    INSERT INTO booking_calendar_events(id, booking_id, calendar_id, google_event_id, event_role, sync_status)
    VALUES (?, ?, ?, ?, 'canonical', 'synced')
  `).bind(uuid(), bookingId, canonical.calendar_id, canonicalEventId).run();

  const allocatedResources = (await env.DB.prepare(`
    SELECT DISTINCT resources.calendar_id FROM booking_resource_allocations
    JOIN resources ON resources.id = booking_resource_allocations.resource_id
    WHERE booking_resource_allocations.booking_id = ? AND resources.calendar_id IS NOT NULL
  `).bind(bookingId).all<{ calendar_id: string }>()).results;
  for (const resource of allocatedResources) {
    if (resource.calendar_id === canonical.calendar_id) continue;
    try {
      const eventId = await createCalendarEvent(env, resource.calendar_id, {
        summary,
        description: `Internal booking block\nReference: ${booking.reference}`,
        start: booking.operational_start_at,
        end: booking.operational_end_at,
        timezone: booking.timezone,
        bookingId,
        reference: booking.reference
      }, false);
      await env.DB.prepare(`
        INSERT INTO booking_calendar_events(id, booking_id, calendar_id, google_event_id, event_role, sync_status)
        VALUES (?, ?, ?, ?, 'resource_block', 'synced')
      `).bind(uuid(), bookingId, resource.calendar_id, eventId).run();
    } catch (error) {
      await env.DB.prepare(`
        INSERT INTO booking_calendar_events(id, booking_id, calendar_id, event_role, sync_status, last_error)
        VALUES (?, ?, ?, 'resource_block', 'failed', ?)
      `).bind(uuid(), bookingId, resource.calendar_id, error instanceof Error ? error.message : "Sync failed").run();
      throw error;
    }
  }

  await env.DB.prepare(`
    UPDATE bookings SET status = 'confirmed', calendar_sync_status = 'synced',
    calendar_last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(bookingId).run();
  return { status: "synced" as const };
}

// Removes the booking's Google events when it is cancelled. The canonical event is
// deleted with sendUpdates=all so Google emails the student a cancellation; internal
// resource blocks are deleted silently (no attendees) which also frees instructor FreeBusy.
// Deletion is idempotent (see deleteCalendarEvent), so a partial earlier sync is safe.
export async function cancelBookingCalendar(env: Env, bookingId: string) {
  const events = (await env.DB.prepare(`
    SELECT id, calendar_id, google_event_id, event_role
    FROM booking_calendar_events
    WHERE booking_id = ? AND google_event_id IS NOT NULL AND sync_status != 'deleted'
  `).bind(bookingId).all<{ id: string; calendar_id: string; google_event_id: string; event_role: string }>()).results;

  const errors: string[] = [];
  for (const event of events) {
    try {
      await deleteCalendarEvent(env, event.calendar_id, event.google_event_id, event.event_role === "canonical");
      await env.DB.prepare(
        "UPDATE booking_calendar_events SET sync_status = 'deleted', last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(event.id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calendar event deletion failed";
      errors.push(message);
      await env.DB.prepare(
        "UPDATE booking_calendar_events SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(message.slice(0, 500), event.id).run();
    }
  }
  return { deleted: events.length - errors.length, failed: errors.length, errors };
}

export function serviceResponse(service: {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_display: string | null;
  enabled: number;
  request_only: number;
  form_id: string;
  cutoff_hours: number;
  cancellation_cutoff_hours: number | null;
}) {
  return {
    id: service.id,
    slug: service.slug,
    name: { en: service.name_en, fr: service.name_fr },
    description: { en: service.description_en, fr: service.description_fr },
    durationMinutes: service.duration_minutes,
    bufferBeforeMinutes: service.buffer_before_minutes,
    bufferAfterMinutes: service.buffer_after_minutes,
    priceDisplay: service.price_display || undefined,
    enabled: Boolean(service.enabled),
    requestOnly: Boolean(service.request_only),
    formId: service.form_id,
    cutoffHours: service.cutoff_hours,
    cancellationCutoffHours: service.cancellation_cutoff_hours || undefined
  };
}
