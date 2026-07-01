-- Anchor direction for a package item's prerequisite ordering. Only meaningful when
-- prerequisite_service_id is set. Both modes enforce the same invariant (dependent starts after
-- prerequisite ends) but drive a different booking-flow UX:
--   'prerequisite' (default) — schedule the prerequisites first, then the dependent unlocks.
--   'target'                 — schedule this session (e.g. the exam) first as the anchor, then the
--                              prerequisites are constrained to finish before it.
ALTER TABLE package_items ADD COLUMN prerequisite_anchor TEXT NOT NULL DEFAULT 'prerequisite';
