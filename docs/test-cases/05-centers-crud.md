# 05 — Centers: create / edit / delete

**Goal:** Centers are managed against live D1, with future-booking delete protection.
**Surface:** `/admin` → Centers.
**Pre:** Signed in.

---

## CEN-01 — Live list — **P0**

1. Open **Centers**.
2. **Expected:** 3 cards (Henri-Bourassa, Kirkland, Laval) with real addresses and a resource
   unit count (Laval shows 5 = 3 cars + 2 instructors; the others 3).

## CEN-02 — Create a center — **P0**

1. Click **Add center**.
2. Enter:
   - Center name: `Brossard`  (slug auto-fills `brossard`)
   - Address: `9001 Boulevard Leduc, Brossard, QC J4Y 0L1`
   - Timezone: `America/Montreal`
   - Status: `Open / enabled`
3. **Save center.**
4. **Expected:** Success toast; a new "Brossard" card appears.
5. **Verify in D1:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name,address,enabled FROM centers WHERE slug='brossard';"
   ```

## CEN-03 — Edit a center — **P0**

1. Click **Edit** on **Brossard**.
2. Change Address to `9001 Boulevard Leduc, Brossard, QC J4Y 0L1 (Door C)`.
3. **Save.**
4. **Expected:** Card shows the new address.
5. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT address FROM centers WHERE slug='brossard';"
   ```

## CEN-04 — Disable hides from public — **P0**

1. Edit **Brossard**, set Status to **Closed / disabled**, Save.
2. **Expected:** Card shows "Closed".
3. **Verify** it's gone from the public endpoint:

   ```bash
   curl -s "http://localhost:8787/api/public/centers" | grep -i brossard || echo "not public (correct)"
   ```

## CEN-05 — Delete blocked by future bookings — **P0**

1. Re-enable Brossard (Edit → Open → Save) so it can take a booking, then create a future
   booking for it. Quick SQL to attach a future booking to Brossard:

   ```bash
   # Grab the Brossard id
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT id FROM centers WHERE slug='brossard';"
   ```

   Then (replace IDs) seed a minimal future booking:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "INSERT INTO bookings(id,reference,center_id,service_id,start_at,end_at,operational_start_at,operational_end_at,timezone,language,status,form_version,form_schema_snapshot,public_token_hash,calendar_sync_status) VALUES ('bk_test','ED-TEST01','<BROSSARD_ID>','svc_rental','<NEXT-TUE>T14:00:00Z','<NEXT-TUE>T15:30:00Z','<NEXT-TUE>T13:45:00Z','<NEXT-TUE>T15:45:00Z','America/Montreal','en','confirmed',1,'{}','hash_test','synced');"
   ```

2. Try to **delete** Brossard (trash icon → confirm).
3. **Expected:** Blocked with **"This center has future bookings and cannot be deleted"** (409).

## CEN-06 — Delete with no future bookings

1. Remove the test booking:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM bookings WHERE id='bk_test';"
   ```

2. Delete **Brossard** → confirm.
3. **Expected:** Card disappears; success toast.
4. **Verify** soft delete:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug, deleted_at, enabled FROM centers WHERE slug='brossard';"
   ```

   `deleted_at` is set, `enabled=0`.

## CEN-07 — Slug normalization

1. Add a center named `St. Léonard Test`.
2. **Expected:** Slug auto-normalizes to `st-leonard-test` (lowercase, hyphenated). Save and
   verify, then delete it (no future bookings) to clean up.

---

## Teardown

Ensure no leftover test centers remain enabled:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,enabled,deleted_at FROM centers;"
```

## Pass criteria

CEN-01..CEN-06 (P0) pass. CEN-07 (P1) passes. Original 3 seeded centers untouched and enabled.
