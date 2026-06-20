# 07 — Instructors & cars

**Goal:** Named instructors and pooled car capacity are managed against live D1, and changes
affect availability.
**Surface:** `/admin` → Instructors & cars.
**Pre:** Signed in.

---

## RES-01 — Live list — **P0**

1. Open **Instructors & cars**.
2. **Expected:** Two sections:
   - **Instructors (named):** Ali, Samir (Laval), Sara (Kirkland), Omar (Henri-Bourassa).
   - **Cars (pooled capacity):** Laval Cars (3), Kirkland Cars (2), Henri-Bourassa Cars (2).

## RES-02 — Set an instructor's Google Calendar ID — **P0**

1. On **Ali**, click **Manage**.
2. Set **Google Calendar ID** to `easydrivingca+ali@gmail.com` (or a real calendar ID if testing
   FreeBusy — see [10-google-calendar.md](10-google-calendar.md)).
3. **Save instructor.**
4. **Expected:** Ali's card shows the calendar ID (no longer "No Google Calendar set").
5. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name, calendar_id FROM resources WHERE id='res_ali';"
   ```

## RES-03 — Edit instructor details

1. Manage **Samir**: Email `easydrivingca+samir@gmail.com`, Phone `(514) 555-0190`, Status Active.
2. Save and verify:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name,email,phone FROM resources WHERE id='res_samir';"
   ```

## RES-04 — Add a new instructor

1. Click **Add instructor**. Enter:
   - Name: `Leïla Haddad`
   - Center / group: `Kirkland — Kirkland Instructors`
   - Email: `easydrivingca+instructor@gmail.com`
   - Calendar ID: (leave blank)
   - Status: Active
2. **Save.**
3. **Expected:** Appears under Kirkland instructors.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name, center_id, group_id FROM resources WHERE name='Leïla Haddad';"
   ```

   Now Kirkland has 2 instructors. (Re-test CAP-03 in
   [02-capacity-and-conflicts.md](02-capacity-and-conflicts.md): a single busy instructor no
   longer blocks Kirkland, since Leïla can cover.)

## RES-05 — Disable an instructor — **P0**

1. Manage **Omar** (Henri-Bourassa, the only instructor there), Status → **Inactive**, Save.
2. **Expected:** Omar's status dot is grey.
3. Open `/book` → Henri-Bourassa → SAAQ Road Test Package → `<NEXT-TUE>`.
4. **Expected:** No instructor-required slots (Omar disabled, none left).
5. Re-enable Omar afterward.

## RES-06 — Change pooled car capacity — **P0**

1. In **Laval Cars**, change the number field from `3` to `2`, then click outside (blur).
2. **Expected:** Toast "Laval Cars capacity set to 2".
3. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name, capacity FROM resource_groups WHERE id='grp_laval_cars';"
   ```

4. Re-check CAP-01 logic: a **3rd** concurrent Laval rental is now blocked (capacity 2). Restore
   to `3` when done.

## RES-07 — Zero car capacity

1. Set **Kirkland Cars** to `0` (blur).
2. Open `/book` → Kirkland → Car Rental → `<NEXT-TUE>`.
3. **Expected:** No rental slots (0 cars). Restore to `2`.

## RES-08 — Delete instructor with future bookings

1. Book a future Driving Lesson at Laval that allocates Ali (or seed an allocation). Then try to
   delete Ali.
2. **Expected:** Blocked 409 "This resource has future bookings and cannot be deleted."
3. Remove the booking and confirm Ali can then be deleted (skip the actual delete to keep seed
   intact — just confirm the message changes).

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM resources WHERE name='Leïla Haddad';"
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resource_groups SET capacity=3 WHERE id='grp_laval_cars'; UPDATE resource_groups SET capacity=2 WHERE id IN ('grp_kirkland_cars','grp_henri_cars');"
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resources SET enabled=1, deleted_at=NULL WHERE id IN ('res_ali','res_samir','res_sara','res_omar');"
```

## Pass criteria

RES-01, 02, 05, 06 (P0) pass. RES-03, 04, 07, 08 (P1) pass. Seed restored.
