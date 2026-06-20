# 00 — Synthetic test data & conventions

This sheet is referenced by every other file in `docs/test-cases/`. Read it once, then
keep it open while you run the cases.

## Email aliases

All test emails use **Gmail plus-aliasing** on a single inbox so every invite/confirmation
lands in one place and is easy to clean up:

| Alias | Used for |
|-------|----------|
| `easydrivingca+alex@gmail.com` | Student "Alex Tremblay" |
| `easydrivingca+marie@gmail.com` | Student "Marie Gagnon" |
| `easydrivingca+sam@gmail.com` | Student "Sam Okafor" |
| `easydrivingca+nadia@gmail.com` | Student "Nadia Benali" |
| `easydrivingca+owner@gmail.com` | Admin owner sign-in (must be in `ADMIN_EMAILS`) |
| `easydrivingca+notallowed@gmail.com` | Unauthorized admin (negative auth test) |
| `easydrivingca+instructor@gmail.com` | New instructor record |

> Gmail ignores everything after `+`, so all of the above deliver to `easydrivingca@gmail.com`.
> If your `ADMIN_EMAILS` is the plain address, the owner alias still authorizes because Google
> normalizes the delivered identity — but to be safe, set
> `ADMIN_EMAILS=easydrivingca+owner@gmail.com,easydrivingca@gmail.com` in `.dev.vars` for local
> testing.

## Standard student cast

| Name | Email | Phone | Licence | Notes |
|------|-------|-------|---------|-------|
| Alex Tremblay | `easydrivingca+alex@gmail.com` | (514) 555-0142 | Class 5 | Primary happy-path student |
| Marie Gagnon | `easydrivingca+marie@gmail.com` | (514) 555-0188 | Class 5 | French-language tests |
| Sam Okafor | `easydrivingca+sam@gmail.com` | (438) 555-0177 | Class 5 | Concurrency / capacity tests |
| Nadia Benali | `easydrivingca+nadia@gmail.com` | (450) 555-0133 | Class 6 | Cancellation / edge cases |

## Relative dates

Replace these tokens with real dates when you run a case:

- **`<TODAY>`** — today, format `YYYY-MM-DD`.
- **`<NEXT-TUE>`** — the next Tuesday (a seeded open weekday, 08:00–18:00). Use for most bookings.
- **`<NEXT-SAT>`** — the next Saturday (09:00–16:00 seeded hours).
- **`<NEXT-SUN>`** — the next Sunday (no seeded hours → closed).

Pick times **well outside the cutoff window** (Road Test cutoff is 4 h; lessons 2 h), e.g.
10:00 or 14:00 on `<NEXT-TUE>`.

## Seeded baseline (after `npm run db:seed:local`)

| Center | slug | Cars (pooled) | Instructors (named) |
|--------|------|---------------|---------------------|
| Laval | `laval` | 3 | Ali, Samir (2) |
| Kirkland | `kirkland` | 2 | Sara (1) |
| Henri-Bourassa | `henri-bourassa` | 2 | Omar (1) |

Services (all base concurrency 4): `road-test-package` (120 min, 1 car + 1 instructor, 4 h
cutoff), `car-rental` (90 min, 1 car, no instructor), `driving-lesson` (60 min, 1 car + 1
instructor), `mock-test`, `parking-lesson`, `highway-lesson`.

## Environment

| Thing | Value |
|-------|-------|
| Frontend | `http://localhost:5173` (or next free port — check the WEB log line) |
| Worker API | `http://localhost:8787` |
| Booking page | `/book` |
| Admin portal | `/admin` |
| DB name | `easy-driving-booking` (local) |

Start everything with `npm run dev` (runs web + worker together).

## D1 command helpers

Read a table (example):

```bash
npx wrangler d1 execute easy-driving-booking --local --command "SELECT slug,name FROM centers;"
```

**Reset to a clean baseline** between test runs (wipes bookings/overrides/test rows but keeps
the seeded catalog). Run each line:

```bash
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_resource_allocations;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_calendar_events;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM booking_form_responses;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM bookings;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM capacity_overrides;"
npx wrangler d1 execute easy-driving-booking --local --command "DELETE FROM rate_limits;"
```

Re-seed the catalog if you ever deleted it: `npm run db:seed:local`.

## How to record results

For each numbered step, mark **Pass / Fail / Blocked** and capture the build (date or git SHA)
and any screenshot. A case passes only when **every** step in it passes.

## Index of cases

See [README.md](README.md) for the full list and recommended order.
