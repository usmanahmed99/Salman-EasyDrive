# 11 — Bookings list & actions

**Goal:** The admin Bookings screen lists real bookings and supports search, filters (status/center/service/instructor/date), ad-hoc booking, reschedule, cancel, resync, and calendar reconcile.
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

## BKG-05 — Filters: service & instructor — **P1**

1. In the filter row, set **All services** → `1-Hour Driving Lesson`.
2. **Expected:** Only lesson bookings show; the counter reflects the subset.
3. Reset to **All services**. Set **All instructors** → a named instructor that appears on a lesson booking.
4. **Expected:** Only that instructor's bookings show. The **Instructor** column shows their name; rows with no named instructor (e.g. Car Rental) show `—` and are filtered out.
5. Click **Clear**. **Expected:** All filters reset and every booking returns.

## BKG-06 — Reschedule a booking — **P0**

1. On **Marie**'s lesson, click the **reschedule** (calendar) icon.
2. **Expected:** Modal opens with the availability picker for that center/service; the current day's slots load (white = available, amber = override-only, greyed = resource conflict).
3. Pick a different white slot and click **Reschedule**.
4. **Expected:** Toast/refresh; the booking keeps the **same reference** but shows the new time.
5. **Verify** the slot moved and the calendar event followed:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference,start_at,status FROM bookings WHERE reference='<Marie reference>';"
   ```

6. **Conflict guard:** open the picker again and confirm a time where the required instructor is already booked appears **greyed/disabled** (cannot be selected).

## BKG-07 — Ad-hoc admin booking with cutoff override — **P1**

1. Click **New booking**.
2. Select Laval + a service, enter a student name, and in the availability picker pick an **amber** slot (blocked only by cutoff/hours).
3. Click **Create booking**.
4. **Expected:** Booking is created despite the cutoff (admin override). It appears in the list as confirmed.
5. **Negative:** try to create a booking on a slot where the named instructor is already taken (greyed). **Expected:** it is not selectable; if forced via exact time, the request is refused with "selected resource is already booked".

## BKG-08 — Reconcile calendar — **P1**

1. Note a confirmed future booking with a canonical Google event, then delete that event **directly in Google Calendar**.
2. Click **Reconcile calendar** (Bookings screen or dashboard).
3. **Expected:** Toast reports the run; the booking flips to **Cancelled** with a *"Calendar deleted externally"* note, and the slot is freed on `/book`.
4. **No-op case:** click again with nothing deleted. **Expected:** success toast, no bookings changed.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_resource_allocations; DELETE FROM booking_form_responses; DELETE FROM bookings;"
```

## Pass criteria

BKG-01, 02, 03, 06 (P0) pass. BKG-05, 07, 08 (P1) pass. BKG-04 (P2) passes.
