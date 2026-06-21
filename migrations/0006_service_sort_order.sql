-- Add sort_order so admins can drag-and-drop services into a custom display order.
-- The same order drives the admin list and the public booking service picker.
ALTER TABLE services ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Seed existing rows with a stable order based on the previous alphabetical default.
UPDATE services SET sort_order = (
  SELECT COUNT(*) FROM services AS s2
  WHERE s2.deleted_at IS NULL AND (s2.name_en < services.name_en OR (s2.name_en = services.name_en AND s2.id < services.id))
) WHERE deleted_at IS NULL;
