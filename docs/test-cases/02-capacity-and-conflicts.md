# 02 — Capacity & conflict rules

**Goal:** The availability engine enforces car/instructor capacity, buffers, cutoffs, and
overrides exactly. This is the core of the product.
**Surface:** `/book` + the authenticated debug endpoint.
**Google needed:** No.

Because reproducing "3 cars busy" by clicking is slow, this case seeds bookings directly in D1,
then checks availability through the UI and the debug endpoint.

---

## Tools you'll use

**Debug availability** (authenticated — sign in to `/admin` first so the session cookie exists,
then run in the browser console on the admin tab):

```js
await fetch('/api/admin/debug/availability', {
  method: 'POST', headers: {'Content-Type':'application/json'}, credentials:'include',
  body: JSON.stringify({ centerSlug:'laval', serviceSlug:'car-rental', dateFrom:'<NEXT-TUE>' })
}).then(r => r.json())
```

It returns every slot with `available`, `capacityRemaining`, and `reasons[]` — use it to see
*why* a slot is blocked.

**Reset before each sub-case:**

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_resource_allocations; DELETE FROM booking_form_responses; DELETE FROM bookings; DELETE FROM capacity_overrides;"
```

> Tip: the easiest way to seed "N concurrent bookings" is to **book them through `/book`** at the
> same start time using Alex, Marie, Sam (and a 4th). Each public booking allocates 1 car. The
> SQL approach below is the fast alternative.

---

## CAP-01 — Pooled car capacity (Laval = 3) — **P0**

Laval has 3 pooled cars. A 4th concurrent Car Rental at the same time must be rejected.

1. Through `/book`, create **3** Car Rental Only bookings at **Laval**, all starting
   **`<NEXT-TUE>` 10:00**, as Alex, Marie, Sam.
2. Confirm 3 exist:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT COUNT(*) AS n FROM bookings WHERE center_id='ctr_laval' AND start_at LIKE '%T14:00%' OR start_at LIKE '%10:00%';"
   ```

3. Now attempt a **4th** Car Rental at Laval, same 10:00 slot, as Nadia.
4. **Expected:** The 10:00 slot is **no longer offered** (or rejected on submit). Debug endpoint
   shows `reasons` containing `grp_laval_cars_capacity_full` for that time.

## CAP-02 — Rental ignores instructors — **P0**

1. Reset. Block **both** Laval instructors for `<NEXT-TUE>` 10:00–12:00 via the admin
   Emergency Control → "Block instructor or car" (do it twice: Ali, then Samir), **or** SQL:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "INSERT INTO capacity_overrides(id,center_id,resource_id,type,start_at,end_at,reason) VALUES ('ovr_ali','ctr_laval','res_ali','resource_blocked','<NEXT-TUE>T14:00:00Z','<NEXT-TUE>T16:00:00Z','test'),('ovr_samir','ctr_laval','res_samir','resource_blocked','<NEXT-TUE>T14:00:00Z','<NEXT-TUE>T16:00:00Z','test');"
   ```

2. Open `/book` → Laval → **Car Rental Only** → `<NEXT-TUE>`.
3. **Expected:** 10:00 is still **bookable** (rental needs no instructor).
4. Compare: Laval → **SAAQ Road Test Package** at the same time → blocked (needs an instructor).

## CAP-03 — Single-instructor block (Kirkland) — **P0**

Kirkland has only **Sara**. If she's busy, instructor services are unavailable there.

1. Reset. Book a **Driving Lesson** at **Kirkland**, `<NEXT-TUE>` 10:00 (as Alex) — this consumes Sara.
2. Open `/book` → Kirkland → **SAAQ Road Test Package** → `<NEXT-TUE>`.
3. **Expected:** The 10:00 slot is **blocked** (`*_instructors_unavailable` in debug). No other
   Kirkland instructor exists to cover it.

## CAP-04 — Buffer prevents adjacent conflicts

Road Test has 15-min before/after buffers; operational time is wider than the visible slot.

1. Reset. Book a Road Test at **Laval**, `<NEXT-TUE>` 10:00 (consumes 1 car + 1 instructor,
   operational 09:45–12:15).
2. Check availability for a Road Test starting **12:00** the same day.
3. **Expected:** 12:00 is blocked for that instructor/car because the buffers overlap (operational
   11:45–14:15 vs prior 09:45–12:15). A slot starting **12:30+** is fine.

## CAP-05 — Stale slot / double-book race — **P0**

1. Reset. Set Laval cars to **1** for a clean single-unit test:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resource_groups SET capacity=1 WHERE id='grp_laval_cars';"
   ```

2. Open **two** browser tabs on `/book`, both Laval → Car Rental → `<NEXT-TUE>` 10:00, filled in.
3. Submit tab 1 (succeeds), then submit tab 2.
4. **Expected:** Tab 2 fails with a friendly **"That time was just booked"** message
   (`booking_conflict`). No second booking is created.
5. Restore capacity:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resource_groups SET capacity=3 WHERE id='grp_laval_cars';"
   ```

## CAP-06 — Capacity override takes effect immediately — **P0**

1. Reset. In `/admin` → Today → Emergency Control: **Limit service capacity**, Laval,
   Car Rental Only, limit **1**, When **Rest of today** (or tomorrow to match `<NEXT-TUE>`), Apply.
2. Re-check `/book` Laval → Car Rental → that date.
3. **Expected:** Only **1** concurrent booking allowed at any time; a 2nd at the same slot is
   blocked (`service_capacity_full`), even though 3 cars exist.
4. Remove the override (X on the active control) and confirm capacity returns to normal.

---

## Pass criteria

CAP-01, 02, 03, 05, 06 (P0) all pass. CAP-04 (P1) passes.
Always run the reset block, and restore any capacity you changed, before the next case.
