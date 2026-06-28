-- Optional admin-configurable highlight chip on a service card (e.g. "Most popular").
-- Empty/null = no chip shown. Off by default.
ALTER TABLE services ADD COLUMN highlight_en TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN highlight_fr TEXT NOT NULL DEFAULT '';
