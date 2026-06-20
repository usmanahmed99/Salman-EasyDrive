# 11 — Bookings list & actions

**Goal:** The admin Bookings screen lists real bookings and supports search, cancel, and resync.
**Surface:** `/admin` → Bookings.
**Pre:** Signed in.

---

## Setup — create a few bookings

Via `/book`, create three Laval bookings (different times on `<NEXT-TUE>`):

- Car Rental, 10:00, **Alex** (`easydrivingca+alex@gmail.com`)
- 1-Hour Driving Lesson, 13:00, **Marie** (`easydrivingca+marie@gmail.com`)
- Car Rental, 15:00, **Sam** (`easydrivingca+sam@gmail.com`)

Force one into a failed state for the retry test:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE bookings SET status='calendar_sync_failed', calendar_sync_status='failed', calendar_last_error='no canonical mapping' WHERE id=(SELECT id FROM bookings ORDER BY created_at DESC LIMIT 1);"
```

---

## BKG-01 — List & search — **P0**

1. Open **Bookings**.
2. **Expected:** All three bookings appear with time, student, service, center, reference, status.
3. In the search box, type `Marie`.
4. **Expected:** Only Marie's row shows. Counter reads "1 of 3".
5. Clear the search, type the reference of Sam's booking (e.g. `ED-…`).
6. **Expected:** Only that row shows.

## BKG-02 — Cancel a booking — **P0**

1. On **Alex**'s confirmed booking, click the **X** (cancel) icon, confirm the dialog.
2. **Expected:** Toast "Booking cancelled"; the row's status becomes **Cancelled**.
3. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference,status,cancelled_at FROM bookings WHERE status='cancelled_by_admin';"
   ```

4. **Capacity freed:** open `/book` → Laval → Car Rental → `<NEXT-TUE>` 10:00 — the slot is
   available again (the cancelled booking no longer consumes a car).

## BKG-03 — Retry calendar sync — **P0**

1. Find the **Sync issue** row (the one forced to `calendar_sync_failed`). Click the **retry**
   (circular arrows) icon.
2. **Expected (no mapping):** A readable error toast (no crash).
3. **Expected (mapping + Google connected):** Toast success; status updates to confirmed. Verify:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference,status FROM bookings WHERE reference='<that reference>';"
   ```

## BKG-04 — Empty search state

1. Search for `zzzzz`.
2. **Expected:** "No bookings found" empty row.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_resource_allocations; DELETE FROM booking_form_responses; DELETE FROM bookings;"
```

## Pass criteria

BKG-01, 02, 03 (P0) pass. BKG-04 (P2) passes.
