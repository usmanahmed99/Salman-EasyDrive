# Easy Driving School Booking

A production-oriented, resource-capacity booking MVP for Easy Driving School. Students book without accounts; owners and staff operate the schedule from a mobile-friendly admin portal; instructors manage day-to-day availability in Google Calendar.

## What is included

- React, TypeScript, Vite and Tailwind public booking widget/full-page flow
- English/French UI and bilingual service/form content
- URL preselection such as `/book?center=laval&service=car-rental`
- Center, service, pooled capacity and named resource availability
- D1 migrations and realistic seed data for Laval, Kirkland and Henri-Bourassa
- One Durable Object lock per center/local date to serialize final booking checks
- Google OAuth, Calendar list, FreeBusy and event creation integration
- Canonical student invitation plus internal instructor/resource blocking events
- Admin Today view, booking list, emergency controls, centers, services, resources, form builder, calendar and retention screens
- Hashed public management tokens, encrypted Google refresh tokens, secure sessions, origin checks, rate limits and optional Turnstile
- Daily retention cleanup that anonymizes booking PII while preserving reporting dimensions
- Unit/integration-style tests for resource rules, overrides, buffers, busy calendars, serialized capacity, forms and retention

This deliberately does not include student accounts, learner progress, payments, CRM, SMS/WhatsApp automation or AI features.

## Repository layout

```text
src/                 React booking and admin UI
docs/                Owner/admin and technical setup documentation
shared/              Shared types, schemas and pure availability engine
worker/              Cloudflare Worker, Durable Object, OAuth and Calendar integration
migrations/          D1 schema
tests/               Vitest coverage for booking rules
seed.sql             Demo/initial business data
wrangler.toml        Worker, D1, Durable Object and cron bindings
```

## Local setup

Requirements: Node.js 22+ and a Cloudflare account for full D1/Worker testing.

```bash
npm install
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
```

Set the secrets in `.dev.vars`. For a frontend-only design preview, no secrets are required; the UI falls back to representative local data when the Worker is not running.

Start the frontend and Worker together:

```bash
npm run dev
```

Open:

- Booking flow: `http://localhost:5173/book?center=laval&service=car-rental`
- French: `http://localhost:5173/book?center=laval&service=road-test-package&lang=fr`
- Admin: `http://localhost:5173/admin`
- Admin documentation: `http://localhost:5173/admin/docs`

Detailed guides:

- [Admin operating guide](docs/admin-guide.md)
- [Technical setup guide](docs/technical-setup.md) — developer documentation stored in the repository only

`npm run dev` starts Vite on port 5173 and the Worker on port 8787. The Vite development server proxies `/api` to the Worker.

To run them separately when debugging:

```bash
npm run dev:web
npm run dev:worker
```

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create a Web application OAuth client.
5. Add the exact redirect URI from `GOOGLE_REDIRECT_URI`, locally:
   `http://localhost:8787/api/auth/google/callback`
6. Configure these scopes:
   - `openid`, `email`, `profile`
   - `calendar.calendarlist.readonly`
   - `calendar.freebusy`
   - `calendar.events`
7. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI`.
8. Set `ADMIN_EMAILS` to a comma-separated owner/admin allowlist for the first login.
9. Sign in through `/api/auth/google/start`.
10. In Admin → Google Calendar, map a canonical calendar to each center or service and add calendar IDs to named instructor resources.

Use shared operational calendars. Instructors add ordinary Busy/Unavailable/Vacation events to their assigned calendar; FreeBusy is checked when availability loads and again inside the Durable Object immediately before confirmation.

Google refresh tokens are AES-GCM encrypted before D1 storage with a key derived from `TOKEN_ENCRYPTION_KEY`. Use a long random value and do not reuse `SESSION_SECRET`.

## Deploy to Cloudflare

### CI/CD: dev and prod branches

Deploys are automated by branch via two GitHub Actions workflows:

| Push to | Workflow | Wrangler env | Target | GitHub Environment |
| --- | --- | --- | --- | --- |
| `dev` | `.github/workflows/deploy-dev.yml` | default | `easydriving.nextiadriveops.com` | `development` |
| `master` | `.github/workflows/deploy-prod.yml` | `--env production` | `book.easydriving.ca` (client account) | `production` |

Each GitHub Environment holds its own `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (dev and
prod are separate Cloudflare accounts). Work on `dev` → auto-deploys dev; merge `dev` → `master`
→ auto-deploys prod (after the `production` environment's approval gate, if a reviewer is set).
Prod-specific config lives under `[env.production]` in `wrangler.toml`.

A copy-paste quickstart. For the full walkthrough (consent screen, custom domain, monitoring,
backup, pre-launch checklist) see [`docs/technical-setup.md`](docs/technical-setup.md) §10–16.
For the live launch at `easydriving.nextiadriveops.com`, follow the domain-specific guide:
[`docs/deploy-nextiadriveops.md`](docs/deploy-nextiadriveops.md).

**0. Enable the Google Calendar API** on the Cloud project behind your OAuth client
(APIs & Services → Library → "Google Calendar API" → **Enable**). OAuth can succeed with this
off, but every Calendar call then returns **403** ("Could not load Google calendars"). Also add
the production redirect URI `https://booking.easydriving.ca/api/auth/google/callback` to the
OAuth client — it must match `GOOGLE_REDIRECT_URI` exactly.

**1. Authenticate and create the production D1 database:**

```bash
npx wrangler login
npx wrangler d1 create easy-driving-booking
```

Copy the returned `database_id` into `wrangler.toml` (replace the placeholder), then apply
schema and seed:

```bash
npm run db:migrate:remote
npm run db:seed:remote   # review every seeded address/price/duration/capacity before live bookings
```

**2. Set the production non-secret vars** in `wrangler.toml` `[vars]` — especially
`APP_BASE_URL`, `PUBLIC_SITE_ORIGIN`, `GOOGLE_REDIRECT_URI`, `DEFAULT_TIMEZONE`, and
`ADMIN_EMAILS`. Never put secrets here.

**3. Set Worker secrets** (stored encrypted in Cloudflare, unique per environment):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET          # long random; do NOT reuse for encryption
npx wrangler secret put TOKEN_ENCRYPTION_KEY    # long random; distinct from SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY    # optional, only if Turnstile is enabled
```

**4. Run checks, then deploy the Worker and the Pages frontend:**

```bash
npm run typecheck && npm test && npm run build && npm audit
npm run deploy:worker   # first deploy registers the BookingLock Durable Object migration
npm run deploy:web      # builds and uploads dist/ to Cloudflare Pages
```

**5. Route `/api/*` to the Worker.** The frontend uses relative API URLs, so production must send
`https://booking.easydriving.ca/api/*` to the Worker while all other paths go to Pages. Create a
**Worker route** for `booking.easydriving.ca/api/*` (or a service binding / reverse proxy).

**6. Verify before launch:**

```bash
curl https://booking.easydriving.ca/api/health      # -> {"ok":true,"service":"easy-driving-booking-api"}
curl https://booking.easydriving.ca/api/public/centers   # 3 centers, no CORS errors
```

Then sign in via `/api/auth/google/start`, confirm `/api/admin/me`, and in Admin → Google
Calendar map a canonical calendar to each center/service and set instructor calendar IDs.

## Embedding into the existing website

The booking flow can be linked directly:

```html
<a href="https://booking.example.com/book?center=laval&service=road-test-package">
  Book the $120 package
</a>
```

The included Pages headers allow framing only by `easydriving.ca`, `www.easydriving.ca`, and the booking origin itself. Keep the public booking origin and API CORS origin explicit—do not use `*` with credentialed requests.

## Booking and capacity behavior

The pure availability engine evaluates:

1. Center and service hours
2. Cutoff and operational buffers
3. Center/service/resource overrides
4. Service concurrency
5. Pooled capacity and named resources
6. Google Calendar busy windows
7. Existing D1 bookings and allocations

The public API returns only available slots. `/api/admin/debug/availability` includes internal reasons such as `center_closed`, `service_capacity_full`, `cars_capacity_full`, `instructors_unavailable`, and `cutoff_exceeded`.

Final confirmation is sent to `BookingLock` using an ID shaped like `center:{centerId}:{localDate}`. The object serializes attempts, reloads current D1/Google state, allocates resources, writes the booking, then creates Calendar events. If event creation fails, the booking remains stored as `calendar_sync_failed` and can be retried from the admin API.

## Configurable forms

Forms are versioned. Every booking stores:

- the active form version
- a schema snapshot
- JSON responses validated against that schema

Publishing a form creates a new immutable version. Calendar descriptions include only fields explicitly marked `calendarVisible`.

## Retention and privacy

The Worker cron runs daily. After the configured period (90 days by default), it:

- clears form-response JSON
- removes name, email and phone
- invalidates the public management token
- preserves reference, center, service, times, status and anonymous reporting data

Calendar events are separate records in Google and may retain limited operational details. Event titles are privacy-safe and never contain student phone numbers.

## Tests and checks

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Tests cover rental-only capacity, combined instructor/car requirements, closures, capacity limits, mocked instructor busy events, operational buffers, serialized final capacity, versioned form validation and retention anonymization.

## MVP limitations and extension points

- App-owned events should be changed through the app. The MVP does not reconcile an event manually moved or deleted in Google Calendar.
- FreeBusy is on-demand; Calendar push notifications/webhooks are intentionally left for a later phase.
- Cancellation (admin or learner self-service via `/booking/{reference}?token=…`) updates D1 **and** deletes the booking's Google events — canonical with `sendUpdates: all` (student gets a cancellation email), resource blocks silently. Deletion is best-effort and idempotent; failures are recorded per event. Reschedule still creates a replacement booking.
- The calendar event title/description is configurable in Admin → Google Calendar (placeholders: `{service} {center} {reference} {student} {manageUrl} {visibleFields}`); blank fields fall back to the built-in defaults.
- Email delivery beyond Google Calendar invitations is not included. On booking the **student**
  receives one Google Calendar invite (attendee, `sendUpdates: all`); the **instructor** receives
  no email — their resource event is an internal block (`sendUpdates: none`, no attendee) that
  only appears on their calendar.
- The frontend has safe demo fallbacks for visual development. Remove those fallbacks if production should fail closed whenever the API is unavailable.
