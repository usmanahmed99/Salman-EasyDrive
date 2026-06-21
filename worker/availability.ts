import { computeAvailability, evaluateSlot, type AvailabilityInput } from "../shared/availability";
import type { Env, DbCenter, DbService } from "./types";
import { getFreeBusy } from "./google";
import { HttpError, localDateTimeToIso } from "./utils";

interface AvailabilityContext {
  center: DbCenter;
  service: DbService;
  input: AvailabilityInput;
  groups: Array<{ id: string; type: string; mode: "pooled" | "named"; capacity: number }>;
}

export async function loadAvailabilityContext(
  env: Env,
  centerSlug: string,
  serviceSlug: string,
  date: string
): Promise<AvailabilityContext> {
  const center = await env.DB.prepare(
    "SELECT * FROM centers WHERE slug = ? AND enabled = 1 AND deleted_at IS NULL"
  ).bind(centerSlug).first<DbCenter>();
  if (!center) throw new HttpError(404, "Location is unavailable.", "center_not_found");

  // A service is offered at a center when an enabled service_centers row links
  // them, OR when the service has no service_centers rows at all (= available
  // everywhere). Checking every center in the admin UI deletes all rows.
  const service = await env.DB.prepare(`
    SELECT services.* FROM services
    WHERE services.slug = ? AND services.enabled = 1 AND services.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM service_centers
          WHERE service_centers.service_id = services.id
            AND service_centers.center_id = ? AND service_centers.enabled = 1
        )
        OR NOT EXISTS (
          SELECT 1 FROM service_centers WHERE service_centers.service_id = services.id
        )
      )
  `).bind(serviceSlug, center.id).first<DbService>();
  if (!service) throw new HttpError(404, "Service is unavailable at this location.", "service_not_found");

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = await env.DB.prepare(
    "SELECT start_time, end_time FROM center_hours WHERE center_id = ? AND day_of_week = ? AND enabled = 1"
  ).bind(center.id, weekday).all<{ start_time: string; end_time: string }>();
  const businessWindows = hours.results.map((row) => ({
    start: localDateTimeToIso(date, row.start_time, center.timezone),
    end: localDateTimeToIso(date, row.end_time, center.timezone)
  }));

  const serviceHours = await env.DB.prepare(
    "SELECT start_time, end_time FROM service_hours WHERE service_id = ? AND center_id = ? AND day_of_week = ? AND enabled = 1"
  ).bind(service.id, center.id, weekday).all<{ start_time: string; end_time: string }>();

  const groups = (await env.DB.prepare(
    "SELECT id, type, mode, capacity FROM resource_groups WHERE center_id = ? AND enabled = 1"
  ).bind(center.id).all<{ id: string; type: string; mode: "pooled" | "named"; capacity: number }>()).results;
  const requirements = (await env.DB.prepare(
    "SELECT resource_type, units FROM service_resource_requirements WHERE service_id = ?"
  ).bind(service.id).all<{ resource_type: string; units: number }>()).results;
  const resources = (await env.DB.prepare(
    "SELECT id, group_id, enabled, calendar_id FROM resources WHERE center_id = ? AND deleted_at IS NULL"
  ).bind(center.id).all<{ id: string; group_id: string; enabled: number; calendar_id: string | null }>()).results;

  const dayStart = localDateTimeToIso(date, "00:00", center.timezone);
  const nextDate = new Date(`${date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateString = nextDate.toISOString().slice(0, 10);
  const dayEnd = localDateTimeToIso(nextDateString, "00:00", center.timezone);

  const bookings = (await env.DB.prepare(`
    SELECT id, service_id, operational_start_at AS start, operational_end_at AS end
    FROM bookings
    WHERE center_id = ? AND operational_start_at < ? AND operational_end_at > ?
      AND status IN ('pending_confirmation', 'confirmed', 'calendar_sync_failed')
  `).bind(center.id, dayEnd, dayStart).all<{ id: string; service_id: string; start: string; end: string }>()).results;
  const bookingIds = bookings.map((booking) => booking.id);
  const allocations = bookingIds.length
    ? (await env.DB.prepare(`
        SELECT booking_id, resource_group_id, resource_id, units
        FROM booking_resource_allocations
        WHERE booking_id IN (${bookingIds.map(() => "?").join(",")})
      `).bind(...bookingIds).all<{ booking_id: string; resource_group_id: string; resource_id: string | null; units: number }>()).results
    : [];

  const availabilityBookings = bookings.map((booking) => {
    const bookingAllocations: Record<string, string[] | number> = {};
    allocations.filter((item) => item.booking_id === booking.id).forEach((item) => {
      if (item.resource_id) {
        const current = bookingAllocations[item.resource_group_id];
        bookingAllocations[item.resource_group_id] = [...(Array.isArray(current) ? current : []), item.resource_id];
      } else {
        bookingAllocations[item.resource_group_id] = (Number(bookingAllocations[item.resource_group_id]) || 0) + item.units;
      }
    });
    return { id: booking.id, serviceId: booking.service_id, start: booking.start, end: booking.end, allocations: bookingAllocations };
  });

  const overrides = (await env.DB.prepare(`
    SELECT type, service_id, resource_id, start_at AS start, end_at AS end, capacity_limit
    FROM capacity_overrides
    WHERE center_id = ? AND start_at < ? AND end_at > ? AND deleted_at IS NULL
  `).bind(center.id, dayEnd, dayStart).all<{
    type: "center_closed" | "service_closed" | "resource_blocked" | "service_capacity";
    service_id: string | null;
    resource_id: string | null;
    start: string;
    end: string;
    capacity_limit: number | null;
  }>()).results.map((item) => ({
    type: item.type,
    serviceId: item.service_id,
    resourceId: item.resource_id,
    start: item.start,
    end: item.end,
    capacityLimit: item.capacity_limit
  }));

  let busyByCalendar: Record<string, Array<{ start: string; end: string }>> = {};
  const calendarIds = resources.map((resource) => resource.calendar_id).filter((id): id is string => Boolean(id));
  try {
    busyByCalendar = await getFreeBusy(env, calendarIds, dayStart, dayEnd);
  } catch (error) {
    if (error instanceof HttpError && error.code === "google_reconnect_required") throw error;
    // Existing D1 capacity remains usable during a temporary Google outage; confirmation rechecks and reports sync issues.
  }

  const input: AvailabilityInput = {
    serviceId: service.id,
    date,
    timezone: center.timezone,
    businessWindows,
    serviceWindows: serviceHours.results.length
      ? serviceHours.results.map((row) => ({
          start: localDateTimeToIso(date, row.start_time, center.timezone),
          end: localDateTimeToIso(date, row.end_time, center.timezone)
        }))
      : undefined,
    durationMinutes: service.duration_minutes,
    bufferBeforeMinutes: service.buffer_before_minutes,
    bufferAfterMinutes: service.buffer_after_minutes,
    slotIntervalMinutes: service.slot_interval_minutes,
    cutoffHours: service.cutoff_hours,
    now: new Date().toISOString(),
    baseConcurrency: service.base_concurrency,
    bookings: availabilityBookings,
    overrides,
    resources: resources.map((resource) => ({
      id: resource.id,
      groupId: resource.group_id,
      enabled: Boolean(resource.enabled),
      busy: resource.calendar_id ? (busyByCalendar[resource.calendar_id] || []) : []
    })),
    requirements: requirements.map((requirement) => {
      const group = groups.find((item) => item.type === requirement.resource_type);
      if (!group) {
        return { groupId: `missing_${requirement.resource_type}`, units: requirement.units, mode: "pooled" as const, capacity: 0, resourceIds: [] };
      }
      return {
        groupId: group.id,
        units: requirement.units,
        mode: group.mode,
        capacity: group.capacity,
        resourceIds: resources.filter((resource) => resource.group_id === group.id).map((resource) => resource.id)
      };
    })
  };
  return { center, service, input, groups };
}

export async function getSlots(env: Env, centerSlug: string, serviceSlug: string, date: string, debug = false) {
  const context = await loadAvailabilityContext(env, centerSlug, serviceSlug, date);
  const evaluated = computeAvailability(context.input);
  return {
    center: context.center,
    service: context.service,
    slots: evaluated
      .filter((slot) => debug || slot.available)
      .map((slot) => ({
        start: slot.start,
        end: slot.end,
        ...(debug ? { available: slot.available, capacityRemaining: slot.capacityRemaining, reasons: slot.reasons } : {})
      }))
  };
}

export async function checkExactSlot(env: Env, centerSlug: string, serviceSlug: string, start: string) {
  const probeCenter = await env.DB.prepare("SELECT timezone FROM centers WHERE slug = ?").bind(centerSlug).first<{ timezone: string }>();
  if (!probeCenter) throw new HttpError(404, "Location is unavailable.");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: probeCenter.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(start));
  const context = await loadAvailabilityContext(env, centerSlug, serviceSlug, date);
  return { ...context, slot: evaluateSlot(context.input, start) };
}
