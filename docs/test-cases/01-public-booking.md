# 01 — Public booking: happy path & validation

**Goal:** A student can book a slot end to end, and the form rejects bad input.
**Surface:** `/book` (public).
**Data:** Alex Tremblay, Marie Gagnon (see [00-synthetic-data.md](00-synthetic-data.md)).
**Google needed:** No (calendar sync may report `calendar_sync_failed` without a mapping — that's expected here; see [10-google-calendar.md](10-google-calendar.md)).

---

## Setup

```bash
# Clean baseline (removes prior test bookings/overrides)
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_resource_allocations;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_form_responses;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM bookings;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM capacity_overrides;"
```

Confirm the app is running (`npm run dev`) and `/api/health` returns `{"ok":true,...}`.

---

## PUB-01 — Centers load

1. Open `http://localhost:5173/book`.
2. **Expected:** Step 1 "Location" shows **3 centers**: Henri-Bourassa, Kirkland, Laval, each
   with its address. Header shows the Easy Driving logo and phone, EN/FR toggle.

## PUB-02 — Services load for a center

1. Click **Continue** on **Laval**.
2. **Expected:** Step 2 lists the 6 enabled services (SAAQ Road Test Package, Car Rental Only,
   1-Hour Driving Lesson, Mock Test, Parking Lesson, Highway Lesson) with prices.

## PUB-03 — Slots appear inside business hours

1. Choose **SAAQ Road Test Package**.
2. On Step 3, pick **`<NEXT-TUE>`**.
3. **Expected:** Time slots appear only between **08:00 and 18:00** (seeded Laval Tue hours).
   The last start is early enough that a 120-min booking + buffers fits before 18:00.

## PUB-04 — Complete a booking (happy path) — **P0**

1. Select the **10:00** slot.
2. Fill the form with Alex Tremblay:
   - Full name: `Alex Tremblay`
   - Email: `easydrivingca+alex@gmail.com`
   - Phone: `(514) 555-0142`
   - Official SAAQ exam date and time: `<NEXT-TUE> 11:30`
   - Licence class: `Class 5 — Passenger vehicle`
   - Anything we should know?: `Pickup at the Laval center entrance.`
3. Submit.
4. **Expected:** A confirmation screen with a reference like **`ED-######`** and the slot details.
5. **Verify in D1:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference, status, calendar_sync_status, start_at FROM bookings ORDER BY created_at DESC LIMIT 1;"
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT student_name, student_email FROM booking_form_responses ORDER BY created_at DESC LIMIT 1;"
   ```

   Row exists; `student_name = Alex Tremblay`, `student_email = easydrivingca+alex@gmail.com`.
   `status` is `confirmed` (with a calendar mapping) or `calendar_sync_failed` (without one) —
   either confirms the booking persisted.

## PUB-05 — Required-field validation — **P0**

1. Start a new booking (Laval → Road Test → `<NEXT-TUE>` → 14:00).
2. Leave **Full name** empty; fill the rest.
3. Submit.
4. **Expected:** Inline error on the name field; submission blocked.
5. **Verify:** booking count did **not** increase:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT COUNT(*) AS n FROM bookings;"
   ```

## PUB-06 — Invalid email format

1. In the same form, set name to `Alex Tremblay`, email to `alex.tremblay.gmail.com` (no `@`).
2. Submit.
3. **Expected:** "Please enter a valid email address" (or inline email error); blocked.

## PUB-07 — URL preselection

1. Open `http://localhost:5173/book?center=laval&service=road-test-package`.
2. **Expected:** Laval and Road Test Package are pre-selected; you land on the date step.

## PUB-08 — French language

1. Open `http://localhost:5173/book?center=kirkland&service=car-rental&lang=fr`.
2. **Expected:** Entire flow in French ("Location de voiture seulement", French labels/buttons).
3. Complete a booking as **Marie Gagnon** (`easydrivingca+marie@gmail.com`, `(514) 555-0188`).
4. **Expected:** French confirmation; booking persists (verify as in PUB-04).

## PUB-09 — Closed day (Sunday)

1. Open `/book`, choose **Laval → Car Rental Only → `<NEXT-SUN>`**.
2. **Expected:** No slots offered (no seeded Sunday hours).

## PUB-10 — Cutoff window

1. Choose **Laval → SAAQ Road Test Package → `<TODAY>`**.
2. **Expected:** Any slot **less than 4 hours** from now is **not** offered (road test cutoff = 4 h).
   Slots later today beyond the 4 h window may appear.

## PUB-11 — Mobile layout

1. Resize the browser to **390 px** wide (or device emulation).
2. Repeat PUB-01 → PUB-04.
3. **Expected:** Layout is usable; inputs reachable; keyboard and scrolling behave; confirmation readable.

## PUB-12 — Offline fallback (graceful)

1. Stop the worker only (leave Vite running), or stop `npm run dev` and start just `npm run dev:web`.
2. Reload `/book`.
3. **Expected:** The page still renders with **demo fallback** data rather than crashing
   (this is the public offline state; the admin portal deliberately does **not** fall back).
4. Restart `npm run dev` before continuing.

---

## Pass criteria

PUB-01..PUB-08 all pass (P0 core flow + validation). PUB-09..PUB-12 are P1.
Reset with the Setup commands before the next case.
