import { describe, expect, it } from "vitest";
import { evaluateSlot, type AvailabilityInput } from "../shared/availability";

const start = "2026-07-01T13:00:00.000Z";

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    serviceId: "rental",
    date: "2026-07-01",
    timezone: "America/Montreal",
    businessWindows: [{ start: "2026-07-01T12:00:00.000Z", end: "2026-07-01T22:00:00.000Z" }],
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: 30,
    cutoffHours: 0,
    now: "2026-06-30T12:00:00.000Z",
    baseConcurrency: 10,
    bookings: [],
    overrides: [],
    resources: [],
    requirements: [{ groupId: "cars", units: 1, mode: "pooled", capacity: 3, resourceIds: [] }],
    ...overrides
  };
}

describe("resource-centric availability", () => {
  it("allows rental-only bookings up to pooled car capacity without instructors", () => {
    const input = baseInput({
      bookings: [0, 1].map((index) => ({
        id: `b${index}`,
        serviceId: "rental",
        start,
        end: "2026-07-01T14:00:00.000Z",
        allocations: { cars: 1 }
      }))
    });
    const third = evaluateSlot(input, start);
    expect(third.available).toBe(true);
    expect(third.capacityRemaining).toBe(1);

    input.bookings.push({
      id: "b3",
      serviceId: "rental",
      start,
      end: "2026-07-01T14:00:00.000Z",
      allocations: { cars: 1 }
    });
    expect(evaluateSlot(input, start).available).toBe(false);
    expect(evaluateSlot(input, start).reasons).toContain("cars_capacity_full");
  });

  it("limits an instructor-and-car service by both requirements", () => {
    const input = baseInput({
      serviceId: "road",
      requirements: [
        { groupId: "cars", units: 1, mode: "pooled", capacity: 3, resourceIds: [] },
        { groupId: "instructors", units: 1, mode: "named", capacity: 1, resourceIds: ["ali"] }
      ],
      resources: [{ id: "ali", groupId: "instructors", enabled: true, busy: [] }],
      bookings: [{
        id: "lesson",
        serviceId: "lesson",
        start,
        end: "2026-07-01T14:00:00.000Z",
        allocations: { cars: 1, instructors: ["ali"] }
      }]
    });
    const result = evaluateSlot(input, start);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("instructors_unavailable");
  });

  it("applies center and service closure priority", () => {
    const serviceClosed = evaluateSlot(baseInput({
      overrides: [{
        type: "service_closed",
        serviceId: "rental",
        start: "2026-07-01T12:00:00.000Z",
        end: "2026-07-01T18:00:00.000Z"
      }]
    }), start);
    expect(serviceClosed.reasons).toContain("service_closed");

    const centerClosed = evaluateSlot(baseInput({
      overrides: [{
        type: "center_closed",
        start: "2026-07-01T12:00:00.000Z",
        end: "2026-07-01T18:00:00.000Z"
      }]
    }), start);
    expect(centerClosed.reasons).toContain("center_closed");
  });

  it("reduces service concurrency immediately with an override", () => {
    const result = evaluateSlot(baseInput({
      bookings: [{
        id: "b1",
        serviceId: "rental",
        start,
        end: "2026-07-01T14:00:00.000Z",
        allocations: { cars: 1 }
      }],
      overrides: [{
        type: "service_capacity",
        serviceId: "rental",
        capacityLimit: 1,
        start: "2026-07-01T12:00:00.000Z",
        end: "2026-07-01T18:00:00.000Z"
      }]
    }), start);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("service_capacity_full");
  });

  it("respects mocked Google Calendar busy windows for instructors", () => {
    const result = evaluateSlot(baseInput({
      serviceId: "lesson",
      requirements: [{ groupId: "instructors", units: 1, mode: "named", capacity: 1, resourceIds: ["ali"] }],
      resources: [{
        id: "ali",
        groupId: "instructors",
        enabled: true,
        busy: [{ start: "2026-07-01T12:30:00.000Z", end: "2026-07-01T14:30:00.000Z" }]
      }]
    }), start);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("instructors_unavailable");
  });

  it("uses buffers to prevent adjacent resource conflicts", () => {
    const result = evaluateSlot(baseInput({
      bufferAfterMinutes: 15,
      bookings: [{
        id: "b1",
        serviceId: "rental",
        start: "2026-07-01T14:00:00.000Z",
        end: "2026-07-01T15:00:00.000Z",
        allocations: { cars: 3 }
      }]
    }), start);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("cars_capacity_full");
  });

  it("serial confirmation consumes the final unit before the next check", () => {
    const input = baseInput({
      requirements: [{ groupId: "cars", units: 1, mode: "pooled", capacity: 1, resourceIds: [] }]
    });
    const first = evaluateSlot(input, start);
    expect(first.available).toBe(true);
    input.bookings.push({
      id: "confirmed-by-durable-object",
      serviceId: "rental",
      start,
      end: "2026-07-01T14:00:00.000Z",
      allocations: first.allocations
    });
    const second = evaluateSlot(input, start);
    expect(second.available).toBe(false);
  });
});
