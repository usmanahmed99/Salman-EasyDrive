# Easy Driving — Manual test cases

Step-by-step manual test procedures with concrete synthetic data. Each file is **one use case**
and is self-contained: preconditions, setup commands, click-through steps, expected results, and
D1 verification queries.

## Before you start

1. Read **[00-synthetic-data.md](00-synthetic-data.md)** — the shared student cast, email
   aliases, relative-date tokens, seeded baseline, and the reset commands.
2. Bring up the app: `npm run dev`.
3. Ensure the local DB is migrated and seeded: `npm run db:migrate:local && npm run db:seed:local`.

## Recommended order

| # | Use case | File | Needs Google? |
|---|----------|------|---------------|
| 00 | Synthetic data & conventions | [00-synthetic-data.md](00-synthetic-data.md) | — |
| 01 | Public booking — happy path & validation | [01-public-booking.md](01-public-booking.md) | No |
| 02 | Capacity & conflict rules | [02-capacity-and-conflicts.md](02-capacity-and-conflicts.md) | No |
| 03 | Admin authentication & route guard | [03-admin-auth.md](03-admin-auth.md) | Yes (+ dev bypass) |
| 04 | Dashboard & Emergency Control | [04-dashboard-and-emergency.md](04-dashboard-and-emergency.md) | No |
| 05 | Centers — create / edit / delete | [05-centers-crud.md](05-centers-crud.md) | No |
| 06 | Services — create / edit / disable | [06-services-crud.md](06-services-crud.md) | No |
| 07 | Instructors & cars | [07-instructors-and-cars.md](07-instructors-and-cars.md) | No |
| 08 | Availability — business hours | [08-availability-hours.md](08-availability-hours.md) | No |
| 09 | Form builder | [09-form-builder.md](09-form-builder.md) | No |
| 10 | Google Calendar mappings & sync | [10-google-calendar.md](10-google-calendar.md) | Yes |
| 11 | Bookings list & actions | [11-bookings-actions.md](11-bookings-actions.md) | No |
| 12 | Privacy & retention | [12-privacy-retention.md](12-privacy-retention.md) | No |
| 13 | Security & rate limiting | [13-security.md](13-security.md) | No |

> Cases marked **No** for Google still run fully on a fresh local install. The Calendar case (10)
> and the calendar parts of 01/11 need a connected Google account; without one, they verify the
> graceful-failure path instead (booking stored, status `calendar_sync_failed`).

## Priorities

P0 cases (must pass before launch): 01, 02, 03, 05, 06, 07, 08, 09, 11, 13. P1: 04, 10, 12.

## Relationship to the reference plan

`docs/test-plan.md` is the condensed single-page checklist (good for sign-off). These files are
the **expanded manual scripts** with real data to actually execute. IDs are cross-compatible
(e.g. `PUB-04` appears in both).
