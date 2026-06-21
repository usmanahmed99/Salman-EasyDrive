# Easy Driving Booking — Test Plan

A manual + automated test plan covering the public booking flow, the admin portal
(all wired screens), the availability engine, Google Calendar sync, security, and
deployment. Use it for local acceptance before cloud launch, and as a regression
checklist after changes.

## How to read this

- **ID** — stable reference (e.g. `PUB-03`) for bug reports.
- **Pre** — preconditions/setup.
- **Steps** — what to do.
- **Expected** — pass criteria.
- Priority: **P0** must pass before launch, **P1** important, **P2** nice-to-have.

Mark each as Pass / Fail / Blocked and note the build (git SHA or date).

---

## 0. Environment setup

| ID | Step | Expected |
|----|------|----------|
| ENV-01 | `node --version`, `npm --version`, `npx wrangler --version` | Node ≥ 22, wrangler ≥ 4 |
| ENV-02 | `npm install` | Completes with no errors |
| ENV-03 | `npm run db:migrate:local` then `npm run db:seed:local` | Migrations applied; seed loads 3 centers, 6 services, 4 instructors, 3 car pools, 3 forms |
| ENV-04 | Verify seed: `npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name FROM centers"` | Laval, Kirkland, Henri-Bourassa |
| ENV-05 | `npm run dev` | WEB on 5173 (or next free port), API "Ready on http://127.0.0.1:8787" |
| ENV-06 | Open `http://localhost:8787/api/health` | `{"ok":true,"service":"easy-driving-booking-api"}` |

> Capacities under test (from seed): Laval = **3 cars / 2 instructors** (Ali, Samir),
> Kirkland = **2 cars / 1 instructor** (Sara), Henri-Bourassa = **2 cars / 1 instructor** (Omar).
> Base service concurrency = 4. Car Rental Only needs **1 car, no instructor**.
> Road Test needs **1 car + 1 instructor** (120 min, 15/15 buffers, 4 h cutoff).

---

## 1. Quality gates (automated)

| ID | Command | Expected | Pri |
|----|---------|----------|-----|
| CI-01 | `npm run typecheck` | No TS errors | P0 |
| CI-02 | `npm test` | All unit tests pass (availability + form/retention) | P0 |
| CI-03 | `npm run build` | `tsc -b && vite build` succeeds, `dist/` produced | P0 |
| CI-04 | `npm audit` | Review; no unaddressed high/critical for production deps | P1 |

The unit suite (`tests/availability.test.ts`, `tests/form-retention.test.ts`) already covers:
pooled rental capacity, dual-requirement limiting, center/service closure priority, capacity
overrides, instructor FreeBusy, buffer conflicts, serial confirmation, dynamic form validation,
retention cutoff + PII anonymization. **Re-run CI-02 after any backend change.**

---

## 2. Public booking flow (`/book`)

| ID | Pre | Steps | Expected | Pri |
|----|-----|-------|----------|-----|
| PUB-01 | — | Open `/book` | Centers load from API (3 centers); brand/header render | P0 |
| PUB-02 | — | Select a center | Services for that center load (6 enabled) | P0 |
| PUB-03 | — | Select a service, pick a date | Available time slots render only inside business hours | P0 |
| PUB-04 | — | Select a slot, fill the form, submit | Confirmation with `ED-XXXXXX` reference; booking visible in admin Bookings | P0 |
| PUB-05 | — | Submit with a required field empty | Inline validation error; no booking created | P0 |
| PUB-06 | — | Submit with invalid email format | "valid email address" error | P1 |
| PUB-07 | — | `/book?center=laval&service=road-test-package` | Center + service pre-selected from URL | P1 |
| PUB-08 | — | `/book?center=kirkland&service=car-rental&lang=fr` | French copy throughout; service preselected | P1 |
| PUB-09 | — | Pick a Sunday (day 0; no seeded center hours) | No slots offered | P1 |
| PUB-10 | — | Choose a slot within the cutoff window (e.g. road test < 4 h away) | Slot not offered / rejected as `cutoff_exceeded` | P1 |
| PUB-11 | mobile viewport | Repeat PUB-01..04 at 390px width | Layout usable; keyboard + scroll behave | P1 |
| PUB-12 | API down | Stop the worker, reload `/book` | Public page shows demo fallback (offline state), not a crash | P2 |
| PUB-13 | After PUB-04, click **Manage** on the confirmation (opens `/booking/{ref}?token=…`) | Manage page loads the real booking (schedule, service, location, reference) | P0 |
| PUB-14 | On the manage page, click **Cancel this booking** → confirm | Booking cancelled (`cancelled_by_student`); slot freed; Google events removed; success state shown | P0 |
| PUB-15 | Open `/booking/{ref}` with a wrong/missing `token` | Friendly "invalid or expired" message; no booking data leaked | P0 |
| PUB-16 | Try to cancel inside the service's cancellation cutoff window | Blocked with "call us" message (`cancellation_cutoff`); booking unchanged | P1 |
| PUB-17 | Open `/?embed=1` (and `?embed=1&center=laval`) | Header/footer hidden (chromeless); flow works; preselect honoured. See admin-guide "Embedding the booking page". | P1 |
| PUB-18 | Load `/?embed=1` inside an `<iframe>` on a different-origin test page; complete a booking | Booking completes; confirmation shows (API is same-origin to the iframe, so no CORS issue) | P2 |

### 2.1 Capacity & conflict rules (the core engine, exercised through the UI)

Set these up by creating bookings via the public flow (or the admin), then re-checking availability.

| ID | Scenario | Expected | Pri |
|----|----------|----------|-----|
| CAP-01 | Book **3 concurrent** Laval Car Rentals at the same start | 4th overlapping rental at that time is **rejected** (`grp_laval_cars_capacity_full`) | P0 |
| CAP-02 | Car Rental Only at a time when all instructors are busy | Still **bookable** (rental needs no instructor) | P0 |
| CAP-03 | Road Test at Kirkland when its **single** instructor (Sara) is already booked | Slot **blocked** (`*_instructors_unavailable`) | P0 |
| CAP-04 | Two adjacent bookings where the 15-min buffers overlap | Second adjacent slot **blocked** by buffer | P1 |
| CAP-05 | Book the last available unit, then immediately request the same slot again | Second request rejected `booking_conflict` ("just booked") | P0 |
| CAP-06 | Apply a `service_capacity` override of 1, then check availability | Service capacity drops to 1 immediately; 2nd concurrent blocked | P0 |

> Tip: use the debug endpoint to see *why* a slot is unavailable:
> `POST /api/admin/debug/availability` `{ "centerSlug":"laval","serviceSlug":"road-test-package","dateFrom":"YYYY-MM-DD" }`
> (authenticated) returns each slot with `available`, `capacityRemaining`, and `reasons[]`.

---

## 3. Admin authentication & route guard

| ID | Pre | Steps | Expected | Pri |
|----|-----|-------|----------|-----|
| AUTH-01 | OAuth configured | Open `/admin` signed out | Sign-in screen shown; admin screens not reachable | P0 |
| AUTH-02 | OAuth configured | Click "Sign in with Google", use an `ADMIN_EMAILS` account | Returns to `/admin`, signed in; `/api/admin/me` returns the user | P0 |
| AUTH-03 | OAuth configured | Sign in with a Google account **not** in `ADMIN_EMAILS` (and not an existing user) | Rejected `admin_not_allowed` (403) | P0 |
| AUTH-04 | — | While signed in, click **Sign out** | Session cleared; `/admin` shows sign-in again | P0 |
| AUTH-05 | OAuth configured | Direct GET `/api/auth/dev-login` style POST | 404 — dev bypass disabled when `GOOGLE_CLIENT_ID` set | P0 |
| AUTH-06 | OAuth **un**set (blank `GOOGLE_CLIENT_ID`, restart) | Open `/admin` | "Developer sign-in (local)" button appears; clicking signs in as first `ADMIN_EMAILS` user | P1 |
| AUTH-07 | — | Mismatched redirect URI in Google console | Google returns `redirect_uri_mismatch` — confirms exact-match requirement | P1 |

> After AUTH-06 testing, restore `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and restart so
> production-equivalent auth is active for the rest of the plan.

---

## 4. Admin — Dashboard (Today)

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| DASH-01 | Open Today | Stat cards show **live** counts: bookings today, car capacity (7 from seed), instructors active (4), calendar issues | P0 |
| DASH-02 | Inspect the day's bookings list | Real bookings (not demo); shows instructor name (or `—`); status badges correct; day arrows + Today work | P0 |
| DASH-02b | Day with > 8 bookings | List paginates 8/page with "1–N of M" footer and prev/next; day change resets to page 1 | P1 |
| DASH-03 | Inspect "Center status" | All 3 seeded centers listed with open/closed state | P1 |
| DASH-04 | If a `calendar_sync_failed` booking exists, click "Retry …" | Calls resync; success toast or clean error (no canonical mapping → readable message) | P0 |
| DASH-04b | Click "Reconcile calendar" | Success toast summarising the run; no crash (full check in BKG-08) | P1 |

### 4.1 Emergency Control

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| EMG-01 | Open Emergency Control → "Limit service capacity", pick Laval + Car Rental, limit 1, Apply | Override saved; appears under "Active controls"; persists in `capacity_overrides` | P0 |
| EMG-02 | Re-check public availability for that service/time | Concurrency limited to 1 immediately | P0 |
| EMG-03 | "Close a center" for today, Apply | Center-wide closure; public slots for that center suppressed | P0 |
| EMG-04 | "Block instructor or car", pick a Laval resource | Resource-blocked override saved | P1 |
| EMG-05 | Remove an active control (X) | Override soft-deleted; availability restored | P0 |
| EMG-06 | Reload the page | Active controls re-load from API (not lost) | P0 |

---

## 5. Admin — Centers

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| CEN-01 | Open Centers | 3 cards from live data with real addresses + resource unit counts | P0 |
| CEN-02 | Add center (name auto-suggests slug), Save | New center created; appears in list and in `centers` table | P0 |
| CEN-03 | Edit a center's address/timezone, Save | Change persists (verify in D1) | P0 |
| CEN-04 | Toggle a center to "Closed", Save | `enabled=0`; center no longer in public `/api/public/centers` | P0 |
| CEN-05 | Delete a center **with future bookings** | Blocked with 409 "future bookings" message | P0 |
| CEN-06 | Delete a center with **no** future bookings | Soft-deleted (`deleted_at` set), removed from list | P1 |
| CEN-07 | Create with invalid slug (uppercase/spaces) | Slug auto-normalized; or server rejects non `[a-z0-9-]` | P1 |

---

## 6. Admin — Services

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| SVC-01 | Open Services | 6 services from live data; requirement label shows e.g. "1 cars + 1 instructors" | P0 |
| SVC-02 | Edit a service: duration, price, buffers, cutoff, form, Save | Persists; re-open shows new values | P0 |
| SVC-03 | Change a service's booking **form**, Save | New `form_id` stored; public booking uses that form | P1 |
| SVC-04 | Add a new service | Created (`enabled=1`); appears in list | P1 |
| SVC-05 | Disable a service, Save | `enabled=0`; not offered in public `/api/public/services` | P0 |
| SVC-06 | Edit a service and shorten duration so it now fits more slots | Public availability reflects new duration | P1 |
| SVC-07 | Save with empty English name | Rejected "name and slug are required" | P1 |
| SVC-08 | Drag to reorder services | Order persists and drives the public `/api/public/services` order | P1 |

---

## 7. Admin — Instructors & cars

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| RES-01 | Open Instructors & cars | 4 instructors (named) + 3 car pools (pooled) from live data | P0 |
| RES-02 | Edit an instructor's **Google Calendar ID**, Save | Persists on the resource; FreeBusy will use it (see §9) | P0 |
| RES-03 | Edit instructor email/phone/status, Save | Persists | P1 |
| RES-04 | Add a new instructor to a center group | Created and assigned to the chosen group/center | P1 |
| RES-05 | Disable an instructor | `enabled=0`; excluded from availability for that center | P0 |
| RES-06 | Change a car pool capacity (e.g. Laval 3→2) via the inline number field (blur) | `resource_groups.capacity` updated; toast confirms; availability reflects new cap | P0 |
| RES-07 | Set Laval cars capacity to 0 | No rental slots for Laval | P1 |
| RES-08 | Delete an instructor with future bookings | Blocked 409 "future bookings" | P1 |

---

## 8. Admin — Availability rules (business hours)

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| AVL-01 | Open Availability, pick a center | Weekly hours load from `center_hours` (Mon–Fri 08:00–18:00, Sat 09:00–16:00, Sun closed) | P0 |
| AVL-02 | Change Friday to 08:00–12:00, Save | Saved; public availability for Friday now ends at 12:00 | P0 |
| AVL-03 | Disable (uncheck) Saturday, Save | Saturday becomes closed; no slots | P0 |
| AVL-04 | Re-enable a day with new times | Slots reappear in that window | P1 |
| AVL-05 | Switch centers | Hours reload per center; edits are center-scoped | P1 |
| AVL-06 | Inspect the summary cards | Service/car-pool/instructor counts match live data | P2 |

---

## 9. Admin — Form builder

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| FRM-01 | Open Form builder | Form list (3 forms) with version badges; first form's fields load | P0 |
| FRM-02 | Edit a field label (EN/FR), Publish | `active_version` bumps by 1; new `form_versions` row created | P0 |
| FRM-03 | Add a field, set key/type/required, Publish | New field present in the published schema | P0 |
| FRM-04 | Reorder fields (▲/▼), Publish | Field order persisted in new version | P1 |
| FRM-05 | Toggle "Show on Calendar event" for a field, Publish | Flag stored; reflected in Calendar event description (see §10) | P1 |
| FRM-06 | Remove a field, Publish | Field gone from schema | P1 |
| FRM-07 | After publishing, open `/book` for a service using that form | New version served; submitting with a stale version returns `stale_form` | P1 |
| FRM-08 | Switch between forms | Each loads its own schema independently | P2 |

---

## 10. Google Calendar (requires connected owner account + mappings)

> These require a real Google connection. With OAuth configured, connect the owner account,
> create operational calendars, and map them. Without a connection, mapping/list calls and
> sync will report clean, expected errors (test those too).

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| CAL-01 | Calendar screen, signed in without connection | Shows "not connected" + "Connect Google account" link | P0 |
| CAL-02 | Connect owner account via the link | Returns connected; `google_connections` row present; status shown | P0 |
| CAL-03 | "Load available calendars" | Lists the owner's calendars (IDs + summaries) | P1 |
| CAL-04 | Add a **center** canonical mapping (Laval → a calendar) | Mapping saved; appears in the list | P0 |
| CAL-05 | Add a **service** mapping | Saved; service mapping takes priority over center for that service | P1 |
| CAL-06 | Remove a mapping | Disabled (`enabled=0`); gone from list | P1 |
| CAL-07 | Set an instructor's calendar ID (§RES-02), add a Busy event there during center hours | A Road Test slot needing that instructor is suppressed (FreeBusy), unless another eligible instructor is free | P0 |
| CAL-08 | Confirm Car Rental Only ignores instructor busy | Rental still bookable | P0 |
| CAL-09 | Create a public booking with a canonical mapping in place | Booking stored; canonical center event created; student gets **one** invite; allocated instructor calendar gets an internal blocking event | P0 |
| CAL-09b | Check email inboxes after CAL-09: the **student** test address and the **instructor** | **Student receives one Google Calendar invite email** (added as attendee, `sendUpdates: all`). **Instructor receives no email** — the blocking event is created with `sendUpdates: none` and no attendee; it only *appears* on their calendar. No other confirmation email is sent. | P0 |
| CAL-10 | Inspect the created event title/description | Title uses booking reference; **no phone numbers**; only `calendarVisible` fields in description | P0 |
| CAL-11 | Remove the canonical mapping (or revoke access) and create a booking | Booking still stored; status `calendar_sync_failed` | P0 |
| CAL-12 | Restore access/mapping, then `POST /api/admin/bookings/{id}/resync-calendar` (or dashboard Retry) | Status returns to `confirmed`; event created | P0 |
| CAL-13 | Admin → Google Calendar → **Event template**: set a custom title e.g. `{service} @ {center} ({reference})` and description with `{manageUrl}`, Save; create a booking | Created event uses the custom title/description; `{manageUrl}` resolves to a working `/booking/{ref}?token=` link; blank fields fall back to defaults | P1 |
| CAL-14 | **Cancel** a confirmed booking (admin or learner link) that has Google events | Canonical event deleted (student receives a Google **cancellation email**); instructor/resource block events deleted (instructor FreeBusy freed); `booking_calendar_events.sync_status='deleted'`; booking still cancelled in D1 even if a Google call fails | P0 |

---

## 11. Admin — Bookings list & actions

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| BKG-01 | Open Bookings | Real bookings; search filters by name/reference/service/center/instructor; Instructor column shown | P0 |
| BKG-02 | Cancel a confirmed booking | Status → `cancelled_by_admin`; capacity freed; the booking's Google events deleted (student emailed a cancellation); admin cancel ignores the cancellation cutoff; see CAL-14 | P0 |
| BKG-03 | Retry a `calendar_sync_failed` booking | Resync action runs; status updates or readable error | P0 |
| BKG-04 | Search a non-existent term | "No bookings found" empty state | P2 |
| BKG-05 | Filter by service, then by instructor; Clear | Subset matches; pooled/no-instructor rows show `—` and are excluded by instructor filter; Clear resets all | P1 |
| BKG-06 | Reschedule a booking via the picker | Same reference, new time; calendar event moved; resource-conflict slots are disabled in the picker | P0 |
| BKG-07 | New booking on an amber (cutoff/hours) slot | Created via admin override; a true resource-conflict slot is refused | P1 |
| BKG-08 | Delete a canonical Google event, click Reconcile | Booking → cancelled (`event_deleted_externally`), slot freed; no-op run reports all in sync | P1 |

---

## 12. Admin — Privacy & retention

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| PRV-01 | Open Privacy | Retention period loads from `retention_settings` (default 90); last-job stats shown | P0 |
| PRV-02 | Change to 60 days, Save | `retention_days=60` persisted (verify in D1); success toast | P0 |
| PRV-03 | Trigger cleanup locally: `curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled"` | A `retention_jobs` row recorded; Privacy "last run" reflects it | P1 |
| PRV-04 | After cleanup of an expired booking | Student PII anonymized; reference/service/center/date/status preserved | P1 |

---

## 13. Security & privacy

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| SEC-01 | Call any `/api/admin/*` with no session cookie | 401 unauthorized | P0 |
| SEC-02 | Send an admin mutation with a disallowed `Origin` header | 403 `invalid_origin` | P0 |
| SEC-03 | Confirm public `manage` tokens are hashed (`public_token_hash`), never stored raw | DB holds only hashes | P0 |
| SEC-04 | Confirm Google refresh token stored encrypted (`encrypted_refresh_token`) | Not plaintext | P0 |
| SEC-05 | Hammer `/api/public/availability` > 120 req / 5 min from one IP | 429 `rate_limited` | P1 |
| SEC-06 | Hammer `/api/public/bookings` > 20 req / 5 min | 429 `rate_limited` with a message to try again in 5 minutes | P1 |
| SEC-07 | Inspect any Calendar event title/desc | No phone numbers or full contact info | P0 |
| SEC-08 | (If enabled) submit booking without Turnstile token | `turnstile_required`; valid token passes | P2 |

---

## 14. Deployment (cloud) — run after resources exist

| ID | Steps | Expected | Pri |
|----|-------|----------|-----|
| DEP-01 | `wrangler d1 create` and set real `database_id` in `wrangler.toml` | Placeholder replaced | P0 |
| DEP-02 | `npm run db:migrate:remote` + `npm run db:seed:remote` | Schema + seed applied to prod D1 | P0 |
| DEP-03 | Set all secrets (`GOOGLE_*`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`) | Stored in Cloudflare, unique, not in `wrangler.toml` | P0 |
| DEP-04 | `npm run deploy:worker` | Worker deploys; `BookingLock` DO migration registers | P0 |
| DEP-05 | `https://YOUR-WORKER.workers.dev/api/health` | Returns ok JSON | P0 |
| DEP-06 | `npm run deploy:web` (Pages) + custom domain | Site live on `booking.easydriving.ca` | P0 |
| DEP-07 | Worker route `booking.easydriving.ca/api/*` | `/api/health` works on the prod domain | P0 |
| DEP-08 | Update Google prod redirect URI + consent domain | Exact match; prod login works; secure cookie set | P0 |
| DEP-09 | `/api/public/centers` from Pages domain | No CORS errors | P0 |
| DEP-10 | Easy Driving website link / iframe | Loads and books; iframe framing allowed | P1 |

---

## 15. Acceptance sign-off

Launch-ready when all **P0** rows pass and outstanding **P1** rows are triaged. Cross-reference
`docs/technical-setup.md` §21 (Pre-launch acceptance checklist).

Known previews (not bugs, see setup §18/§23): advanced per-field validation/options editor in
the Form builder; per-service-per-day service-hours UI; full Google event reconciliation after
manual calendar edits.

---

## Quick regression set (run on every change)

`CI-01 → CI-04`, `PUB-04`, `CAP-01`, `CAP-05`, `CEN-03`, `SVC-02`, `RES-06`, `AVL-02`,
`FRM-02`, `BKG-02`, `PRV-02`, `SEC-01`, `SEC-02`.
