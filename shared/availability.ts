export interface TimeWindow {
  start: string;
  end: string;
}

export interface AvailabilityBooking extends TimeWindow {
  id: string;
  serviceId: string;
  allocations: Record<string, string[] | number>;
}

export interface AvailabilityOverride extends TimeWindow {
  type: "center_closed" | "service_closed" | "resource_blocked" | "service_capacity";
  serviceId?: string | null;
  resourceId?: string | null;
  capacityLimit?: number | null;
}

export interface AvailabilityResource {
  id: string;
  groupId: string;
  enabled: boolean;
  busy: TimeWindow[];
}

export interface AvailabilityRequirement {
  groupId: string;
  units: number;
  mode: "pooled" | "named";
  capacity: number;
  resourceIds: string[];
}

export interface AvailabilityInput {
  serviceId: string;
  date: string;
  timezone: string;
  businessWindows: TimeWindow[];
  serviceWindows?: TimeWindow[];
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotIntervalMinutes: number;
  cutoffHours: number;
  now: string;
  baseConcurrency: number;
  bookings: AvailabilityBooking[];
  overrides: AvailabilityOverride[];
  resources: AvailabilityResource[];
  requirements: AvailabilityRequirement[];
}

export interface EvaluatedSlot extends TimeWindow {
  available: boolean;
  capacityRemaining: number;
  reasons: string[];
  allocations: Record<string, string[] | number>;
}

const overlaps = (a: TimeWindow, b: TimeWindow) =>
  new Date(a.start).getTime() < new Date(b.end).getTime() &&
  new Date(a.end).getTime() > new Date(b.start).getTime();

const contains = (outer: TimeWindow, inner: TimeWindow) =>
  new Date(outer.start).getTime() <= new Date(inner.start).getTime() &&
  new Date(outer.end).getTime() >= new Date(inner.end).getTime();

const addMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

export function evaluateSlot(input: AvailabilityInput, start: string): EvaluatedSlot {
  const end = addMinutes(start, input.durationMinutes);
  const operational = {
    start: addMinutes(start, -input.bufferBeforeMinutes),
    end: addMinutes(end, input.bufferAfterMinutes)
  };
  const reasons: string[] = [];
  const allocations: Record<string, string[] | number> = {};

  if (!input.businessWindows.some((window) => contains(window, operational))) reasons.push("outside_business_hours");
  if (input.serviceWindows?.length && !input.serviceWindows.some((window) => contains(window, operational))) {
    reasons.push("outside_service_hours");
  }
  if (new Date(start).getTime() < new Date(input.now).getTime() + input.cutoffHours * 3_600_000) {
    reasons.push("cutoff_exceeded");
  }

  const activeOverrides = input.overrides.filter((item) => overlaps(item, operational));
  if (activeOverrides.some((item) => item.type === "center_closed")) reasons.push("center_closed");
  if (activeOverrides.some((item) => item.type === "service_closed" && item.serviceId === input.serviceId)) {
    reasons.push("service_closed");
  }

  const overlappingBookings = input.bookings.filter((booking) => overlaps(booking, operational));
  const serviceCapacityOverride = activeOverrides
    .filter((item) => item.type === "service_capacity" && item.serviceId === input.serviceId)
    .reduce<number | null>((limit, item) => {
      const next = item.capacityLimit ?? input.baseConcurrency;
      return limit === null ? next : Math.min(limit, next);
    }, null);
  const effectiveServiceCapacity = serviceCapacityOverride ?? input.baseConcurrency;
  const serviceUsage = overlappingBookings.filter((booking) => booking.serviceId === input.serviceId).length;
  if (serviceUsage >= effectiveServiceCapacity) reasons.push("service_capacity_full");

  let capacityRemaining = Math.max(0, effectiveServiceCapacity - serviceUsage);

  for (const requirement of input.requirements) {
    if (requirement.mode === "pooled") {
      const used = overlappingBookings.reduce((total, booking) => {
        const value = booking.allocations[requirement.groupId];
        return total + (typeof value === "number" ? value : Array.isArray(value) ? value.length : 0);
      }, 0);
      const blockedUnits = activeOverrides.filter(
        (item) => item.type === "resource_blocked" && item.resourceId?.startsWith(`${requirement.groupId}:pooled:`)
      ).length;
      const remaining = Math.max(0, requirement.capacity - blockedUnits - used);
      allocations[requirement.groupId] = requirement.units;
      capacityRemaining = Math.min(capacityRemaining, Math.floor(remaining / requirement.units));
      if (remaining < requirement.units) reasons.push(`${requirement.groupId}_capacity_full`);
      continue;
    }

    const usedResourceIds = new Set(
      overlappingBookings.flatMap((booking) => {
        const value = booking.allocations[requirement.groupId];
        return Array.isArray(value) ? value : [];
      })
    );
    const availableResources = requirement.resourceIds.filter((resourceId) => {
      const resource = input.resources.find((item) => item.id === resourceId && item.enabled);
      if (!resource || usedResourceIds.has(resourceId)) return false;
      if (resource.busy.some((window) => overlaps(window, operational))) return false;
      return !activeOverrides.some(
        (item) => item.type === "resource_blocked" && item.resourceId === resourceId
      );
    });
    allocations[requirement.groupId] = availableResources.slice(0, requirement.units);
    capacityRemaining = Math.min(capacityRemaining, Math.floor(availableResources.length / requirement.units));
    if (availableResources.length < requirement.units) reasons.push(`${requirement.groupId}_unavailable`);
  }

  return {
    start,
    end,
    available: reasons.length === 0,
    capacityRemaining,
    reasons,
    allocations
  };
}

export function computeAvailability(input: AvailabilityInput): EvaluatedSlot[] {
  const results: EvaluatedSlot[] = [];
  for (const window of input.businessWindows) {
    let cursor = new Date(window.start).getTime();
    const limit = new Date(window.end).getTime();
    while (cursor + input.durationMinutes * 60_000 <= limit) {
      const result = evaluateSlot(input, new Date(cursor).toISOString());
      if (!results.some((item) => item.start === result.start)) results.push(result);
      cursor += input.slotIntervalMinutes * 60_000;
    }
  }
  return results.sort((a, b) => a.start.localeCompare(b.start));
}
