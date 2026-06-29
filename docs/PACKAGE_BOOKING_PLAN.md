# Package Booking — Implementation Plan

## Goal

Let the school offer **packages**: an admin-defined bundle of "N sessions of service A,
M of service B, …". A client books a package by **picking a slot for every session**, fills
the form once, and receives calendar invitations for all sessions — each invite's description
includes the **full package schedule**. Rescheduling and cancelling continue to operate
**per single session**, with no special-case logic.

### Locked decisions
- **Scheduling:** client picks every slot individually (step through session-by-session).
- **Pricing:** package has its own `price_display` (independent of the member services).
- **Conflict at confirm:** **all-or-nothing** — if any chosen slot is taken at final confirm,
  reject the whole package, tell the client which session failed, let them re-pick.

### Core principle
A package session is just a normal row in `bookings` with a new `package_booking_id` pointing
at a parent record. Everything downstream — `booking_resource_allocations`,
`booking_calendar_events`, availability locks, cancel, reschedule — operates on those child
rows **unchanged**. The only new lifecycle code is *creation* (atomic multi-session) and a
*calendar description enrichment* (full schedule).

---

## 1. Data model (migration `migrations/00NN_packages.sql`)

```sql
CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_fr TEXT NOT NULL DEFAULT '',
  price_display TEXT,                       -- package's own price (decided)
  price_tax_mode TEXT NOT NULL DEFAULT 'none',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE package_items (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE package_centers (              -- mirrors service_centers
  package_id TEXT NOT NULL REFERENCES packages(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(package_id, center_id)
);

CREATE TABLE package_bookings (             -- the parent linking record
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,           -- PKG-XXXXXX
  package_id TEXT NOT NULL REFERENCES packages(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  public_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One new nullable column on the existing bookings table:
ALTER TABLE bookings ADD COLUMN package_booking_id TEXT REFERENCES package_bookings(id);
CREATE INDEX idx_bookings_package ON bookings(package_booking_id);
```

Notes:
- No `quantity`-derived denormalization in `package_bookings`; the child `bookings` rows ARE
  the sessions. `package_bookings` exists only to link siblings, hold the shared public token,
  and give the package a single reference.
- We do **not** add a status to `package_bookings`. The group's status is derived from its
  children (all confirmed / some cancelled / etc.) when displayed.

---

## 2. Backend

### 2a. Public read endpoints
- Extend `GET /api/public/services?centerSlug=…` response, or add
  `GET /api/public/packages?centerSlug=…`, returning enabled packages for the center with their
  expanded item list (service slug, name, duration, quantity) and the package price.
  → New query + serializer near the existing services handler in `worker/index.ts`.

### 2b. Create endpoint — `POST /api/public/package-bookings`
Request body:
```jsonc
{
  "centerSlug": "…",
  "packageSlug": "…",
  "language": "en",
  "formVersion": 3,
  "answers": { … },                 // filled once
  "sessions": [                      // one entry per session, in order
    { "serviceSlug": "…", "start": "2026-07-01T14:00:00Z" },
    { "serviceSlug": "…", "start": "2026-07-08T14:00:00Z" }
  ],
  "turnstileToken": "…"
}
```

**The atomicity problem (important):**
`BookingLock` is a Durable Object keyed **per `center:date`** (`worker/index.ts:551`). A package's
sessions span multiple dates → multiple DO instances. So we cannot wrap all sessions in one
`blockConcurrencyWhile`. Approach for all-or-nothing:

1. **Validate-then-commit in two phases inside a new orchestrator** (runs in the main worker,
   not a single DO):
   - **Phase A — reserve/validate:** for each session, route to its `center:date` DO via a new
     `/package-reserve` route that runs `checkExactSlot` + `assertNoResourceConflict` and
     **inserts the child booking row in status `pending_confirmation`** (with the
     `package_booking_id` already set) inside that DO's `blockConcurrencyWhile`. This holds the
     resource via the existing conflict checks (pending rows are counted at
     `worker/booking.ts:143`). Return success/failure per session.
   - **Phase B — finalize:** if **all** sessions reserved, flip them to `confirmed` and run
     `syncBookingCalendar` for each. If **any** failed, delete all inserted child rows + the
     parent (compensating rollback) and return a `409` naming the failed session index.
2. The parent `package_bookings` row + form response are written before Phase A; rolled back on
   failure. Form response can live once on the parent, or be copied to each child's
   `booking_form_responses` so the existing per-booking code (calendar sync, manage page) works
   untouched — **copy to each child** (simpler, keeps every child self-sufficient).

This reuses `checkExactSlot` / `assertNoResourceConflict` (`worker/booking.ts:153-167`) and the
existing insert shape (`worker/booking.ts:189-236`). The new code is the orchestration + rollback,
factored as `confirmPackageBooking(env, payload)` in a new `worker/package.ts`.

> Edge note to call out at build time: pending rows from an abandoned Phase A must be cleaned up.
> Add a short TTL sweep (or delete-on-failure only + accept that a crashed request leaves a
> pending row until the existing reconcile/cron clears it). Will confirm approach during build.

### 2c. Calendar — full schedule in every invite
- Add a `packageSchedule` field to `TemplateFields` (`worker/booking.ts:534`). When a booking has
  a `package_booking_id`, `syncBookingCalendar` loads all sibling sessions (service name + date/time
  via `formatBookingDateTime`) and builds a multi-line schedule block.
- Append it to `defaultDescription` (`worker/booking.ts:549`) when present, and expose
  `{{packageSchedule}}` as a template token in `renderTemplate`.
- Invites still go out **per session** (one canonical event each), so Google emails the client an
  invite per session — but each describes the whole plan. No change to event creation itself.

### 2d. Cancel / reschedule — NO backend change
`POST /api/public/bookings/{ref}/cancel` and `…/reschedule` already operate on a single booking
(`worker/index.ts:561-595`). A package session is a normal booking, so they work as-is. The parent
record is left in place; the group's displayed status simply reflects the surviving children.

---

## 3. Admin side (`src/AdminPortal.tsx`)

### 3a. New "Packages" nav section
- Add `"packages"` to the `AdminSection` union (`AdminPortal.tsx:54`) and a nav entry
  (`AdminPortal.tsx:83`) with an icon (e.g. `Boxes`/`Package` from lucide).
- Wire `if (section === "packages") return <PackagesScreen … />` (`AdminPortal.tsx:3131` area).

### 3b. `PackagesScreen` component (model on `ServicesScreen`)
- List packages; create/edit modal with: EN/FR name + description, slug (immutable after create,
  reuse the `SlugDisplay` helper at `AdminPortal.tsx:164`), own price + tax mode, enabled toggle,
  per-center availability checkboxes.
- **Line items editor:** repeatable rows of `service (select) × quantity (number)` with add/remove
  and ordering. Shows total session count.
- Admin CRUD endpoints under `/api/admin/packages` (list/create/update/delete + items), alongside
  the existing admin service endpoints.

### 3c. Bookings screen — show package groups
- In `BookingsScreen` (`AdminPortal.tsx:3129`), group rows sharing a `package_booking_id` under an
  expandable parent labeled `Package: {name} ({ref})`.
- Each child row keeps its **own Cancel / Reschedule** buttons (existing handlers, unchanged).
- A "Package" tag on grouped rows; clicking the parent expands/collapses siblings.

---

## 4. Client side (`src/PublicBooking.tsx`)

Existing stages: `center → service → schedule → details → confirmed` (`PublicBooking.tsx:38`).

### 4a. Offering selection
- The service-picker stage also lists packages (badge "Package", subtitle "N sessions", package
  price). Selecting a package switches the flow into package mode.

### 4b. Schedule stage — pick every slot
- Expand `package_items` quantities into an ordered session list
  (e.g. `[S1, S1, S1, S2, S2, S2, S2, S2, S3]`).
- Reuse the existing `MiniCalendar` + availability call **per session**, with a progress header
  ("Session 3 of 9 — {service name}"). Each pick calls the existing `getAvailability` for that
  session's service. Picked slots accumulate in component state.
- Prevent the client from picking the same slot twice within the package (client-side guard;
  server still enforces).

### 4c. Details + confirm
- Form filled once (existing form rendering).
- Submit → new `createPackageBooking(payload)` in `src/api.ts` → `POST /api/public/package-bookings`.
- On `409` partial-conflict, show which session failed and return the client to that session's
  schedule step to re-pick (all-or-nothing).

### 4d. Confirmation + manage
- Confirmation lists the **full schedule** (all sessions, each with its reference).
- `ManageBooking` (`src/ManageBooking.tsx`) continues to manage each session individually — a
  package booking surfaces as its set of sessions, each independently cancellable/reschedulable.

---

## 5. Shared types (`shared/types.ts`)
- `Package`, `PackageItem`, `PackageBookingConfirmation` (carrying the array of per-session
  `BookingConfirmation`s + the package reference).

---

## 6. Build order (suggested)
1. Migration + seed example package.
2. `shared/types.ts` additions.
3. Admin: `PackagesScreen` + `/api/admin/packages` CRUD (so packages can be defined/tested).
4. Public read endpoint for packages.
5. `worker/package.ts` — `confirmPackageBooking` orchestrator (two-phase, rollback) + DO
   `/package-reserve` route + `POST /api/public/package-bookings`.
6. Calendar `packageSchedule` enrichment.
7. Client: offering selection → multi-slot schedule → confirm → full-schedule confirmation.
8. Admin bookings grouping.
9. Tests: package CRUD, all-or-nothing conflict, per-session cancel leaving siblings intact,
   calendar description contains full schedule.

## 7. Open items to confirm during build
- Pending-row cleanup strategy for abandoned Phase A (TTL sweep vs delete-on-failure only).
- Whether packages may span multiple centers (plan assumes **single center per package booking**,
  which keeps the parent's `center_id` meaningful; sessions across dates is already handled).
- Whether to copy form response to each child (plan: **yes**, for self-sufficiency).
