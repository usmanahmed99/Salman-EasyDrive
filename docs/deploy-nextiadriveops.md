# Deploy to `easydriving.nextiadriveops.com`

Step-by-step guide to publish the Easy Driving booking app at
**`https://easydriving.nextiadriveops.com/`**, assuming `nextiadriveops.com` already exists as a
zone in your Cloudflare account.

This is the concrete, domain-specific version of the generic guide in
[`technical-setup.md`](technical-setup.md) §10–16. Use this one for the actual launch.

> **Architecture recap.** Two Cloudflare resources serve one origin:
> - **Pages** serves the static SPA (everything except `/api/*`).
> - **Worker** (`easy-driving-booking-api`) serves `/api/*` (booking, admin, OAuth, cron).
>
> A **Worker route** `easydriving.nextiadriveops.com/api/*` sends API paths to the Worker; all
> other paths fall through to Pages. The frontend calls **relative** `/api` URLs, so once both
> live on the same hostname, no CORS or CSP `connect-src` change is needed.

---

## 0. Prerequisites

- `nextiadriveops.com` is an active zone in this Cloudflare account (DNS managed by Cloudflare).
- You are logged in to Wrangler against the **same** Cloudflare account:

  ```bash
  npx wrangler login
  npx wrangler whoami      # confirm the account that owns nextiadriveops.com
  ```

- Node 22+, repo installed (`npm install`).
- A Google Cloud project with the **Calendar API enabled** (see [`technical-setup.md`](technical-setup.md) §6 — OAuth can succeed while the API is off, then every calendar call 403s).

Decide the final values now (used everywhere below):

| Setting | Value |
|---|---|
| Public origin | `https://easydriving.nextiadriveops.com` |
| OAuth redirect URI | `https://easydriving.nextiadriveops.com/api/auth/google/callback` |
| Timezone | `America/Montreal` |
| Admin allowlist | your owner/admin Google emails, comma-separated |

---

## 1. Set production config in `wrangler.toml`

Edit the `[vars]` block in [`../wrangler.toml`](../wrangler.toml) to the production hostname
(these are **non-secret**; secrets come in step 3):

```toml
[vars]
APP_BASE_URL = "https://easydriving.nextiadriveops.com"
PUBLIC_SITE_ORIGIN = "https://easydriving.nextiadriveops.com"
GOOGLE_REDIRECT_URI = "https://easydriving.nextiadriveops.com/api/auth/google/callback"
DEFAULT_TIMEZONE = "America/Montreal"
ADMIN_EMAILS = "owner@nextia-ai.com,manager@nextia-ai.com"
```

Why these matter:
- `APP_BASE_URL` builds the learner **manage/cancel** link in calendar events and the post-login
  redirect to `/admin`.
- `PUBLIC_SITE_ORIGIN` + `APP_BASE_URL` are the **only** allowed origins for admin mutations
  (`assertTrustedOrigin`) — they must equal the real hostname or admin writes get `403`.
- `GOOGLE_REDIRECT_URI` must match the Google console value **exactly** (scheme, host, path).
- `ADMIN_EMAILS` is the first-login allowlist. Leave no trailing spaces.

> The `database_id` in `wrangler.toml` is already set to `4a4f4eb4-...` (a real remote D1). Keep it.

---

## 2. Apply migrations and seed the remote D1

The remote database needs its schema **before** any seed. (Seeding first is what produces
`no such table: centers`.)

```bash
npm run db:migrate:remote     # applies 0001_initial.sql + 0002_calendar_event_template.sql
npm run db:seed:remote        # centers -> services -> forms -> resources
```

Verify:

```bash
npx wrangler d1 execute easy-driving-booking --remote --command "SELECT slug,name FROM centers;"
```

Expect Laval, Kirkland, Henri-Bourassa. **Review every seeded address, price, duration, capacity,
instructor, and service before taking real bookings.**

> If the remote DB already has data, re-running seeds may duplicate rows — check the seed files
> are idempotent (or skip seeding) rather than blindly re-running.

---

## 3. Set Worker secrets

Generate two **different** strong random values for the session and encryption keys, then store
all secrets in Cloudflare (never in `wrangler.toml`):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET          # long random; unique
npx wrangler secret put TOKEN_ENCRYPTION_KEY    # long random; DIFFERENT from SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY    # optional, only if you enable Turnstile
```

`TOKEN_ENCRYPTION_KEY` decrypts stored Google refresh tokens — if it changes later, existing
connections must reconnect.

---

## 4. Deploy the Worker (API)

Run the quality gates, then deploy:

```bash
npm run typecheck && npm test && npm run build
npm run deploy:worker
```

The first deploy registers the `BookingLock` Durable Object migration. Confirm the Worker is up on
its `workers.dev` URL:

```bash
curl https://easy-driving-booking-api.<your-subdomain>.workers.dev/api/health
# -> {"ok":true,"service":"easy-driving-booking-api"}
```

(The `workers.dev` URL is shown in the deploy output; `workers_dev = true` is set in
`wrangler.toml`.)

---

## 5. Deploy the frontend to Cloudflare Pages

```bash
npm run deploy:web        # runs vite build, then wrangler pages deploy dist
```

If Wrangler prompts, create/select a Pages project (e.g. `easy-driving-booking`). This uploads
`dist/`, including the security headers in [`public/_headers`](../public/_headers).

---

## 6. Point the subdomain at Pages

In the Cloudflare dashboard:

1. **Workers & Pages → your Pages project → Custom domains → Set up a custom domain.**
2. Enter `easydriving.nextiadriveops.com`.
3. Because `nextiadriveops.com` is already in this account, Cloudflare creates the DNS record
   automatically (a proxied `CNAME`/alias). Approve it.
4. Wait for the domain to show **Active** (DNS + TLS). The site should now load at
   `https://easydriving.nextiadriveops.com/` (SPA only — `/api/*` is wired in the next step).

---

## 7. Route `/api/*` to the Worker

The SPA calls relative `/api` URLs, so the Worker must own `/api/*` on this exact hostname.

1. **Workers & Pages → `easy-driving-booking-api` (the Worker) → Settings → Domains & Routes →
   Add route.**
2. Route: `easydriving.nextiadriveops.com/api/*`
3. Zone: `nextiadriveops.com`
4. Save.

This route takes precedence over Pages for matching paths; everything else continues to serve the
SPA. Verify on the **real** domain:

```bash
curl https://easydriving.nextiadriveops.com/api/health
# -> {"ok":true,"service":"easy-driving-booking-api"}

curl https://easydriving.nextiadriveops.com/api/public/centers
# -> 3 centers, no CORS error
```

> Equivalent alternative: add a `routes` entry to `wrangler.toml` and redeploy the Worker instead
> of using the dashboard. The dashboard route is simpler for a one-off.

---

## 8. Configure Google OAuth for the production domain

In the Google Cloud Console (same project whose `GOOGLE_CLIENT_ID`/`SECRET` you set in step 3):

1. **APIs & Services → Credentials → your OAuth Web client → Authorized redirect URIs → Add:**

   ```text
   https://easydriving.nextiadriveops.com/api/auth/google/callback
   ```

   It must match `GOOGLE_REDIRECT_URI` byte-for-byte.
2. **OAuth consent screen → Authorized domains → add** `nextiadriveops.com`.
3. If the consent screen is still in **Testing**, add your admin Google accounts as test users
   (or publish it).
4. The app requests these scopes (already coded; just confirm they're allowed):
   `openid`, `email`, `profile`, `calendar.calendarlist.readonly`, `calendar.freebusy`,
   `calendar.events`.

---

## 9. First sign-in and calendar connection

1. Open `https://easydriving.nextiadriveops.com/api/auth/google/start`.
2. Sign in with an `ADMIN_EMAILS` account and approve the Calendar scopes.
3. You return to `/admin`, signed in. Confirm the session:

   ```text
   https://easydriving.nextiadriveops.com/api/admin/me
   ```

4. In **Admin → Google Calendar**:
   - Click **Load available calendars** (proves the Calendar API is enabled — otherwise 403).
   - Map a **canonical calendar** to each center (and any service overrides).
   - Set each named instructor's **Calendar ID** (Instructors & cars) so FreeBusy + blocking
     events work.
   - Optional: customize the **Event template** (placeholders `{service} {center} {reference}
     {student} {manageUrl} {visibleFields}`; blank = built-in defaults).

---

## 10. End-to-end verification

| Check | Expected |
|---|---|
| `GET /api/health` on the domain | `{"ok":true,...}` |
| `GET /api/public/centers` from the SPA | 3 centers, no CORS errors in console |
| Public booking at `/book` | Slot books; `ED-XXXXXX` reference shown |
| Booking confirmation **Manage** link | Opens `/booking/{ref}?token=…`, shows the booking |
| Cancel from the manage link | Booking cancelled; canonical Google event deleted; student emailed |
| Admin sign-in via Google | Returns to `/admin`; `/api/admin/me` returns the user |
| `calendar/list` in admin | Lists calendars (no 403) |
| Daily cron | Retention job runs at 05:17 UTC (`crons` in `wrangler.toml`) |

Run the full **P0** acceptance set in [`test-plan.md`](test-plan.md) before going live.

---

## 11. Optional: embed in `nextiadriveops.com` pages

The app is fully usable at its own subdomain. If you also want to **iframe** it inside a
`nextiadriveops.com` page, the CSP `frame-ancestors` in
[`public/_headers`](../public/_headers) must allow the embedding host. It currently lists only the
`easydriving.ca` domains:

```text
frame-ancestors 'self' https://www.easydriving.ca https://easydriving.ca
```

Add your host(s), e.g.:

```text
frame-ancestors 'self' https://nextiadriveops.com https://www.nextiadriveops.com
```

Edit **both** the `frame-ancestors` value (leave the rest of the CSP intact), then
`npm run deploy:web` to push the updated headers. A **direct link** needs no header change:

```html
<a href="https://easydriving.nextiadriveops.com/book?center=laval&service=road-test-package">
  Book a road test
</a>
```

URL preselection: `/book?center=<slug>&service=<slug>&lang=fr`.

---

## 12. Rollback / re-deploy notes

- Re-deploys are safe to repeat: `npm run deploy:worker` and `npm run deploy:web` are idempotent.
- Migrations are forward-only — do not hand-edit applied migration files; add a new one.
- Changing `TOKEN_ENCRYPTION_KEY` invalidates stored Google refresh tokens (forces reconnect).
- If `/api/*` returns the SPA HTML instead of JSON, the Worker **route** (step 7) is missing or
  scoped to the wrong zone.
- If admin writes return `403 invalid_origin`, `PUBLIC_SITE_ORIGIN`/`APP_BASE_URL` don't match the
  real hostname — fix `[vars]` and redeploy the Worker.
