# Deploy production to `book.easydriving.ca` (separate, client-owned account)

Step-by-step guide to publish the Easy Driving booking app at
**`https://book.easydriving.ca/`** in a **separate, client-owned Cloudflare account**, isolated
from the existing dev/staging deployment at `easydriving.nextiadriveops.com`.

This is the production counterpart to [`deploy-nextiadriveops.md`](deploy-nextiadriveops.md)
(which covers the dev/staging launch). The two deployments live in **different Cloudflare
accounts**.

> **Architecture recap.** Two Cloudflare resources serve one origin:
> - **Pages** serves the static SPA (everything except `/api/*`).
> - **Worker** (`easy-driving-booking-api`, `--env production`) serves `/api/*`.
>
> A **Worker route** `book.easydriving.ca/api/*` sends API paths to the Worker; all other paths
> fall through to Pages. The frontend calls **relative** `/api` URLs, so no CORS/CSP change is
> needed once both live on the same hostname.

---

## CI/CD: how dev and prod deploy

Deploys are automated by branch:

| Push to  | Workflow                              | Wrangler env       | Target                          | GitHub Environment |
| -------- | ------------------------------------- | ------------------ | ------------------------------- | ------------------ |
| `dev`    | `.github/workflows/deploy-dev.yml`    | default            | `easydriving.nextiadriveops.com` | `development`      |
| `master` | `.github/workflows/deploy-prod.yml`   | `--env production` | `book.easydriving.ca`           | `production`       |

Each GitHub Environment holds its own `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (dev and
prod are separate Cloudflare accounts). Flow: work on `dev` → auto-deploys dev; merge `dev` →
`master` → auto-deploys prod (after the `production` environment's approval gate, if a reviewer
is set). Prod-specific config lives under `[env.production]` in `wrangler.toml`.

---

## Progress tracker

| Step | Status |
| --- | --- |
| In-repo code (`[env.production]`, split CI workflows, CSP, npm scripts) | ✅ done (on `dev` branch) |
| `dev` branch created + auto-deploys to dev account | ✅ verified |
| Prod API token created (client account) | ✅ Workers Scripts/Routes, Pages, KV, D1 — all Write |
| GitHub `production` env: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | ✅ set |
| Repo-level CF secrets deleted (redundant) | ⬜ (GitHub UI) |
| **Zone `easydriving.ca` added + active in prod account** | ✅ active on Cloudflare; M365 CNAMEs set to DNS-only (autodiscover/email/lync/msoid/sip/_domainconnect); MX/SPF/TXT intact |
| Prod D1 created → id in `wrangler.toml` | ✅ `3faeec26-…`, schema migrated |
| Prod Worker secrets (4) set | ✅ |
| Google OAuth for prod (separate account) | ✅ created; calendars mapped post-launch |
| Dev → prod data migration (excl. bookings) | ✅ 5 centers / 10 services / 4 resources; 0 bookings, 0 users, calendar IDs blanked |
| Worker deployed (`--env production`) + route + cron | ✅ version `7c1a706e`; `/api/health` + `/api/public/centers` return 200 with migrated data |
| Pages project + SPA deployed | ✅ `easy-driving-booking-3ad.pages.dev` serves the SPA |
| Attach `book.easydriving.ca` Pages custom domain | ⬜ **dashboard only** — Pages project → Custom domains → add `book.easydriving.ca` (replaces placeholder CNAME) |
| Map prod calendars in Admin → Google Calendar | ⬜ post custom-domain |
| Turnstile | ⏭️ deferred (optional) |

---

## 1. DNS migration — `easydriving.ca` GoDaddy → Cloudflare

`easydriving.ca` is registered at **GoDaddy** (`ns13/ns14.domaincontrol.com`) and runs a **live
website + Microsoft 365 email** that must keep working. The **client controls GoDaddy**. Moving
nameservers transfers *all* DNS authority to Cloudflare, so every live record below must exist in
the Cloudflare zone **before** the client flips nameservers, or the site/email breaks.

### Live records to preserve

Captured from public DNS — cross-check these against Cloudflare's import scan:

| Type  | Name        | Value                                                           | Purpose                    | Notes |
| ----- | ----------- | -------------------------------------------------------------- | -------------------------- | ----- |
| A     | `@` (apex)  | `198.12.216.61`                                                | Website                    | keep **DNS-only** (grey cloud) during migration |
| CNAME | `www`       | `easydriving.ca`                                               | Website                    | keep DNS-only |
| MX    | `@`         | `easydriving-ca.mail.protection.outlook.com` (priority 0)      | **M365 email**             | critical |
| CNAME | `autodiscover` | `autodiscover.outlook.com`                                  | M365 Outlook autodiscover  | critical |
| TXT   | `@`         | `v=spf1 include:spf.protection.outlook.com -all`               | Email SPF                  | critical |
| TXT   | `@`         | `MS=ms99229707`                                                | M365 domain verification   | |
| TXT   | `@`         | `google-site-verification=XehqzMZu-irgNx4-hFlM6-PtVMdvXbSUDC0uIkpwcYA` | Google verification | |
| TXT   | `@`         | `google-site-verification=keK4ugYBNxE9W6YasSNzPxBHA1lZUopsd0ymyJteo5A` | Google verification | |
| TXT   | `@`         | `google-site-verification=vOWmSJjfXtkX-P4ZdB6DmkA_1sUG7Qyn_Z0A5RuEUjA` | Google verification | |
| TXT   | `@`         | `google-site-verification=g4ixDZYGSxSD-K-P3ULPr3WTkaoS3Sm2o-rSVyB0lu8` | Google verification | |

- **6 TXT records on apex** (1 SPF + 1 MS + 4 Google). Confirm all 6 after import — Cloudflare's
  scan sometimes merges or drops multi-TXT sets.
- **No DKIM / DMARC exist** (both NXDOMAIN). Do not add any.
- The `book` subdomain is created by the Pages custom-domain step (§5). If a manual
  `book → easydriving.ca` CNAME was added, **remove it / let Pages replace it** — pointing `book`
  at the apex sends it to the old website, not the app.
- **Proxy status matters.** Cloudflare's import defaulted several Microsoft/email CNAMEs to
  **Proxied** — they MUST be **DNS only** (grey cloud), since Cloudflare only proxies HTTP(S) and
  proxying breaks M365/Teams auto-config. Set DNS-only on: `autodiscover` → autodiscover.outlook.com,
  `email` → email.secureserver.net, `lyncdiscover` → webdir.online.lync.com,
  `msoid` → clientconfig.microsoftonline-p.net, `sip` → sipdir.online.lync.com,
  `_domainconnect` → _domainconnect.gd.domaincontrol.com. Apex A, `www`, MX, SRV, and all TXT
  should also be DNS-only. Only `book` (the app) is Proxied.

### Procedure

1. **(You)** Prod Cloudflare account → **+ Add → Existing domain** → `easydriving.ca` → **Free**
   plan. Let Cloudflare scan the existing records.
2. **(You)** Diff the imported records against the table above. Manually add anything missing —
   especially the MX, `autodiscover`, and all 6 TXT records. Keep apex `A` and `www` **DNS-only**
   (grey cloud) so the existing site behaves identically.
3. **(You)** Copy the two assigned `*.ns.cloudflare.com` nameservers.
4. **(Client, in GoDaddy)** My Products → `easydriving.ca` → DNS → Nameservers → Change → "I'll
   use my own nameservers" → replace with the two Cloudflare nameservers → Save.
5. Wait for the zone to go **Active** (minutes–48h). Verify:
   ```bash
   nslookup -type=ns easydriving.ca
   # expect the two *.ns.cloudflare.com nameservers
   ```

### Client message template

> **Subject: Action needed — point easydriving.ca nameservers to Cloudflare**
>
> Hi [name],
>
> To launch the new booking system at `book.easydriving.ca`, we need to switch the domain's
> nameservers to Cloudflare. **Your existing website and email will keep working** — we've
> already copied all current DNS records into Cloudflare.
>
> In GoDaddy:
> 1. Go to **My Products → easydriving.ca → DNS → Nameservers → Change**.
> 2. Select **"I'll use my own nameservers"**.
> 3. Replace the existing nameservers with these two:
>    - `____.ns.cloudflare.com`
>    - `____.ns.cloudflare.com`
> 4. Save.
>
> It takes a few minutes to a few hours to take effect. Please let me know once you've saved it.

---

## 2. Create the prod D1 database

After the zone is active and Wrangler is authenticated against the **prod** account:

```bash
npx wrangler whoami      # confirm the client/prod account
npx wrangler d1 create easy-driving-booking --env production
```

Copy the returned `database_id` into the `[[env.production.d1_databases]]` block in
`wrangler.toml` (replace `REPLACE_WITH_PROD_D1_ID`). Then build the schema:

```bash
npm run db:migrate:remote:prod
```

> Do **not** also run `npm run db:seed:remote:prod` if you intend to migrate real config data from
> dev (§4) — pick one path, not both, to avoid duplicate-key conflicts.

---

## 3. Prod Google OAuth + Calendars (separate account)

Dev and prod use **different Google Calendars** (a separate Google account for the business).
Calendar IDs are **not** hardcoded — they live in D1 data and runtime OAuth — so this is config,
not a code change.

1. **Prod OAuth client:** in the prod-owned Google Cloud project, create (or reuse) an OAuth
   client. **Enable the Google Calendar API.** Add the authorized redirect URI:
   `https://book.easydriving.ca/api/auth/google/callback` (must match `GOOGLE_REDIRECT_URI` in
   `[env.production].vars`, which is already set). Add `https://book.easydriving.ca` as an
   authorized JavaScript origin.
2. **Set prod Worker secrets** (fresh values, encrypted in Cloudflare):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID --env production
   npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
   npx wrangler secret put SESSION_SECRET --env production        # long random
   npx wrangler secret put TOKEN_ENCRYPTION_KEY --env production   # long random, MUST differ from SESSION_SECRET
   # TURNSTILE_SECRET_KEY intentionally skipped — optional, bot check is bypassed when unset
   ```
3. **Re-authenticate in prod admin:** sign in via `/api/auth/google/start` on prod. This creates a
   fresh `google_connections` row, with the refresh token encrypted using the **prod**
   `TOKEN_ENCRYPTION_KEY`. The dev `google_connections` row must **NOT** be migrated — it is tied
   to the dev OAuth app and dev encryption key.
4. **Re-map calendars:** in Admin → Google Calendar, map a canonical calendar to each
   center/service and set instructor calendar IDs — using the **prod** account's calendars. If
   config data was migrated from dev (§4), `resources.calendar_id` and the `calendar_mappings`
   table will hold **dev** calendar IDs that must be overwritten here.

---

## 4. Dev → prod data migration (exclude booked appointments)

Goal: seed prod with the **catalog/config** built in dev (centers, services, forms, resources,
hours, calendar mappings) but **not** any bookings or dev-specific runtime/account data.

### Table classification (from `migrations/0001_initial.sql`)

**MIGRATE — config / catalog:**
`centers`, `center_hours`, `services`, `service_centers`, `service_hours`, `forms`,
`form_versions`, `form_fields`, `resource_groups`, `resources`, `resource_group_members`,
`service_resource_requirements`, `capacity_overrides`, `calendar_mappings`, `retention_settings`.

**EXCLUDE — bookings:**
`bookings`, `booking_form_responses`, `booking_resource_allocations`, `booking_calendar_events`.

**EXCLUDE — dev runtime / account (prod regenerates these):**
`users`, `sessions`, `google_connections`, `audit_log`, `retention_jobs`, `rate_limits`.

### Approach

Export only the MIGRATE tables from the dev D1, then import into prod (after §2 has built the
schema). This **replaces** running the generic seed files.

- **Export** each MIGRATE table from dev, e.g.:
  ```bash
  npx wrangler d1 export easy-driving-booking --remote --table centers --output centers.sql
  # ...one per MIGRATE table, omitting all EXCLUDE tables
  ```
- **Import** into prod in FK-dependency order:
  ```bash
  npx wrangler d1 execute easy-driving-booking --remote --env production --file centers.sql
  # then: center_hours → services → service_centers → service_hours → forms →
  #       form_versions → form_fields → resource_groups → resources →
  #       resource_group_members → service_resource_requirements →
  #       capacity_overrides → calendar_mappings
  ```
- **Post-import:** clear or re-map `resources.calendar_id` + `calendar_mappings.calendar_id` to
  prod calendars (§3.4). Review that `retention_settings` is appropriate for prod.

> A dedicated one-off export/import script will be prepared when we reach this step (not committed
> to the app). Open decision: blank calendar IDs at export time vs. re-map them in the admin UI
> after import.

---

## 5. Deploy + attach domain

```bash
npm run typecheck && npm test && npm run build
npm run deploy:worker:prod      # first deploy registers the BookingLock Durable Object migration
npx wrangler pages deploy dist --project-name=easy-driving-booking --branch=main
```

In the prod account's Pages project, attach **`book.easydriving.ca`** as a custom domain (this
creates the proxied DNS record). Confirm the Worker route `book.easydriving.ca/api/*` exists so
API paths hit the Worker and everything else falls through to Pages.

Once verified manually, the ongoing flow is automatic: merge `dev` → `master` deploys prod.

---

## 6. Verify before launch

```bash
curl https://book.easydriving.ca/api/health          # -> {"ok":true,"service":"easy-driving-booking-api"}
curl https://book.easydriving.ca/api/public/centers  # seeded/migrated centers, no CORS errors
curl https://book.easydriving.ca/api/public/config   # Turnstile site key + Google client id wired
```

Then in a browser against `https://book.easydriving.ca`:

1. SPA loads, booking UI renders, no console/CORS errors on `/api/*`.
2. `/admin` → sign in with Google → redirects to `/admin`; `GET /api/admin/me` returns the admin.
3. Create a test booking → confirm the booking-manage link uses `book.easydriving.ca`, a Google
   Calendar event is created on the **prod** calendar, and double-booking is blocked.
4. After the next `*/30` cron tick, confirm calendar reconciliation runs in the prod account.
