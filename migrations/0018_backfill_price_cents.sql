-- Backfill price_cents onto bookings created BEFORE migration 0017 (which added the column).
-- Those rows have price_cents = NULL and are therefore excluded from revenue analytics. New
-- bookings snapshot their price at creation; this is a one-time catch-up for historical rows.
--
-- The snapshot rules mirror the creation-time logic in worker/booking.ts + worker/package.ts:
--   * Standalone booking (no package)      -> its service's current price_cents.
--   * Package session that is the EARLIEST  -> the package's current price_cents (whole bundle
--       price attributed to one session), matching confirmPackageBooking.
--   * Any later package session             -> stays NULL (not double-counted).
--
-- Only NULL rows are touched, so re-running is a no-op and admin-entered prices are never clobbered.
-- Bookings whose service/package has no numeric price yet remain NULL (still shown as "missing price").

-- 1) Standalone bookings <- service price.
UPDATE bookings
SET price_cents = (SELECT services.price_cents FROM services WHERE services.id = bookings.service_id)
WHERE bookings.price_cents IS NULL
  AND bookings.package_booking_id IS NULL
  AND (SELECT services.price_cents FROM services WHERE services.id = bookings.service_id) IS NOT NULL;

-- 2) Earliest session of each package <- package price. "Earliest" = min start_at, ties broken by id,
--    computed the same way the app orders package sessions.
UPDATE bookings
SET price_cents = (
  SELECT packages.price_cents
  FROM package_bookings
  JOIN packages ON packages.id = package_bookings.package_id
  WHERE package_bookings.id = bookings.package_booking_id
)
WHERE bookings.price_cents IS NULL
  AND bookings.package_booking_id IS NOT NULL
  AND bookings.id = (
    SELECT sib.id FROM bookings sib
    WHERE sib.package_booking_id = bookings.package_booking_id
    ORDER BY sib.start_at ASC, sib.id ASC
    LIMIT 1
  )
  AND (
    SELECT packages.price_cents
    FROM package_bookings
    JOIN packages ON packages.id = package_bookings.package_id
    WHERE package_bookings.id = bookings.package_booking_id
  ) IS NOT NULL;
