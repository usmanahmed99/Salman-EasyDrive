-- Tracks how many times the background cron has retried a failed calendar sync, so a
-- genuinely-broken booking (e.g. no canonical mapping) stops retrying after a cap instead
-- of hammering Google forever. Reset to 0 whenever a sync succeeds. Transient quota errors
-- ("Calendar usage limits exceeded.") clear well within the cap as Google's window resets.
ALTER TABLE bookings ADD COLUMN calendar_sync_attempts INTEGER NOT NULL DEFAULT 0;
