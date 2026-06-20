# 10 — Google Calendar mappings & sync

**Goal:** Connect Google, map calendars, and verify FreeBusy + event creation + failure/retry.
**Surface:** `/admin` → Google Calendar, Instructors & cars, `/book`.
**Pre:** Signed in **with a real Google account** (Part B of [03-admin-auth.md](03-admin-auth.md)).
**Google needed:** **Yes.** Without a connection, run CAL-01 and the failure path (CAL-11/12) only.

---

## One-time Google setup

1. **Enable the Google Calendar API** on the Google Cloud project behind your OAuth client
   (APIs & Services → Library → "Google Calendar API" → Enable). OAuth/sign-in can succeed even
   when this is off, but every Calendar call (`Load available calendars`, FreeBusy, event
   creation) then returns **403** — symptom: "Could not load Google calendars." Enable it and
   wait a few minutes to propagate.
2. Create three operational calendars in Google Calendar, e.g.
   `Easy Driving – Laval Bookings`, `Easy Driving – Instructor Ali`, `Easy Driving – Instructor Sara`.
3. Have their **calendar IDs** ready (Calendar settings → "Integrate calendar" → Calendar ID,
   looks like `...@group.calendar.google.com`).

---

## CAL-01 — Connection state — **P0**

1. Open **Google Calendar**.
2. **Expected (not connected):** "Google Calendar not connected" + a **Connect Google account** button.
3. **Expected (connected):** "Google Calendar connected", the owner email, and a **Load available
   calendars** button.

## CAL-02 — Connect the owner account — **P0**

1. Click **Connect Google account** (or you already connected during sign-in).
2. Approve the Calendar scopes.
3. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT google_email, status FROM google_connections;"
   ```

## CAL-03 — Load available calendars

1. Click **Load available calendars**.
2. **Expected:** A dropdown lists your calendars with names + IDs.

## CAL-04 — Add a center canonical mapping — **P0**

1. In "Add mapping": Type **Center**, target **Laval**, pick the *Laval Bookings* calendar
   (or paste its ID), **Add mapping**.
2. **Expected:** It appears in the "Canonical mappings" list.
3. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT mapping_type, mapping_id, calendar_id, enabled FROM calendar_mappings WHERE enabled=1;"
   ```

## CAL-05 — Add a service mapping

1. Add a **Service** mapping for **SAAQ Road Test Package** → a calendar.
2. **Expected:** Saved. (Service mappings take priority over center mappings when both match.)

## CAL-06 — Remove a mapping

1. Click the trash icon on the service mapping from CAL-05.
2. **Expected:** Removed from the list; `enabled=0` in D1.

## CAL-07 — FreeBusy blocks a busy instructor — **P0**

1. Set **Ali**'s Calendar ID to the *Instructor Ali* calendar (Instructors & cars → Manage → Save;
   see [07-instructors-and-cars.md](07-instructors-and-cars.md) RES-02).
2. In Google Calendar, add a **Busy** event on Ali's calendar for `<NEXT-TUE>` **10:00–12:00**.
3. Open `/book` → Laval → **SAAQ Road Test Package** → `<NEXT-TUE>`.
4. **Expected:** The 10:00 slot is offered only if **Samir** is free; if you also block Samir, the
   slot disappears (no eligible instructor).

## CAL-08 — Rental ignores instructor busy — **P0**

1. With Ali (and Samir) busy as above, open Laval → **Car Rental Only** → `<NEXT-TUE>` 10:00.
2. **Expected:** Still bookable (no instructor required).

## CAL-09 — Event creation on booking — **P0**

1. With the Laval **center mapping** in place (CAL-04), book a public **Car Rental** at Laval
   `<NEXT-TUE>` 14:00 as Alex (`easydrivingca+alex@gmail.com`).
2. **Expected:**
   - Booking stored with `status=confirmed`, `calendar_sync_status=synced`.
   - A **canonical event** appears on the Laval Bookings calendar.
   - Alex (the student) receives **one** invite email at `easydrivingca+alex@gmail.com`
     (added as attendee, `sendUpdates: all`).
   - If the booking allocates a resource with its own calendar, that calendar gets an internal
     **blocking** event — created with `sendUpdates: none` and **no attendee**, so the
     **instructor receives no email**; the event only appears on their calendar.
   - No other confirmation email is sent (Google Calendar invite is the only email).
3. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT b.reference,b.status,bce.event_role,bce.sync_status FROM bookings b JOIN booking_calendar_events bce ON bce.booking_id=b.id ORDER BY b.created_at DESC;"
   ```

## CAL-10 — Event content is privacy-safe — **P0**

1. Open the canonical event in Google Calendar.
2. **Expected:** Title uses the **booking reference** (no phone number). Description includes the
   reference, student name, service, center, and only fields flagged **calendarVisible** — and
   **no phone number**.

## CAL-11 — Sync failure is captured — **P0**

1. Remove the Laval canonical mapping (CAL-06) **or** revoke calendar access.
2. Book a public Car Rental at Laval.
3. **Expected:** Booking is still **stored**, with `status=calendar_sync_failed`.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference,status,calendar_last_error FROM bookings ORDER BY created_at DESC LIMIT 1;"
   ```

## CAL-12 — Resync recovers — **P0**

1. Re-add the Laval mapping / restore access.
2. In `/admin` → Bookings (or Dashboard), click **Retry** on the failed booking
   (or `POST /api/admin/bookings/{id}/resync-calendar`).
3. **Expected:** Status returns to **confirmed**; the canonical event now exists.

## CAL-13 — Configurable event template

1. **Google Calendar** → **Event template**. Set a title like `{service} @ {center} ({reference})`
   and a description that includes `Manage or cancel: {manageUrl}`. **Save template.**
2. Book a public Car Rental at Laval.
3. **Expected:** The created event's title/description use your template; `{manageUrl}` resolves to
   a real `/booking/{reference}?token=...` link; placeholders for unset values fall back cleanly.
4. Clear both fields and Save → new events use the built-in defaults again.

## CAL-14 — Cancellation removes Google events + emails the student — **P0**

1. Create a confirmed booking that produces a canonical event (and, if an instructor calendar is
   mapped, a resource block).
2. Cancel it — either from `/admin` → Bookings (**Cancel**) or from the learner link
   `/booking/{reference}?token=...` → **Cancel this booking**.
3. **Expected:**
   - Canonical event is **deleted** from the calendar; the student receives a Google
     **cancellation email** (canonical delete uses `sendUpdates=all`).
   - Instructor/resource block events are **deleted** (no email); that instructor's FreeBusy is
     freed for the slot.
   - Booking status is `cancelled_by_admin`/`cancelled_by_student` in D1 regardless of Google
     outcome; deletion is best-effort and idempotent.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT b.reference,b.status,bce.event_role,bce.sync_status FROM bookings b JOIN booking_calendar_events bce ON bce.booking_id=b.id ORDER BY b.created_at DESC;"
   ```

   Cancelled booking's event rows show `sync_status='deleted'`.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_calendar_events; DELETE FROM bookings; DELETE FROM booking_form_responses;"
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resources SET calendar_id=NULL WHERE id IN ('res_ali','res_samir','res_sara');"
```

Delete the test events from your Google calendars manually.

## Pass criteria

CAL-01, 02, 04, 07, 08, 09, 10, 11, 12 (P0) pass. CAL-03, 05, 06 (P1) pass.
