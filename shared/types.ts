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
  priceTaxMode: "none" | "incl" | "plus";
  enabled: boolean;
  requestOnly?: boolean;
  formId?: string;
  cutoffHours: number;
  cancellationCutoffHours?: number;
  showDuration: boolean;
  sortOrder: number;
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
  /** For select/radio: the option value preselected when the form loads. */
  defaultValue?: string;
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

/** Field types whose rendering requires a non-empty `options` list. */
export const OPTION_FIELD_TYPES: FormFieldType[] = ["select", "radio"];

export function fieldNeedsOptions(type: FormFieldType): boolean {
  return OPTION_FIELD_TYPES.includes(type);
}

/**
 * Validates a booking form schema. Returns a list of human-readable problems;
 * an empty list means the schema is valid. Shared by the admin client (to block
 * publishing) and the worker (to reject bad payloads).
 */
export function validateBookingForm(schema: Pick<BookingForm, "fields">): string[] {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  schema.fields.forEach((field, index) => {
    const name = field.label?.en?.trim() || field.key || `Field ${index + 1}`;
    if (!field.key?.trim()) errors.push(`${name}: key is required.`);
    else if (seenKeys.has(field.key)) errors.push(`Duplicate key "${field.key}".`);
    else seenKeys.add(field.key);

    if (fieldNeedsOptions(field.type)) {
      const options = field.options ?? [];
      if (options.length === 0) {
        errors.push(`${name}: ${field.type} field needs at least one option.`);
      } else {
        const seenValues = new Set<string>();
        options.forEach((option, optIndex) => {
          if (!option.value?.trim()) errors.push(`${name}: option ${optIndex + 1} is missing a value.`);
          else if (seenValues.has(option.value)) errors.push(`${name}: duplicate option value "${option.value}".`);
          else seenValues.add(option.value);
          if (!option.label?.en?.trim() && !option.label?.fr?.trim()) errors.push(`${name}: option ${optIndex + 1} is missing a label.`);
        });
        if (field.defaultValue && !options.some((option) => option.value === field.defaultValue)) {
          errors.push(`${name}: default value "${field.defaultValue}" does not match any option.`);
        }
      }
    }
  });
  return errors;
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
  description_template_fr: string | null;
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
