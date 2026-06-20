# 13 — Security & rate limiting

**Goal:** Admin APIs require a session + trusted origin; public tokens are hashed; refresh tokens
encrypted; public endpoints are rate-limited; calendar events leak no contact info.
**Surface:** API layer + DB.
**Pre:** App running; for SEC-04/07 a Google connection helps but is optional.

---

## SEC-01 — Admin API requires a session — **P0**

```bash
curl -i http://localhost:8787/api/admin/centers
curl -i http://localhost:8787/api/admin/bookings
```

**Expected:** Both return **401** `{"error":"Please sign in to continue.","code":"unauthorized"}`.

## SEC-02 — Trusted-origin check on mutations — **P0**

With OAuth configured (so the dev-origin allowance is off), send an admin request with a
disallowed Origin:

```bash
curl -i -X POST http://localhost:8787/api/admin/overrides \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/json" \
  --data '{"centerId":"ctr_laval","type":"center_closed","startAt":"2030-01-01T00:00:00Z","endAt":"2030-01-02T00:00:00Z"}'
```

**Expected:** **403** `invalid_origin` (the request is rejected before auth even matters).

> Note: in local dev with OAuth **unset**, `http://localhost:*` origins are intentionally allowed
> so the dev portal works. Run this test in the OAuth-configured state to see the production rule.

## SEC-03 — Public manage tokens are hashed — **P0**

1. Create a public booking (any service).
2. Inspect the stored token column:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT reference, public_token_hash FROM bookings ORDER BY created_at DESC LIMIT 1;"
   ```

3. **Expected:** `public_token_hash` is an opaque base64url hash — the raw `manageToken` from the
   confirmation is **never** stored. (The hash won't match the token by eye; that's the point.)

## SEC-04 — Refresh token encrypted — **P0**

(Requires a Google connection — see [10-google-calendar.md](10-google-calendar.md).)

```bash
npx wrangler d1 execute easy-driving-booking --local --command "SELECT substr(encrypted_refresh_token,1,20) AS prefix FROM google_connections;"
```

**Expected:** An opaque `iv.ciphertext` base64url blob (contains a `.`), **not** a readable
Google `1//…` refresh token.

## SEC-05 — Availability rate limit — **P1**

Hammer the public availability endpoint past **120 requests / 5 min** from one IP:

```bash
for i in $(seq 1 130); do \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/api/public/availability \
  -H "Content-Type: application/json" \
  --data '{"centerSlug":"laval","serviceSlug":"car-rental","dateFrom":"2030-01-01"}'; \
done | sort | uniq -c
```

**Expected:** Early requests `200`, later ones `429` (`rate_limited`). Then clear the bucket:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM rate_limits;"
```

## SEC-06 — Booking rate limit — **P1**

The booking endpoint limit is **12 / 10 min**. Repeating a booking POST > 12 times returns `429`.
(Easiest to observe by re-submitting from `/book` rapidly, or scripting the POST like SEC-05
against `/api/public/bookings`.) Clear `rate_limits` afterward.

## SEC-07 — No contact info in calendar events — **P0**

(Requires a synced booking — see CAL-09/10.)

1. Open a created canonical event in Google Calendar.
2. **Expected:** Title = `<service> - <center> - Booking <reference>`. Description contains the
   reference, student name, service, center, and only **calendarVisible** fields — **no phone
   number** anywhere.

## SEC-08 — Turnstile (only if enabled) — **P2**

If `TURNSTILE_SECRET_KEY` is set:

1. Submit a booking without a `turnstileToken`.
2. **Expected:** `turnstile_required` (400). With a valid token it passes.

If Turnstile is not configured, mark **N/A**.

---

## Teardown

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM rate_limits; DELETE FROM bookings; DELETE FROM booking_form_responses;"
```

## Pass criteria

SEC-01, 02, 03, 04, 07 (P0) pass. SEC-05, 06 (P1) pass. SEC-08 (P2) or N/A.
