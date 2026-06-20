# Easy Driving School Technical Setup Guide

This guide takes the project from local development to a production deployment on Cloudflare Pages, Workers, D1, Durable Objects, and Google Calendar.

## 1. Current implementation status

### Implemented

- React, TypeScript, Vite, and Tailwind frontend;
- public English/French booking flow;
- URL center/service preselection;
- D1 schema and seed data;
- public REST APIs;
- admin REST APIs;
- capacity-centric availability engine;
- pooled cars and named instructors;
- Google FreeBusy client;
- Google event creation client;
- Google OAuth callback and encrypted refresh-token storage;
- HTTP-only admin sessions;
- one Durable Object lock per center/date;
- booking/form snapshots and hashed management tokens;
- emergency override persistence API;
- Calendar sync failure status and retry endpoint;
- retention cleanup cron;
- unit and integration-style tests;
- **fully wired admin portal** — centers, services, instructors and pooled cars, business
  hours, the form builder, Google Calendar mappings, privacy/retention, and booking
  cancellation/resync all read and write through the live REST APIs against seeded data;
- **visible sign-in screen and route guard** — the portal shows a sign-in screen until a
  session exists; unauthenticated users cannot reach the admin screens;
- **local developer sign-in** — a local-only bypass so the admin portal is fully usable
  before Google OAuth is configured (see §5.1).

### Remaining production work

- replace the placeholder D1 database ID;
- create Cloudflare Pages and Worker production resources;
- configure all secrets;
- configure Google OAuth consent and credentials;
- create and map operational Calendars (the admin Calendar mapping form is now wired);
- complete Google event cancellation/update behavior;
- configure Turnstile if desired;
- test the embedded widget on the real Easy Driving website;
- add production monitoring and backup/export procedures;
- complete final bilingual content review.

## 2. Required accounts and tools

Prepare:

- Cloudflare account with access to the Easy Driving domain;
- Google account that will own or manage operational Calendars;
- Google Cloud project;
- Node.js 22 or newer;
- npm;
- Wrangler CLI, installed through the project dependencies;
- Git repository and deployment branch.

Verify:

```bash
node --version
npm --version
npx wrangler --version
```

## 3. Install the project locally

From the project root:

```bash
npm install
```

Create local environment variables:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Generate strong secrets in PowerShell:

```powershell
$session = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
$encryption = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
$session
$encryption
```

Put different values into:

```text
SESSION_SECRET=
TOKEN_ENCRYPTION_KEY=
```

Never commit `.dev.vars`.

## 4. Create and seed the local D1 database

Run:

```bash
npm run db:migrate:local
npm run db:seed:local
```

Verify seed data:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name FROM centers;"
npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name_en FROM services;"
```

Expected centers:

- Laval;
- Kirkland;
- Henri-Bourassa.

## 5. Run local development

Start Vite and the Worker together:

```bash
npm run dev
```

Services:

| Service | Local URL |
|---|---|
| Vite frontend | `http://localhost:5173` |
| Worker API | `http://localhost:8787` |
| Public booking | `http://localhost:5173/book` |
| Admin portal | `http://localhost:5173/admin` |
| Documentation | `http://localhost:5173/admin/docs` |
| Worker health | `http://localhost:8787/api/health` |

Vite proxies relative `/api` requests to port 8787.

### Common local error: ECONNREFUSED

If Vite reports:

```text
http proxy error: /api/...
ECONNREFUSED
```

the Worker is not running. Use `npm run dev`, not only `npm run dev:web`.

### 5.1 Sign in to the local admin portal (developer sign-in)

Every `/api/admin/*` route requires an authenticated session. Google OAuth is the
production sign-in, but it is not needed to work on the admin portal locally. A
**local-only developer sign-in** is available whenever `GOOGLE_CLIENT_ID` is empty
(the default in `.dev.vars`), and it disappears automatically once OAuth is configured.

The developer sign-in signs you in as the **first email in `ADMIN_EMAILS`** with the
`owner` role. Set that value in `.dev.vars` if you want a specific account:

```text
ADMIN_EMAILS=owner@example.com,manager@example.com
```

Steps:

1. Ensure the local D1 is migrated and seeded (§4).
2. Run `npm run dev`.
3. Open:

   ```text
   http://localhost:5173/admin
   ```

4. On the sign-in screen, click **Developer sign-in (local)**.
5. The portal loads against the seeded data (3 centers, 6 services, 4 instructors,
   3 pooled car groups, 3 forms).
6. Confirm the session by opening:

   ```text
   http://localhost:5173/api/admin/me
   ```

   The JSON response contains the authenticated user.

You can now exercise every admin screen end to end:

- **Centers** — add, edit, enable/disable, delete (delete is blocked when future
  bookings exist).
- **Services** — edit duration, buffers, price, booking form, cutoffs; add/disable.
- **Instructors & cars** — edit instructor Google Calendar IDs and details; change a
  pooled car-group capacity inline.
- **Availability rules** — edit weekly business hours per center.
- **Form builder** — add, reorder, edit and remove fields, then publish a new version.
- **Google Calendar** — create and remove canonical center/service mappings.
- **Privacy & retention** — change the retention period and save.
- **Bookings** — search, cancel, and retry calendar sync.

> Security note: developer sign-in only responds while Google OAuth is unconfigured.
> Once you set `GOOGLE_CLIENT_ID` (locally or in production), the `/api/auth/dev-login`
> route returns 404 and the button is hidden. Never deploy with OAuth unset.

## 6. Google Cloud project setup

### Enable Calendar API

1. Open Google Cloud Console.
2. Create or select a project.
3. Open **APIs & Services → Library**.
4. Search for **Google Calendar API**.
5. Select **Enable**.

> Do not skip this. OAuth sign-in and token refresh can succeed even when the Calendar API is
> disabled, so the connection shows as `connected` while every Calendar call fails with **403**
> ("Google Calendar API has not been used in project … or it is disabled"). The UI surfaces this
> as "Could not load Google calendars." After enabling, allow a few minutes to propagate.

### Configure OAuth consent

1. Open **Google Auth Platform** or **OAuth consent screen**.
2. Enter the app name, such as `Easy Driving Booking`.
3. Add a support email.
4. Add the booking domain under authorized domains when deploying.
5. During testing, add the owner/admin Google accounts as test users.
6. Review the requested Calendar scopes.

The app requests:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.events
```

### Create OAuth credentials

1. Open **Credentials**.
2. Choose **Create Credentials → OAuth client ID**.
3. Select **Web application**.
4. Add local authorized redirect URI:

   ```text
   http://localhost:8787/api/auth/google/callback
   ```

5. Later add production redirect URI:

   ```text
   https://booking.easydriving.ca/api/auth/google/callback
   ```

6. Copy the client ID and client secret into `.dev.vars`.

Example local values:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
APP_BASE_URL=http://localhost:5173
PUBLIC_SITE_ORIGIN=http://localhost:5173
ADMIN_EMAILS=owner@example.com,manager@example.com
```

### Test local sign-in

1. Keep `npm run dev` running.
2. Open:

   ```text
   http://localhost:8787/api/auth/google/start
   ```

3. Sign in with an allowlisted account.
4. Confirm Google returns to:

   ```text
   http://localhost:5173/admin
   ```

5. Open:

   ```text
   http://localhost:5173/api/admin/me
   ```

6. Confirm the JSON response contains the authenticated user.

## 7. Create operational Google Calendars

Recommended minimum:

- `Easy Driving - Laval Bookings`;
- `Easy Driving - Kirkland Bookings`;
- `Easy Driving - Henri-Bourassa Bookings`;
- `Easy Driving - Instructor Ali`;
- `Easy Driving - Instructor Samir`;
- `Easy Driving - Instructor Sara`;
- `Easy Driving - Instructor Omar`.

Share instructor Calendars with the relevant instructors and grant permission to create/edit events as operationally required.

### Calendar ownership

The connected owner account must have sufficient access to:

- list the Calendar;
- read FreeBusy;
- create events;
- update events for future cancellation/reschedule support.

No branded Google Workspace account is required.

## 8. Map Google Calendars in D1

The backend supports Calendar mappings. Until the admin Calendar mapping form is wired, use the API or D1 directly.

### Find Calendar IDs

After OAuth:

```text
GET /api/admin/calendar/list
```

The request must include the authenticated session cookie.

### Create a canonical center mapping through the API

```http
POST /api/admin/calendar/mappings
Content-Type: application/json

{
  "centerId": "ctr_laval",
  "mappingType": "center",
  "mappingId": "ctr_laval",
  "calendarId": "YOUR_CALENDAR_ID",
  "eventRole": "canonical"
}
```

Repeat for each center.

### Assign instructor Calendars

Update each named resource’s `calendar_id`.

Example local command:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "UPDATE resources SET calendar_id='ALI_CALENDAR_ID' WHERE id='res_ali';"
```

Use the remote command only after carefully verifying the target:

```bash
npx wrangler d1 execute easy-driving-booking --remote --command "UPDATE resources SET calendar_id='ALI_CALENDAR_ID' WHERE id='res_ali';"
```

## 9. Test Google Calendar behavior

### FreeBusy test

1. Add a Busy event to Ali’s instructor Calendar.
2. Choose a time inside normal center hours.
3. Request availability for an instructor-required service.
4. Confirm that time is not returned if no other eligible instructor is free.
5. Confirm Car Rental Only is unaffected by instructor availability.

### Event creation test

1. Book a public slot with a test email address.
2. Confirm D1 stores the booking.
3. Confirm the canonical center event appears.
4. Confirm the student receives one invite.
5. Confirm the allocated instructor Calendar receives an internal blocking event.
6. Confirm event titles use the booking reference, not phone numbers.

### Failure test

1. Temporarily remove the canonical mapping or revoke Calendar access.
2. Create a booking.
3. Confirm the booking remains stored.
4. Confirm status becomes `calendar_sync_failed`.
5. Restore Calendar access.
6. Call:

   ```text
   POST /api/admin/bookings/{bookingId}/resync-calendar
   ```

7. Confirm status returns to `confirmed`.

## 10. Create production Cloudflare D1

Authenticate:

```bash
npx wrangler login
```

Create the database:

```bash
npx wrangler d1 create easy-driving-booking
```

Cloudflare returns a database ID. Replace:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

in `wrangler.toml`.

Apply migrations:

```bash
npm run db:migrate:remote
```

Seed production:

```bash
npm run db:seed:remote
```

Review every seeded address, price, duration, capacity, instructor, and service before accepting real bookings.

## 11. Configure production Worker values

Recommended production URLs:

```text
APP_BASE_URL=https://booking.easydriving.ca
PUBLIC_SITE_ORIGIN=https://booking.easydriving.ca
GOOGLE_REDIRECT_URI=https://booking.easydriving.ca/api/auth/google/callback
```

Update `[vars]` in `wrangler.toml`:

```toml
[vars]
APP_BASE_URL = "https://booking.easydriving.ca"
PUBLIC_SITE_ORIGIN = "https://booking.easydriving.ca"
GOOGLE_REDIRECT_URI = "https://booking.easydriving.ca/api/auth/google/callback"
DEFAULT_TIMEZONE = "America/Montreal"
ADMIN_EMAILS = "owner@example.com,manager@example.com"
```

Set secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Optional:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Never put secret values in `wrangler.toml`.

## 12. Deploy the Worker

Run checks first:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Deploy:

```bash
npm run deploy:worker
```

The first deployment registers the `BookingLock` Durable Object class using the configured migration.

Verify:

```text
https://YOUR-WORKER.workers.dev/api/health
```

## 13. Create and deploy Cloudflare Pages

### Create the Pages project

In Cloudflare:

1. Open **Workers & Pages**.
2. Create a Pages application.
3. Connect the Git repository or use direct upload.
4. Set build command:

   ```text
   npm run build
   ```

5. Set output directory:

   ```text
   dist
   ```

For direct deployment:

```bash
npm run deploy:web
```

If Wrangler asks, select or create the correct Pages project.

### Add the custom domain

Add:

```text
booking.easydriving.ca
```

Wait for DNS and TLS activation.

## 14. Route `/api/*` to the Worker

The frontend uses relative API URLs. Production must route:

```text
https://booking.easydriving.ca/api/*
```

to the Worker while all other paths go to Pages.

Create a Worker route for:

```text
booking.easydriving.ca/api/*
```

Verify:

```text
https://booking.easydriving.ca/api/health
```

It must return:

```json
{"ok":true,"service":"easy-driving-booking-api"}
```

Do not launch until `/api/public/centers` works from the Pages domain without CORS errors.

## 15. Update Google production OAuth configuration

After the production domain works:

1. Add authorized redirect URI:

   ```text
   https://booking.easydriving.ca/api/auth/google/callback
   ```

2. Add the production domain to the OAuth consent configuration.
3. Confirm the values exactly match `GOOGLE_REDIRECT_URI`.
4. Test login from:

   ```text
   https://booking.easydriving.ca/api/auth/google/start
   ```

5. Confirm the secure session cookie is created.
6. Confirm `/api/admin/me` works.

OAuth redirect values must match exactly, including scheme, host, path, and trailing slash behavior.

## 16. Embed or link from easydriving.ca

### Recommended: direct link

```html
<a href="https://booking.easydriving.ca/book?center=laval&service=road-test-package">
  Book the SAAQ Road Test Package
</a>
```

Use URL preselection:

```text
/book?center=laval&service=road-test-package
/book?center=kirkland&service=car-rental
/book?center=henri-bourassa&service=driving-lesson
```

French:

```text
/book?center=laval&service=road-test-package&lang=fr
```

### Iframe option

The included Pages content-security policy allows framing by:

- `https://easydriving.ca`;
- `https://www.easydriving.ca`;
- the booking origin itself.

Example:

```html
<iframe
  src="https://booking.easydriving.ca/book?center=laval&service=car-rental"
  title="Easy Driving booking"
  style="width:100%;min-height:850px;border:0"
  loading="lazy">
</iframe>
```

Test mobile height, keyboard behavior, and scrolling before launch.

## 17. Optional Cloudflare Turnstile

1. Create a Turnstile widget for the booking domain.
2. Add the site key to the frontend configuration process.
3. Set `TURNSTILE_SECRET_KEY` as a Worker secret.
4. Ensure the public booking confirmation sends `turnstileToken`.
5. Test successful and failed verification.

> The backend verification is implemented. The current public form still needs the visible Turnstile widget connected before enabling the secret in production.

## 18. Admin screen wiring status

The admin portal is now wired to the live REST APIs. The backend exposes CRUD endpoints for:

- `/api/admin/centers`;
- `/api/admin/services` (+ `/api/admin/service-requirements`);
- `/api/admin/resources` (+ `/api/admin/resource-groups` for pooled capacity);
- `/api/admin/forms` (+ `/api/admin/forms/{id}` for the active schema);
- `/api/admin/overrides`;
- `/api/admin/calendar/mappings` (GET/POST/DELETE) and `/api/admin/calendar/list`;
- `/api/admin/center-hours` (GET/PUT business hours);
- `/api/admin/retention` (GET/PATCH);
- booking cancellation and Calendar retry.

Wired in the frontend (`src/AdminPortal.tsx`):

1. ✅ center cards use API data;
2. ✅ Add/Edit/Delete Center forms;
3. ✅ service forms; resource requirements shown from real data;
4. ✅ named instructors and pooled car-group capacity editing;
5. ✅ business hours per center (Availability screen);
6. ✅ Form Builder add/reorder/edit/remove fields + publish (version bump);
7. ✅ Calendar list, mapping create/remove;
8. ✅ retention setting save action;
9. ✅ booking cancellation, calendar sync status, and retry actions;
10. ✅ demo fallbacks confined to the public booking offline path; the authenticated admin
    portal uses live data only and shows a sign-in screen when no session exists.

Mutations are protected by the existing strict same-origin check (`assertTrustedOrigin`) plus
the HTTP-only session cookie. The session also stores a CSRF token; if you later expose any
cross-site embed of admin mutations, send it via the `X-CSRF-Token` header (already allowed by
CORS).

Still a preview / future enhancement:

- advanced per-field validation builder (min/max/pattern, options editor) in the Form Builder;
- per-service-per-day service-hours UI (the `service_hours` table exists; business hours are
  wired today).

## 19. Monitoring and operations

Recommended alerts:

- Worker 5xx response rate;
- Calendar OAuth refresh failures;
- bookings with `calendar_sync_failed`;
- retention job failures;
- high public booking rate-limit activity;
- Durable Object exceptions;
- D1 query errors.

Recommended operational reports:

- upcoming bookings by center;
- active overrides;
- resources disabled;
- bookings without synchronized Calendar events;
- last successful retention run.

## 20. Backup and recovery

Before major schema or production changes:

1. export or back up D1;
2. record active Calendar mappings;
3. verify secrets exist in Cloudflare;
4. test rollback in a preview environment;
5. keep migrations forward-only.

Do not delete production resources or Calendar mappings without checking future bookings.

## 21. Pre-launch acceptance checklist

### Public booking

- [ ] Every center loads.
- [ ] Every public service has correct bilingual content.
- [ ] Prices and durations are correct.
- [ ] URL preselection works.
- [ ] Mobile booking works.
- [ ] Fourth simultaneous Laval rental is rejected when car capacity is three.
- [ ] Rental does not require an instructor.
- [ ] Instructor-required service is blocked when all instructors are busy.
- [ ] Buffers prevent adjacent conflicts.
- [ ] Stale slot conflict shows a friendly message.

### Google Calendar

- [ ] Owner OAuth connection works.
- [ ] Every center/service has a canonical mapping.
- [ ] Every named instructor has a Calendar ID.
- [ ] FreeBusy blocks instructor time.
- [ ] Student gets one invite.
- [ ] Internal resources receive blocking events.
- [ ] Sync failures remain visible and retryable.

### Admin

- [ ] Only authorized accounts can access live admin APIs.
- [ ] Emergency controls persist in D1.
- [ ] Public availability changes immediately.
- [ ] Active controls can be removed.
- [ ] Booking list uses real data.
- [ ] Calendar sync failures are visible.
- [ ] All configuration screens required for launch are wired.

### Security and privacy

- [ ] Production secrets are unique and stored only in Cloudflare.
- [ ] CORS accepts only the production origin.
- [ ] OAuth redirect URI matches exactly.
- [ ] Public tokens are hashed.
- [ ] Google refresh tokens are encrypted.
- [ ] Retention cron runs successfully.
- [ ] Calendar titles contain no phone numbers.
- [ ] Turnstile is tested if enabled.

### Deployment

- [ ] D1 production ID is configured.
- [ ] Migrations applied remotely.
- [ ] Seed data reviewed.
- [ ] `/api/health` works on the production domain.
- [ ] Pages deep links work.
- [ ] `/admin/docs` works.
- [ ] Easy Driving website links or iframe work.

## 22. Useful commands

```bash
# Development
npm run dev

# Quality checks
npm run typecheck
npm test
npm run build
npm audit

# Local database
npm run db:migrate:local
npm run db:seed:local

# Remote database
npm run db:migrate:remote
npm run db:seed:remote

# Deployment
npm run deploy:worker
npm run deploy:web
```

## 23. Known MVP limitations

- app-created Google events are not fully reconciled after manual Calendar edits;
- cancellation (admin or learner self-service) now deletes app-created Google events
  (canonical with `sendUpdates: all` so the student is emailed; resource blocks silently) —
  best-effort and idempotent, per-event failures recorded on `booking_calendar_events`;
- the calendar event title/description is configurable in Admin → Google Calendar
  (`calendar_event_settings`; placeholders `{service} {center} {reference} {student} {manageUrl}
  {visibleFields}`), with built-in defaults when unset;
- Calendar push notifications are not enabled;
- the Form Builder does not yet include an advanced validation/options editor;
- email delivery beyond Google Calendar invitations is not included;
- the public booking page uses demo fallbacks when APIs fail (admin uses live data only);
- Playwright end-to-end tests are not yet part of the default test suite.

