-- Add sort_order so admins can drag-and-drop centers into a custom display order.
-- The same order drives the admin list and the public booking center picker.
ALTER TABLE centers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Seed existing rows with a stable order based on the previous alphabetical default.
UPDATE centers SET sort_order = (
  SELECT COUNT(*) FROM centers AS c2
  WHERE c2.deleted_at IS NULL AND (c2.name < centers.name OR (c2.name = centers.name AND c2.id < centers.id))
) WHERE deleted_at IS NULL;
