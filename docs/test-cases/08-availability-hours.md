# 08 — Availability: business hours

**Goal:** Per-center weekly business hours are editable and bound the public slots.
**Surface:** `/admin` → Availability rules.
**Pre:** Signed in.

---

## AVL-01 — Hours load per center — **P0**

1. Open **Availability rules**, ensure **Laval** is selected.
2. **Expected:** Weekly grid loads from `center_hours`:
   Mon–Fri **08:00–18:00** (enabled), Sat **09:00–16:00** (enabled), Sun unchecked (closed).
3. **Verify source:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT day_of_week,start_time,end_time FROM center_hours WHERE center_id='ctr_laval' ORDER BY day_of_week;"
   ```

## AVL-02 — Shorten a weekday — **P0**

1. Change **Friday** end time from `18:00` to `12:00`.
2. Click **Save business hours**.
3. **Expected:** Success toast.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT day_of_week,start_time,end_time FROM center_hours WHERE center_id='ctr_laval' AND day_of_week=5;"
   ```

   Friday (day 5) now `08:00–12:00`.
5. Open `/book` → Laval → Car Rental → a **Friday** date.
6. **Expected:** No slots offered after ~12:00.

## AVL-03 — Disable a day — **P0**

1. **Uncheck** Saturday, Save.
2. **Expected:** Saturday saved as closed (the PUT drops disabled days).
3. **Verify** Saturday (day 6) row is gone:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT COUNT(*) AS sat FROM center_hours WHERE center_id='ctr_laval' AND day_of_week=6;"
   ```

4. Open `/book` → Laval → any service → `<NEXT-SAT>` → **no slots**.

## AVL-04 — Re-enable with new times

1. **Check** Saturday again, set `10:00–14:00`, Save.
2. **Expected:** Slots reappear for `<NEXT-SAT>` between 10:00 and 14:00.

## AVL-05 — Hours are center-scoped

1. Switch the center selector to **Kirkland**.
2. **Expected:** Kirkland still shows the original seeded hours (your Laval edits did not touch it).

## AVL-06 — Summary cards

1. Look at the summary cards below the editor.
2. **Expected:** Services count, car-pool count + total cars, instructor-group count + total
   instructors all match live data.

---

## Teardown — restore Laval hours

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM center_hours WHERE center_id='ctr_laval';"
npx wrangler d1 execute easy-driving-booking --local --command "INSERT INTO center_hours(id,center_id,day_of_week,start_time,end_time) VALUES ('ctr_laval_1','ctr_laval',1,'08:00','18:00'),('ctr_laval_2','ctr_laval',2,'08:00','18:00'),('ctr_laval_3','ctr_laval',3,'08:00','18:00'),('ctr_laval_4','ctr_laval',4,'08:00','18:00'),('ctr_laval_5','ctr_laval',5,'08:00','18:00'),('ctr_laval_6','ctr_laval',6,'09:00','16:00');"
```

## Pass criteria

AVL-01, 02, 03 (P0) pass. AVL-04, 05, 06 (P1) pass. Laval hours restored to seed.
