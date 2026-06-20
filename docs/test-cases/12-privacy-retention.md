# 12 — Privacy & retention

**Goal:** Retention period is editable and the cleanup job anonymizes expired student PII while
preserving anonymous booking dimensions.
**Surface:** `/admin` → Privacy & retention; the scheduled cleanup handler.
**Pre:** Signed in.

---

## PRV-01 — Settings load — **P0**

1. Open **Privacy & retention**.
2. **Expected:** Retention period shows **90 days after appointment** (seeded default). The
   "Scheduled cleanup" card shows last-run status (or "Never") and records cleaned.
3. **Verify source:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT retention_days, token_expiry_days FROM retention_settings WHERE id='default';"
   ```

## PRV-02 — Change retention period — **P0**

1. Change the dropdown to **60 days after appointment**.
2. Click **Save retention settings**.
3. **Expected:** Success toast.
4. **Verify:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT retention_days FROM retention_settings WHERE id='default';"
   ```

   `retention_days = 60`.

## PRV-03 — Run the cleanup job — **P1**

The cron does not auto-fire in local dev; trigger it manually.

1. Seed an **expired, completed** booking (end date older than the retention window) with PII:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "INSERT INTO bookings(id,reference,center_id,service_id,start_at,end_at,operational_start_at,operational_end_at,timezone,language,status,form_version,form_schema_snapshot,public_token_hash,calendar_sync_status) VALUES ('bk_old','ED-OLD001','ctr_laval','svc_rental','2024-01-01T14:00:00Z','2024-01-01T15:30:00Z','2024-01-01T13:45:00Z','2024-01-01T15:45:00Z','America/Montreal','en','confirmed',1,'{}','hash_old','synced');"
   npx wrangler d1 execute easy-driving-booking --local --command "INSERT INTO booking_form_responses(booking_id,response_json,student_name,student_email,student_phone) VALUES ('bk_old','{\"fullName\":\"Nadia Benali\"}','Nadia Benali','easydrivingca+nadia@gmail.com','(450) 555-0133');"
   ```

2. Trigger the scheduled handler:

   ```bash
   curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"
   ```

3. Reload the Privacy screen.
4. **Expected:** "Last run" shows a recent successful job; "Records cleaned" ≥ 1.
5. **Verify a job row:**

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT status, records_anonymized FROM retention_jobs ORDER BY started_at DESC LIMIT 1;"
   ```

## PRV-04 — PII anonymized, dimensions preserved — **P1**

1. After PRV-03, inspect the old booking:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT student_name, student_email, student_phone, response_json FROM booking_form_responses WHERE booking_id='bk_old';"
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference, center_id, service_id, status, pii_anonymized_at FROM bookings WHERE id='bk_old';"
   ```

2. **Expected:** Student name/email/phone are **NULL**, `response_json` is `{}`, and
   `pii_anonymized_at` is set — but **reference, center, service, date, status** remain intact for
   anonymous reporting. `status` flipped `confirmed → completed`.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_form_responses WHERE booking_id='bk_old'; DELETE FROM bookings WHERE id='bk_old';"
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE retention_settings SET retention_days=90 WHERE id='default';"
```

## Pass criteria

PRV-01, 02 (P0) pass. PRV-03, 04 (P1) pass. Retention restored to 90.
