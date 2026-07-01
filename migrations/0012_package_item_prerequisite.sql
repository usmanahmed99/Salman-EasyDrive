-- Ordering dependency between package items. When a package item references another service as its
-- prerequisite, every session of that item must be scheduled to start after the prerequisite
-- service's last session ends (e.g. the exam can only follow completed practice lessons). NULL = no
-- ordering constraint. The prerequisite is stored as a service id so it survives service renames.
ALTER TABLE package_items ADD COLUMN prerequisite_service_id TEXT REFERENCES services(id);
