# 04 — Dashboard & Emergency Control

**Goal:** The Today dashboard reflects live data, and Emergency Control persists/removes overrides.
**Surface:** `/admin` → Today.
**Pre:** Signed in (see [03-admin-auth.md](03-admin-auth.md)).

---

## Setup

Seed two bookings so the dashboard has content — one healthy, one with a sync failure:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM bookings; DELETE FROM booking_form_responses; DELETE FROM capacity_overrides;"
```

Then create one booking via `/book` (Laval → Car Rental → `<NEXT-TUE>` 10:00, as Alex).
Force a sync-failed example:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE bookings SET status='calendar_sync_failed', calendar_sync_status='failed', calendar_last_error='no canonical mapping' WHERE rowid=(SELECT rowid FROM bookings LIMIT 1);"
```

---

## DASH-01 — Live stat cards — **P0**

1. Open Today.
2. **Expected:** Four cards show **live** values:
   - Bookings today (count of today's bookings)
   - Car capacity = **7** (3 + 2 + 2 seeded), "3 pools"
   - Instructors active = **4**, "4 total"
   - Calendar issues = count of `calendar_sync_failed` (≥ 1 after setup)

## DASH-02 — Recent bookings list — **P0**

1. Look at "Recent bookings".
2. **Expected:** The real booking(s) appear with correct service/center; the sync-failed one
   shows a **"Sync issue"** badge.

## DASH-03 — Center status

1. Check the "Center status" panel.
2. **Expected:** All 3 seeded centers listed as **Open**, with today's booking count each.

## DASH-04 — Retry calendar sync — **P0**

1. In the amber "Calendar sync needs attention" box, click **Retry <reference>**.
2. **Expected (no mapping):** A clean error toast like "No canonical Google Calendar is mapped…"
   — the app does not crash.
3. **Expected (with mapping + Google connected):** Success toast; the booking's status returns to
   `confirmed`. Verify:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference, status FROM bookings;"
   ```

---

## Emergency Control

### EMG-01 — Create a capacity-limit override — **P0**

1. Expand **Emergency Control**.
2. Choose **Limit service capacity**, Where **Laval**, Which service **Car Rental Only**,
   When **Rest of today**, Maximum concurrent bookings **1**, Reason `One car in for service`.
3. Click **Apply immediately**.
4. **Expected:** It appears under **Active controls** ("Laval · Car Rental Only · … Limit: 1").
5. **Verify in D1:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT type, capacity_limit, reason FROM capacity_overrides WHERE deleted_at IS NULL;"
   ```

### EMG-02 — Override affects availability — **P0**

1. Open `/book` → Laval → Car Rental → today.
2. **Expected:** Concurrency is now 1 (a 2nd same-slot booking blocked). See
   [02-capacity-and-conflicts.md](02-capacity-and-conflicts.md) CAP-06 for the full check.

### EMG-03 — Close a center

1. Emergency Control → **Close a center**, Laval, Rest of today, Apply.
2. **Expected:** New active control; public Laval slots for today are suppressed.

### EMG-04 — Block a resource

1. Emergency Control → **Block instructor or car**, Laval, pick **Ali**, Apply.
2. **Expected:** Active control saved (`resource_blocked`, `res_ali`).

### EMG-05 — Remove an active control — **P0**

1. Click the **X** on one active control.
2. **Expected:** It disappears from the list.
3. **Verify** it is soft-deleted:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT COUNT(*) AS active FROM capacity_overrides WHERE deleted_at IS NULL;"
   ```

### EMG-06 — Overrides survive reload — **P0**

1. With at least one active control present, **reload** the page.
2. **Expected:** Active controls re-load from the API (not lost / not the demo placeholder).

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM capacity_overrides; DELETE FROM bookings; DELETE FROM booking_form_responses;"
```

## Pass criteria

DASH-01, 02, 04, EMG-01, 02, 05, 06 (P0) pass. DASH-03, EMG-03, 04 (P1) pass.
