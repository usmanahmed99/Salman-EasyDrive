# 06 — Services: create / edit / disable

**Goal:** Services are managed against live D1; changes flow to the public booking flow.
**Surface:** `/admin` → Services.
**Pre:** Signed in.

---

## SVC-01 — Live list with requirements — **P0**

1. Open **Services**.
2. **Expected:** 6 services from live data. Each "Requires" label reflects real data, e.g.
   Car Rental Only → "1 cars"; SAAQ Road Test Package / Driving Lesson → "1 cars + 1 instructors".

## SVC-02 — Edit a service — **P0**

1. Click **Edit** on **1-Hour Driving Lesson**.
2. Change:
   - Price (display): `$59`
   - Duration (minutes): `75`
   - Booking cutoff (hours): `3`
3. **Save service.**
4. **Expected:** Row shows `75 min · $59`.
5. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name_en,duration_minutes,price_display,cutoff_hours FROM services WHERE slug='driving-lesson';"
   ```

6. Open `/book` → Laval → 1-Hour Driving Lesson → `<NEXT-TUE>` and confirm slots reflect the
   75-min duration (fewer/later end times than before).

## SVC-03 — Change the booking form

1. Edit **Mock Test**, change **Booking form** from "Driving lesson" to "Road test package", Save.
2. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT name_en, form_id FROM services WHERE slug='mock-test';"
   ```

3. Open `/book` → Mock Test and confirm the form now shows the road-test fields
   (exam date, licence class). Revert afterward (set form back to `form_lesson`).

## SVC-04 — Create a service

1. Click **Add service**. Enter:
   - Name (English): `Refresher Lesson` (slug → `refresher-lesson`)
   - Name (French): `Leçon de recyclage`
   - Description (EN): `A short refresher for licensed drivers.`
   - Price: `$50`, Duration: `60`, Buffers: `10` / `10`, Cutoff: `2`, Cancellation cutoff: `12`
   - Booking form: `Driving lesson`, Status: `Enabled`
2. **Save.**
3. **Expected:** Appears in the list.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name_en,enabled FROM services WHERE slug='refresher-lesson';"
   ```

> Note: a brand-new service has no `service_centers` rows yet, so it won't appear in public
> booking until linked to a center. That linkage UI is out of scope for this build — verifying
> the service row is created is sufficient here.

## SVC-05 — Disable hides from public — **P0**

1. Edit **Parking Lesson**, Status → **Disabled**, Save.
2. **Expected:** Badge shows "Disabled".
3. **Verify** it's absent from public services for a center:

   ```bash
   curl -s "http://localhost:8787/api/public/services?centerSlug=laval" | grep -i parking || echo "not public (correct)"
   ```

4. Re-enable Parking Lesson afterward.

## SVC-06 — Duration change reflects in availability

1. Edit **Highway Lesson**, Duration → `45`, Save.
2. Open `/book` → Laval → Highway Lesson → `<NEXT-TUE>`.
3. **Expected:** More/earlier-ending slots available than at 60 min. Revert to `60`.

## SVC-07 — Validation: empty name

1. Add service, leave **Name (English)** blank, fill the rest, Save.
2. **Expected:** Rejected — "Service name and slug are required" (Save disabled or server 400).

## SVC-08 — Drag-and-drop ordering drives public order — **P1**

1. In **Services**, drag a service by its grip handle to a new position; release.
2. **Expected:** Order persists (reload the page — it stays).
3. **Verify** the same order is served publicly:

   ```bash
   curl -s "http://localhost:8787/api/public/services?centerSlug=laval" | python -c "import sys,json;print([s['name']['en'] for s in json.load(sys.stdin)])"
   ```

4. **Expected:** The public list matches the admin order. Open `/book` → Laval and confirm the service cards appear in that order.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE services SET deleted_at=CURRENT_TIMESTAMP, enabled=0 WHERE slug='refresher-lesson';"
npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,enabled,duration_minutes,price_display FROM services WHERE deleted_at IS NULL ORDER BY name_en;"
```

Confirm the 6 seeded services are back to their intended values (revert any you changed and
didn't restore in-step).

## Pass criteria

SVC-01, 02, 05 (P0) pass. SVC-03, 04, 06, 07, 08 (P1) pass.
