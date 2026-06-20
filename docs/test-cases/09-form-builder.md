# 09 — Form builder

**Goal:** Booking forms can be edited and published, creating a new immutable version that the
public flow serves.
**Surface:** `/admin` → Form builder.
**Pre:** Signed in.

---

## FRM-01 — Forms and schema load — **P0**

1. Open **Form builder**.
2. **Expected:** Left list shows 3 forms (Car rental, Driving lesson, Road test package) with
   version badges (`v1`). The first form's fields render with EN/FR labels, key, type, and the
   Required / Show-on-Calendar / Show-in-admin-list toggles.
3. **Verify current versions:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT id,name,active_version FROM forms WHERE deleted_at IS NULL;"
   ```

## FRM-02 — Edit a label and publish — **P0**

1. Select **Driving lesson**.
2. Change the **Full name** field's Label (EN) to `Student full name`.
3. Click **Publish changes**.
4. **Expected:** Toast "Published version 2"; the badge becomes `v2`.
5. **Verify the version bumped and a new schema row exists:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT active_version FROM forms WHERE id='form_lesson';"
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT version FROM form_versions WHERE form_id='form_lesson' ORDER BY version;"
   ```

   `active_version = 2`; two `form_versions` rows (1 and 2).

## FRM-03 — Add a field and publish — **P0**

1. On **Driving lesson**, click **Add field**.
2. Set Label (EN) `Preferred gearbox`, Label (FR) `Boîte de vitesses préférée`,
   Key `gearbox`, Type `radio`, leave Required unchecked.
3. **Publish changes** (→ version 3).
4. **Verify** the field is in the active schema:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT json_extract(schema_json,'$.fields[5].key') AS last_key FROM form_versions WHERE form_id='form_lesson' AND version=(SELECT active_version FROM forms WHERE id='form_lesson');"
   ```

   Returns `gearbox` (index 5 = the 6th field; adjust index if your field list differs).

## FRM-04 — Reorder fields

1. Use the **▲ / ▼** controls to move "Preferred gearbox" above "Driving experience".
2. **Publish** (→ version 4).
3. **Expected:** Order persists after publish; reload the form to confirm.

## FRM-05 — Calendar visibility flag

1. On any field, toggle **Show on Calendar event** on, Publish.
2. **Expected:** Flag stored in the new schema. (Its effect is verified in
   [10-google-calendar.md](10-google-calendar.md) CAL-10 — only `calendarVisible` fields appear
   in the event description.)

## FRM-06 — Remove a field

1. Remove the "Preferred gearbox" field (trash icon), Publish.
2. **Expected:** Field gone from the published schema; version bumps again.

## FRM-07 — Stale form version rejected on booking

1. Open `/book` → a service using **Driving lesson** (e.g. 1-Hour Driving Lesson) in one tab and
   begin a booking (this loads the current form version).
2. In the admin tab, **Publish** the Driving lesson form once more (bumps the version).
3. Submit the booking in the first tab.
4. **Expected:** Rejected with **"The booking form was updated. Please refresh and try again."**
   (`stale_form`). Refreshing and re-submitting succeeds.

## FRM-08 — Independent form switching

1. Click between the 3 forms.
2. **Expected:** Each loads its own schema; unsaved edits to one don't leak into another.

---

## Teardown (optional)

Published versions are immutable history — that's by design, so you don't need to undo them.
If you want the Driving lesson form back to its original labels, edit it back and publish a fresh
version, or restore the whole DB with the reset + `npm run db:seed:local`.

## Pass criteria

FRM-01, 02, 03 (P0) pass. FRM-04, 05, 06, 07, 08 (P1) pass.

> Out of scope (preview only): advanced per-field validation/options editor (min/max/pattern,
> select-option builder).
