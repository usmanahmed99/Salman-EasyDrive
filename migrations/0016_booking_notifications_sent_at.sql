-- Marks when the per-booking notification emails (student confirmation + staff notification) were
-- sent, so they go out exactly once even though a booking's calendar sync may be retried many times
-- by the cron. NULL means notifications have not been sent yet. Set on the first sync attempt that
-- reaches the email step — regardless of whether calendar-event creation ultimately succeeds, since
-- the booking itself is valid and the student/staff should be notified either way.
ALTER TABLE bookings ADD COLUMN notifications_sent_at TEXT;
