-- Configurable Google Calendar event title/description template (singleton row).
-- When a template is empty/NULL, the worker falls back to the built-in default format.
-- Placeholders supported by the renderer: {service} {center} {reference} {student}
-- {manageUrl} {visibleFields}
CREATE TABLE calendar_event_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  title_template TEXT,
  description_template TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO calendar_event_settings(id, title_template, description_template) VALUES ('default', NULL, NULL);
