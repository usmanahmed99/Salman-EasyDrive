import { describe, expect, it } from "vitest";
import type { BookingForm } from "../shared/types";
import { validateForm } from "../worker/booking";
import { anonymizeStudentRecord, retentionCutoff } from "../worker/retention";

const form: BookingForm = {
  id: "form_test",
  name: "Test form",
  version: 1,
  fields: [
    {
      id: "name",
      key: "fullName",
      type: "text",
      label: { en: "Full name", fr: "Nom complet" },
      required: true
    },
    {
      id: "email",
      key: "email",
      type: "email",
      label: { en: "Email", fr: "Courriel" },
      required: true
    },
    {
      id: "class",
      key: "licenseClass",
      type: "select",
      label: { en: "Class", fr: "Classe" },
      required: true,
      options: [{ value: "5", label: { en: "Class 5", fr: "Classe 5" } }]
    }
  ]
};

describe("dynamic form validation", () => {
  it("accepts answers matching the active schema", () => {
    expect(() => validateForm(form, {
      fullName: "Amina Example",
      email: "amina@example.com",
      licenseClass: "5"
    })).not.toThrow();
  });

  it("rejects missing, invalid, and stale option values", () => {
    expect(() => validateForm(form, { email: "not-an-email", licenseClass: "7" })).toThrow();
  });
});

describe("retention helpers", () => {
  it("computes a deterministic cleanup cutoff", () => {
    expect(retentionCutoff(new Date("2026-06-19T12:00:00.000Z"), 90)).toBe("2026-03-21T12:00:00.000Z");
  });

  it("removes student PII while preserving anonymous booking dimensions", () => {
    const result = anonymizeStudentRecord({
      reference: "ED-1042",
      service_id: "svc_rental",
      center_id: "ctr_laval",
      response_json: '{"fullName":"Amina"}',
      student_name: "Amina",
      student_email: "amina@example.com",
      student_phone: "5145550101",
      public_token_hash: "secret"
    });
    expect(result.reference).toBe("ED-1042");
    expect(result.service_id).toBe("svc_rental");
    expect(result.student_email).toBeNull();
    expect(result.response_json).toBe("{}");
    expect(result.public_token_hash).toBe("expired");
  });
});
