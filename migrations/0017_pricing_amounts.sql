-- Numeric prices for revenue analytics. Until now money existed only as the free-text
-- `price_display` string on services/packages and nothing at all on bookings, so there was
-- no sum-able amount. We add:
--   * services.price_cents / packages.price_cents  — the admin-entered numeric price (CAD cents).
--     `price_display` stays as the customer-facing label; these drive analytics only.
--   * bookings.price_cents / bookings.currency      — a SNAPSHOT captured at booking-creation time
--     so historical revenue stays correct even if a service's price later changes. NULL for
--     bookings created before this migration (surfaced in the UI as "missing price"), and for
--     package sessions after the first (the full package amount is attributed to the first session).
-- All amounts are integer cents; currency is CAD-only for now (column added for future-proofing).
ALTER TABLE services ADD COLUMN price_cents INTEGER;
ALTER TABLE packages ADD COLUMN price_cents INTEGER;
ALTER TABLE bookings ADD COLUMN price_cents INTEGER;
ALTER TABLE bookings ADD COLUMN currency TEXT NOT NULL DEFAULT 'CAD';

-- Revenue queries filter by status + group by start_at ranges; index the common access path.
CREATE INDEX IF NOT EXISTS idx_bookings_status_start_at ON bookings(status, start_at);
