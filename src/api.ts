import { demoCenters, demoForms, demoServices } from "./demoData";
import type {
  AdminResource,
  BookingConfirmation,
  BookingForm,
  CalendarEventTemplate,
  CalendarMapping,
  Center,
  CenterHour,
  ManagedBooking,
  PublicConfig,
  ResourceGroup,
  RetentionJob,
  RetentionSettings,
  Service,
  Slot
} from "../shared/types";

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers || {}) },
    credentials: "include"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(body.error || "Request failed");
  }
  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    return await request("/api/public/config");
  } catch {
    return {
      brand: { name: "Easy Driving School", primaryColor: "#F03C02", supportPhone: "+1 (514) 463-1043" },
      retentionDays: 90,
      languages: ["en", "fr"]
    };
  }
}

export async function getCenters(): Promise<Center[]> {
  try {
    return await request("/api/public/centers");
  } catch {
    return demoCenters;
  }
}

export async function getServices(centerSlug: string): Promise<Service[]> {
  try {
    return await request(`/api/public/services?centerSlug=${encodeURIComponent(centerSlug)}`);
  } catch {
    return demoServices;
  }
}

export async function getForm(formId: string): Promise<BookingForm> {
  try {
    return await request(`/api/public/forms/${encodeURIComponent(formId)}`);
  } catch {
    return demoForms[formId] || demoForms.form_lesson;
  }
}

export async function getAvailability(centerSlug: string, serviceSlug: string, date: string): Promise<Slot[]> {
  try {
    const result = await request<{ slots: Slot[] }>("/api/public/availability", {
      method: "POST",
      body: JSON.stringify({ centerSlug, serviceSlug, dateFrom: date, timezone: "America/Montreal" })
    });
    return result.slots;
  } catch {
    const day = new Date(`${date}T00:00:00`);
    const weekday = day.getDay();
    if (weekday === 0) return [];
    const starts = weekday === 6 ? [9, 10, 11, 13] : [8, 9, 10, 11, 13, 14, 15, 16];
    return starts
      .filter((_, index) => (day.getDate() + index) % 4 !== 0)
      .map((hour) => {
        const start = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00-04:00`);
        const end = new Date(start.getTime() + 60 * 60_000);
        return { start: start.toISOString(), end: end.toISOString() };
      });
  }
}

export async function createBooking(payload: Record<string, unknown>): Promise<BookingConfirmation> {
  try {
    return await request("/api/public/bookings", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {
    if (error instanceof TypeError) {
      const service = demoServices.find((item) => item.slug === payload.serviceSlug);
      const center = demoCenters.find((item) => item.slug === payload.centerSlug);
      return {
        id: crypto.randomUUID(),
        reference: `ED-${Math.floor(1000 + Math.random() * 9000)}`,
        status: "confirmed",
        start: String(payload.start),
        end: new Date(new Date(String(payload.start)).getTime() + (service?.durationMinutes || 60) * 60_000).toISOString(),
        centerName: center?.name || "",
        serviceName: service?.name.en || "",
        calendarSyncStatus: "pending",
        manageToken: "demo"
      };
    }
    throw error;
  }
}

export function getManagedBooking(reference: string, token: string): Promise<ManagedBooking> {
  return request(`/api/public/bookings/${encodeURIComponent(reference)}/public?token=${encodeURIComponent(token)}`);
}

export function cancelManagedBooking(reference: string, token: string): Promise<{ reference: string; status: string }> {
  return request(`/api/public/bookings/${encodeURIComponent(reference)}/cancel?token=${encodeURIComponent(token)}`, {
    method: "POST"
  });
}

export interface AdminUser {
  id?: string;
  name: string;
  email: string;
  role: string;
}

export const adminApi = {
  // Auth
  authConfig: () => request<{ google: boolean; devLogin: boolean }>("/api/auth/config"),
  devLogin: () => request<{ user: AdminUser }>("/api/auth/dev-login", { method: "POST" }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  me: () => request<{ user: AdminUser }>("/api/admin/me"),
  bookings: () => request<{ bookings: Array<Record<string, string>> }>("/api/admin/bookings"),

  // Overrides
  overrides: () => request<{ overrides: Array<Record<string, string>> }>("/api/admin/overrides"),
  createOverride: (payload: Record<string, unknown>) =>
    request("/api/admin/overrides", { method: "POST", body: JSON.stringify(payload) }),
  deleteOverride: (id: string) => request(`/api/admin/overrides/${id}`, { method: "DELETE" }),

  // Centers
  centers: () => request<{ centers: Center[] }>("/api/admin/centers"),
  createCenter: (payload: Record<string, unknown>) =>
    request("/api/admin/centers", { method: "POST", body: JSON.stringify(payload) }),
  updateCenter: (id: string, payload: Record<string, unknown>) =>
    request(`/api/admin/centers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCenter: (id: string) => request(`/api/admin/centers/${id}`, { method: "DELETE" }),
  createCenterCalendar: (id: string) =>
    request<{ id: string; calendarId: string; previousCalendarId: string | null }>(
      `/api/admin/centers/${id}/calendar`, { method: "POST" }),
  deleteCenterCalendar: (id: string, mode: "unlink" | "google") =>
    request(`/api/admin/centers/${id}/calendar?mode=${mode}`, { method: "DELETE" }),
  reorderCenters: (orderedIds: string[]) =>
    request("/api/admin/centers/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),

  // Services
  services: () => request<{ services: Service[] }>("/api/admin/services"),
  createService: (payload: Record<string, unknown>) =>
    request("/api/admin/services", { method: "POST", body: JSON.stringify(payload) }),
  updateService: (id: string, payload: Record<string, unknown>) =>
    request(`/api/admin/services/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteService: (id: string) => request(`/api/admin/services/${id}`, { method: "DELETE" }),
  reorderServices: (orderedIds: string[]) =>
    request("/api/admin/services/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) }),
  serviceRequirements: (serviceId: string) =>
    request<{ requirements: Array<{ resource_type: string; units: number }> }>(`/api/admin/service-requirements?serviceId=${encodeURIComponent(serviceId)}`),
  saveServiceRequirements: (serviceId: string, requirements: Array<{ resource_type: string; units: number }>) =>
    request("/api/admin/service-requirements", { method: "PUT", body: JSON.stringify({ serviceId, requirements }) }),
  serviceCenters: (serviceId: string) =>
    request<{ centerIds: string[] }>(`/api/admin/service-centers?serviceId=${encodeURIComponent(serviceId)}`),
  saveServiceCenters: (serviceId: string, centerIds: string[]) =>
    request("/api/admin/service-centers", { method: "PUT", body: JSON.stringify({ serviceId, centerIds }) }),

  // Resources & groups
  resources: () => request<{ resources: AdminResource[] }>("/api/admin/resources"),
  createResource: (payload: Record<string, unknown>) =>
    request("/api/admin/resources", { method: "POST", body: JSON.stringify(payload) }),
  updateResource: (id: string, payload: Record<string, unknown>) =>
    request(`/api/admin/resources/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteResource: (id: string) => request(`/api/admin/resources/${id}`, { method: "DELETE" }),
  createResourceCalendar: (id: string) =>
    request<{ id: string; calendarId: string; previousCalendarId: string | null }>(
      `/api/admin/resources/${id}/calendar`, { method: "POST" }),
  deleteResourceCalendar: (id: string, mode: "unlink" | "google") =>
    request(`/api/admin/resources/${id}/calendar?mode=${mode}`, { method: "DELETE" }),
  resourceGroups: () => request<{ groups: ResourceGroup[] }>("/api/admin/resource-groups"),
  updateResourceGroup: (id: string, payload: { capacity?: number; enabled?: boolean }) =>
    request(`/api/admin/resource-groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  // Forms
  forms: () => request<{ forms: Array<{ id: string; name: string; active_version: number }> }>("/api/admin/forms"),
  form: (id: string) => request<{ id: string; name: string; version: number; schema: BookingForm }>(`/api/admin/forms/${encodeURIComponent(id)}`),
  createForm: (payload: { name: string; schema: BookingForm }) =>
    request<{ id: string; version: number }>("/api/admin/forms", { method: "POST", body: JSON.stringify(payload) }),
  publishForm: (id: string, payload: { name: string; schema: BookingForm }) =>
    request<{ id: string; version: number }>(`/api/admin/forms/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  // Availability (center hours)
  centerHours: (centerId: string) =>
    request<{ hours: CenterHour[] }>(`/api/admin/center-hours?centerId=${encodeURIComponent(centerId)}`),
  saveCenterHours: (centerId: string, hours: Array<{ dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }>) =>
    request("/api/admin/center-hours", { method: "PUT", body: JSON.stringify({ centerId, hours }) }),

  // Calendar
  calendarConnections: () => request<{ connections: Array<Record<string, string>> }>("/api/admin/calendar/connections"),
  calendarList: () => request<{ calendars: Array<{ id: string; summary: string }> }>("/api/admin/calendar/list"),
  calendarMappings: () => request<{ mappings: CalendarMapping[] }>("/api/admin/calendar/mappings"),
  createMapping: (payload: Record<string, unknown>) =>
    request("/api/admin/calendar/mappings", { method: "POST", body: JSON.stringify(payload) }),
  deleteMapping: (id: string) => request(`/api/admin/calendar/mappings/${id}`, { method: "DELETE" }),
  calendarTemplate: () => request<{ template: CalendarEventTemplate }>("/api/admin/calendar/template"),
  saveCalendarTemplate: (payload: { titleTemplate: string | null; descriptionTemplate: string | null; descriptionTemplateFr: string | null }) =>
    request<{ template: CalendarEventTemplate }>("/api/admin/calendar/template", { method: "PATCH", body: JSON.stringify(payload) }),

  // Retention
  retention: () => request<{ settings: RetentionSettings | null; lastJob: RetentionJob | null }>("/api/admin/retention"),
  saveRetention: (retentionDays: number) =>
    request("/api/admin/retention", { method: "PATCH", body: JSON.stringify({ retentionDays }) }),

  // Bookings actions
  createAdminBooking: (payload: {
    centerSlug: string; serviceSlug: string; start: string; language?: "en" | "fr";
    studentName: string; studentEmail?: string; studentPhone?: string;
  }) => request<{ id: string; reference: string; status: string; start: string; end: string; calendarSyncStatus: string }>(
    "/api/admin/bookings", { method: "POST", body: JSON.stringify(payload) }),
  rescheduleBooking: (id: string, start: string) =>
    request<{ id: string; reference: string; status: string; start: string; calendarSyncStatus: string }>(
      `/api/admin/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ start }) }),
  availabilityDebug: (centerSlug: string, serviceSlug: string, date: string) =>
    request<{ slots: Array<{ start: string; end: string; available: boolean; capacityRemaining: number; reasons: string[] }> }>(
      "/api/admin/debug/availability", { method: "POST", body: JSON.stringify({ centerSlug, serviceSlug, dateFrom: date }) }),
  resyncBooking: (id: string) => request(`/api/admin/bookings/${id}/resync-calendar`, { method: "POST" }),
  cancelBooking: (id: string) => request(`/api/admin/bookings/${id}/cancel`, { method: "POST" }),
  reconcileBookings: () => request<{ checked: number; cleaned: number; skipped: number }>("/api/admin/bookings/reconcile", { method: "POST" })
};
