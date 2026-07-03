-- Records why a staff notification EMAIL failed for a booking, if it did. The email is strictly
-- best-effort (a failure never blocks or fails the calendar sync), but a silent failure hides
-- real misconfiguration — e.g. an unverified Brevo sender rejecting every send. Persisting the
-- reason here makes that visible to admins without needing to tail Worker logs. NULL means the
-- last notification attempt succeeded or none was attempted (no notification address configured).
ALTER TABLE bookings ADD COLUMN notify_last_error TEXT;
