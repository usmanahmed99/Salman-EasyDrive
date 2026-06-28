import { describe, expect, it } from "vitest";
import { validatePackageSessions } from "../worker/package";

const items = [
  { serviceSlug: "driving-lesson", quantity: 3 },
  { serviceSlug: "mock-test", quantity: 1 }
];

describe("validatePackageSessions", () => {
  it("accepts sessions that exactly match the package items", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-15T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-22T13:00:00.000Z" }
    ];
    expect(validatePackageSessions(items, sessions)).toBeNull();
  });

  it("rejects when a service has the wrong number of sessions", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-22T13:00:00.000Z" }
    ];
    expect(validatePackageSessions(items, sessions)).toBe("package_mismatch");
  });

  it("rejects when an unexpected service is included", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-15T13:00:00.000Z" },
      { serviceSlug: "highway-lesson", start: "2026-07-22T13:00:00.000Z" }
    ];
    expect(validatePackageSessions(items, sessions)).toBe("package_mismatch");
  });

  it("rejects when the same service+instant is picked twice", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-15T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-22T13:00:00.000Z" }
    ];
    expect(validatePackageSessions(items, sessions)).toBe("duplicate_slot");
  });

  it("allows two different services at the same instant", () => {
    const sameTime = "2026-07-01T13:00:00.000Z";
    const sessions = [
      { serviceSlug: "driving-lesson", start: sameTime },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-15T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: sameTime }
    ];
    expect(validatePackageSessions(items, sessions)).toBeNull();
  });
});
