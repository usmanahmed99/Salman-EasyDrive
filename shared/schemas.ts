import { z } from "zod";

export const availabilityRequestSchema = z.object({
  centerSlug: z.string().min(1).max(80),
  serviceSlug: z.string().min(1).max(80),
  dateFrom: z.string().date(),
  dateTo: z.string().date().optional(),
  timezone: z.string().default("America/Montreal"),
  debug: z.boolean().optional()
});

export const bookingRequestSchema = z.object({
  centerSlug: z.string().min(1).max(80),
  serviceSlug: z.string().min(1).max(80),
  start: z.string().datetime({ offset: true }),
  language: z.enum(["en", "fr"]).default("en"),
  formVersion: z.number().int().positive(),
  answers: z.record(z.unknown()),
  turnstileToken: z.string().optional()
});

export const packageBookingRequestSchema = z.object({
  centerSlug: z.string().min(1).max(80),
  packageSlug: z.string().min(1).max(80),
  language: z.enum(["en", "fr"]).default("en"),
  formVersion: z.number().int().positive(),
  answers: z.record(z.unknown()),
  sessions: z.array(z.object({
    serviceSlug: z.string().min(1).max(80),
    start: z.string().datetime({ offset: true })
  })).min(1).max(50),
  turnstileToken: z.string().optional()
});

export const adminBookingSchema = z.object({
  centerSlug: z.string().min(1).max(80),
  serviceSlug: z.string().min(1).max(80),
  start: z.string().datetime({ offset: true }),
  language: z.enum(["en", "fr"]).default("en"),
  studentName: z.string().min(1).max(120),
  studentEmail: z.string().email().max(160).optional().or(z.literal("")),
  studentPhone: z.string().max(40).optional()
});

export const adminRescheduleSchema = z.object({
  start: z.string().datetime({ offset: true })
});

export const overrideRequestSchema = z.object({
  centerId: z.string().min(1),
  serviceId: z.string().nullable().optional(),
  resourceId: z.string().nullable().optional(),
  type: z.enum(["center_closed", "service_closed", "resource_blocked", "service_capacity"]),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  capacityLimit: z.number().int().min(0).nullable().optional(),
  reason: z.string().max(240).optional()
});

export const centerMutationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  address: z.string().max(240).optional(),
  timezone: z.string().default("America/Montreal"),
  enabled: z.boolean().default(true)
});

export const resourceMutationSchema = z.object({
  centerId: z.string(),
  groupId: z.string(),
  type: z.enum(["instructor", "vehicle", "generic"]),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  calendarId: z.string().optional(),
  enabled: z.boolean().default(true),
  publicVisible: z.boolean().default(false)
});
