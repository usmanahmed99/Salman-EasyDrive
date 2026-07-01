import { describe, expect, it } from "vitest";
import { validatePackageOrdering, validatePackageSessions } from "../worker/package";

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

describe("validatePackageOrdering", () => {
  // The exam ("mock-test") must follow all 60-min practice lessons ("driving-lesson").
  const orderedItems = [
    { serviceSlug: "driving-lesson", durationMinutes: 60 },
    { serviceSlug: "mock-test", durationMinutes: 60, prerequisiteServiceSlug: "driving-lesson" }
  ];

  it("returns null when no item declares a prerequisite", () => {
    const items = [
      { serviceSlug: "driving-lesson", durationMinutes: 60 },
      { serviceSlug: "mock-test", durationMinutes: 60 }
    ];
    const sessions = [
      { serviceSlug: "mock-test", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" }
    ];
    expect(validatePackageOrdering(items, sessions)).toBeNull();
  });

  it("accepts an exam that starts after the last lesson ends", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-08T14:00:00.000Z" } // exactly when the last lesson ends
    ];
    expect(validatePackageOrdering(orderedItems, sessions)).toBeNull();
  });

  it("rejects an exam that starts before the last lesson ends", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-08T13:30:00.000Z" } // overlaps the last lesson
    ];
    expect(validatePackageOrdering(orderedItems, sessions)).toBe("mock-test");
  });

  it("rejects an exam scheduled before an earlier (but not latest) lesson", () => {
    const sessions = [
      { serviceSlug: "driving-lesson", start: "2026-07-15T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "mock-test", start: "2026-07-08T13:00:00.000Z" } // after one lesson, before the latest
    ];
    expect(validatePackageOrdering(orderedItems, sessions)).toBe("mock-test");
  });

  it("rejects when the prerequisite service has no scheduled sessions at all", () => {
    const sessions = [
      { serviceSlug: "mock-test", start: "2026-07-08T13:00:00.000Z" }
    ];
    expect(validatePackageOrdering(orderedItems, sessions)).toBe("mock-test");
  });

  // The anchor direction ("prerequisite" vs "target") is a booking-flow UX choice only; the backend
  // invariant is identical, so validatePackageOrdering ignores it and enforces the same ordering.
  it("enforces the same ordering regardless of anchor direction (target-anchored, valid)", () => {
    const targetItems = [
      { serviceSlug: "driving-lesson", durationMinutes: 60 },
      { serviceSlug: "mock-test", durationMinutes: 60, prerequisiteServiceSlug: "driving-lesson" }
    ];
    // Student picked the exam date first, then fit lessons before it — lessons still end before exam.
    const sessions = [
      { serviceSlug: "mock-test", start: "2026-07-20T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-08T13:00:00.000Z" }
    ];
    expect(validatePackageOrdering(targetItems, sessions)).toBeNull();
  });

  it("enforces the same ordering regardless of anchor direction (target-anchored, violated)", () => {
    const targetItems = [
      { serviceSlug: "driving-lesson", durationMinutes: 60 },
      { serviceSlug: "mock-test", durationMinutes: 60, prerequisiteServiceSlug: "driving-lesson" }
    ];
    // A lesson slips to after the exam — invalid whichever side was scheduled first.
    const sessions = [
      { serviceSlug: "mock-test", start: "2026-07-20T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-01T13:00:00.000Z" },
      { serviceSlug: "driving-lesson", start: "2026-07-21T13:00:00.000Z" }
    ];
    expect(validatePackageOrdering(targetItems, sessions)).toBe("mock-test");
  });
});
