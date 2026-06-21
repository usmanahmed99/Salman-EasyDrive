export interface Env {
  DB: D1Database;
  BOOKING_LOCK: DurableObjectNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  APP_BASE_URL: string;
  PUBLIC_SITE_ORIGIN: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  DEFAULT_TIMEZONE?: string;
  ADMIN_EMAILS?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

export interface DbCenter {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  timezone: string;
  enabled: number;
}

export interface DbService {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  slot_interval_minutes: number;
  price_display: string | null;
  enabled: number;
  request_only: number;
  cutoff_hours: number;
  cancellation_cutoff_hours: number | null;
  form_id: string;
  base_concurrency: number;
  show_duration: number;
}
