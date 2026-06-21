export type Language = "en" | "fr";

export interface LocalizedText {
  en: string;
  fr: string;
}

export interface Center {
  id: string;
  slug: string;
  name: string;
  address?: string;
  timezone: string;
  enabled: boolean;
}

export interface Service {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotIntervalMinutes: number;
  priceDisplay?: string;
  enabled: boolean;
  requestOnly?: boolean;
  formId?: string;
  cutoffHours: number;
  cancellationCutoffHours?: number;
  showDuration: boolean;
}

export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "time"
  | "datetime"
  | "number"
  | "hidden"
  | "consent";

export interface FormField {
  id: string;
  key: string;
  type: FormFieldType;
  label: LocalizedText;
  placeholder?: LocalizedText;
  helpText?: LocalizedText;
  required: boolean;
  options?: Array<{ value: string; label: LocalizedText }>;
  validation?: { min?: number; max?: number; pattern?: string };
  calendarVisible?: boolean;
  adminListVisible?: boolean;
  retentionCategory?: "contact" | "operational" | "consent";
}

export interface BookingForm {
  id: string;
  name: string;
  version: number;
  fields: FormField[];
}

export interface Slot {
  start: string;
  end: string;
  label?: string;
  capacityRemaining?: number;
}

export interface BookingConfirmation {
  id: string;
  reference: string;
  status: string;
  start: string;
  end: string;
  centerName: string;
  serviceName: string;
  manageToken?: string;
  calendarSyncStatus: "pending" | "synced" | "failed";
}

export interface AdminResource {
  id: string;
  group_id: string;
  center_id: string;
  type: "instructor" | "vehicle" | "generic";
  name: string;
  email: string | null;
  phone: string | null;
  calendar_id: string | null;
  enabled: number;
  public_visible: number;
}

export interface ResourceGroup {
  id: string;
  center_id: string;
  center_name: string;
  type: "cars" | "instructors" | "seats" | "generic";
  name: string;
  mode: "pooled" | "named";
  capacity: number;
  enabled: number;
  member_count: number;
}

export interface CalendarMapping {
  id: string;
  center_id: string | null;
  center_name: string | null;
  service_name: string | null;
  mapping_type: "center" | "service" | "resource" | "resource_group";
  mapping_id: string;
  calendar_id: string;
  event_role: string;
  enabled: number;
}

export interface CalendarEventTemplate {
  title_template: string | null;
  description_template: string | null;
  updated_at?: string;
}

export interface ManagedBooking {
  id: string;
  reference: string;
  start_at: string;
  end_at: string;
  status: string;
  center_name: string;
  name_en: string;
  name_fr: string;
}

export interface CenterHour {
  id?: string;
  center_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  enabled: number;
}

export interface RetentionSettings {
  retention_days: number;
  token_expiry_days: number;
  updated_at?: string;
}

export interface RetentionJob {
  status: string;
  records_anonymized: number;
  completed_at: string | null;
}

export interface PublicConfig {
  brand: {
    name: string;
    primaryColor: string;
    supportPhone?: string;
  };
  turnstileSiteKey?: string;
  retentionDays: number;
  languages: Language[];
}
