PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user_expiry ON sessions(user_id, expires_at);

CREATE TABLE google_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  google_email TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE centers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Montreal',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE center_hours (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(center_id, day_of_week, start_time, end_time)
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_fr TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
  price_display TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  request_only INTEGER NOT NULL DEFAULT 0,
  cutoff_hours INTEGER NOT NULL DEFAULT 0,
  cancellation_cutoff_hours INTEGER,
  form_id TEXT,
  base_concurrency INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE service_centers (
  service_id TEXT NOT NULL REFERENCES services(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(service_id, center_id)
);

CREATE TABLE service_hours (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE form_versions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id),
  version INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(form_id, version)
);

CREATE TABLE form_fields (
  id TEXT PRIMARY KEY,
  form_version_id TEXT NOT NULL REFERENCES form_versions(id),
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  label_en TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  placeholder_en TEXT,
  placeholder_fr TEXT,
  help_text_en TEXT,
  help_text_fr TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  options_json TEXT,
  validation_json TEXT,
  visibility_json TEXT,
  calendar_visible INTEGER NOT NULL DEFAULT 0,
  admin_list_visible INTEGER NOT NULL DEFAULT 0,
  retention_category TEXT NOT NULL DEFAULT 'operational'
);

CREATE TABLE resource_groups (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id),
  type TEXT NOT NULL CHECK (type IN ('cars', 'instructors', 'seats', 'generic')),
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('pooled', 'named')),
  capacity INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES resource_groups(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  type TEXT NOT NULL CHECK (type IN ('instructor', 'vehicle', 'generic')),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  calendar_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  public_visible INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX idx_resources_center_type ON resources(center_id, type, enabled);

CREATE TABLE resource_group_members (
  group_id TEXT NOT NULL REFERENCES resource_groups(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  PRIMARY KEY(group_id, resource_id)
);

CREATE TABLE service_resource_requirements (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('cars', 'instructors', 'seats', 'generic')),
  units INTEGER NOT NULL DEFAULT 1,
  UNIQUE(service_id, resource_type)
);

CREATE TABLE capacity_overrides (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id),
  service_id TEXT REFERENCES services(id),
  resource_id TEXT REFERENCES resources(id),
  type TEXT NOT NULL CHECK (type IN ('center_closed', 'service_closed', 'resource_blocked', 'service_capacity')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  capacity_limit INTEGER,
  reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX idx_overrides_scope_time ON capacity_overrides(center_id, service_id, start_at, end_at, deleted_at);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  center_id TEXT NOT NULL REFERENCES centers(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  operational_start_at TEXT NOT NULL,
  operational_end_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL CHECK (status IN (
    'pending_confirmation', 'confirmed', 'cancelled_by_student', 'cancelled_by_admin',
    'rescheduled', 'completed', 'no_show', 'calendar_sync_failed'
  )),
  form_version INTEGER NOT NULL,
  form_schema_snapshot TEXT NOT NULL,
  public_token_hash TEXT NOT NULL,
  calendar_sync_status TEXT NOT NULL DEFAULT 'pending',
  calendar_last_error TEXT,
  pii_anonymized_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT
);
CREATE INDEX idx_bookings_center_date_status ON bookings(center_id, start_at, status);
CREATE INDEX idx_bookings_service_date_status ON bookings(service_id, start_at, status);

CREATE TABLE booking_form_responses (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  response_json TEXT NOT NULL,
  student_name TEXT,
  student_email TEXT,
  student_phone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  anonymized_at TEXT
);

CREATE TABLE booking_resource_allocations (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  resource_group_id TEXT NOT NULL REFERENCES resource_groups(id),
  resource_id TEXT REFERENCES resources(id),
  units INTEGER NOT NULL DEFAULT 1,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL
);
CREATE INDEX idx_allocations_group_time ON booking_resource_allocations(resource_group_id, start_at, end_at);
CREATE INDEX idx_allocations_resource_time ON booking_resource_allocations(resource_id, start_at, end_at);

CREATE TABLE calendar_mappings (
  id TEXT PRIMARY KEY,
  center_id TEXT REFERENCES centers(id),
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('center', 'service', 'resource', 'resource_group')),
  mapping_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  event_role TEXT NOT NULL DEFAULT 'canonical',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_calendar_mappings_lookup ON calendar_mappings(mapping_type, mapping_id, enabled);

CREATE TABLE booking_calendar_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  calendar_id TEXT NOT NULL,
  google_event_id TEXT,
  event_role TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retention_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  retention_days INTEGER NOT NULL DEFAULT 90,
  token_expiry_days INTEGER NOT NULL DEFAULT 120,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retention_jobs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  records_anonymized INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_error TEXT
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1
);

INSERT INTO retention_settings(id, retention_days, token_expiry_days) VALUES ('default', 90, 120);
