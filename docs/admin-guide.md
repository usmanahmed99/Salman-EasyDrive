# Easy Driving School Admin Guide

This guide covers day-to-day operating processes for owners, administrators, and staff.

## Today dashboard

The Today dashboard is the main operating screen. Open it every morning before operations begin.

It shows:

- Total bookings for today and how many are confirmed
- Cars currently in use and active instructors
- Google Calendar synchronization warnings
- The list of the selected day's bookings with time, service, center, student name, and assigned instructor
- Center open/closed status
- Any active emergency controls

Use the day arrows to step forward or back through other days, and **Today** to jump back. When a day has many bookings the list is **paginated** (8 per page) with page controls at the bottom, so a busy day stays readable. Click **All bookings** to open the full Bookings screen with search and filters.

The **Reconcile calendar** button (top of the bookings card, also available on the Bookings screen) manually checks Google Calendar for events that were deleted directly in Google and frees those slots in the app — see [Reconcile calendar](#reconcile-calendar).

### Recommended morning check

1. Open **Today**.
2. Confirm every center that should operate shows as open.
3. Review active emergency controls — remove any that are no longer needed.
4. Check for Calendar sync warnings. A booking with a sync issue still exists in the system; the student just may not have received their invite yet.
5. Compare the first bookings of the day against the operational Google Calendars.
6. Confirm unavailable instructors have marked themselves Busy in their assigned Google Calendar.

### Calendar sync warnings

A yellow warning on Today means one or more bookings failed to create their Google Calendar event. The booking is confirmed and saved — the sync failure does not cancel it. To fix:

1. Open **Bookings**.
2. Find the booking with status **Sync issue**.
3. Open its details and click **Retry sync**.
4. Confirm the event appears once on the canonical calendar.
5. Confirm the student receives exactly one invitation.

## Emergency Control

Emergency Control is the fastest way to change public availability without touching any configuration. Use it for temporary, time-bounded situations.

Use it when:

- A center must close unexpectedly (weather, building access, staff absence)
- A service must stop temporarily
- Fewer cars are available than normal
- An instructor is suddenly unavailable and has not blocked their Google Calendar
- You need to temporarily reduce or increase slot capacity

### Close an entire center

1. Open **Today**.
2. Expand **Emergency Control**.
3. Under **What do you want to change?**, choose **Close a center**.
4. Select the center (e.g. Laval).
5. Choose the affected time range.
6. Enter a reason such as `Weather` or `Building closed`.
7. Select **Apply immediately**.
8. Open the public booking page in a private/incognito window and confirm no slots appear for that center during the closed period.

Center closure has the highest priority and blocks every service at that center for the duration.

### Close one service

Example: Road Test Package is unavailable tomorrow morning at Kirkland.

1. Choose **Close a service**.
2. Select the center (Kirkland).
3. Select the service (SAAQ Road Test Package).
4. Choose **Tomorrow** or a custom date and time range.
5. Add an operational reason.
6. Apply the control.
7. Verify that other Kirkland services remain available on the public booking page.

### Limit service capacity

Example: Laval normally has three cars but only one is available today.

1. Choose **Limit service capacity**.
2. Select Laval.
3. Select the service (e.g. Car Rental Only).
4. Choose **Rest of today**.
5. Set maximum concurrent bookings to `1`.
6. Enter a reason such as `One car in maintenance`.
7. Apply the control.
8. Test availability from the public booking flow to confirm only one slot is bookable at a time.

### Block an instructor or car

Use this when an instructor cannot take bookings but has not added a Busy event to their Google Calendar.

1. Choose **Block instructor or car**.
2. Select the center.
3. Select the named instructor or vehicle.
4. Select the affected time range.
5. Add a reason.
6. Apply the control.

The preferred instructor workflow is to create a Busy event in Google Calendar directly — that is checked automatically. Resource blocks are most useful for owner-controlled exceptions or when an instructor does not have access to their Google Calendar at the moment.

### Remove an active control

1. Open the active controls list on the Today dashboard.
2. Confirm the center, target, period, and reason match what you intend to remove.
3. Click the remove icon next to the control.
4. Recheck public availability to confirm slots have returned.

Do not remove a control until the underlying operational problem is fully resolved.

## Bookings

Open **Bookings** to review, search, and manage all scheduled appointments.

### Searching and filtering

Use the search bar to find a booking by student name, booking reference (e.g. ED-251002), service, center, or **instructor** name. Narrow results with the dropdown filters — **status**, **center**, **service**, and **instructor** — plus a **date range**. Filters combine (all must match); click **Clear** to reset them all at once.

The bookings table includes an **Instructor** column. This shows the *named* instructor assigned to the booking. Two cases show a dash (`—`) instead of a name:

- The service uses a **pooled** instructor group (no specific person is named per booking), so there is no individual to display.
- The service requires **no instructor** (e.g. car rental only).

Because the instructor filter and column rely on named allocations, filtering by instructor will not surface bookings handled by a pooled group.

### Booking statuses

| Status | Meaning |
|---|---|
| `confirmed` | Booking is saved and Google Calendar sync succeeded. Student has received their invite. |
| `calendar_sync_failed` | Booking is saved in the system but the Google Calendar event could not be created. Use Retry sync. |
| `pending_confirmation` | Reserved for future approval workflows. |
| `cancelled_by_student` | Student cancelled using their personal manage link. |
| `cancelled_by_admin` | A staff member cancelled the booking from this portal. |
| `rescheduled` | The original booking was replaced. A new booking was created. |
| `completed` | The appointment took place. |
| `no_show` | Student did not attend. |

### Cancel a booking

1. Find the booking using search or filters.
2. Confirm the booking reference and student.
3. Click **Cancel** and record the reason.
4. Confirm the slot becomes available again on the public booking page.
5. The student's Google Calendar event is deleted automatically with a cancellation notification. Instructor blocking events are removed silently.

The **cancellation cutoff** only restricts the **student's** self-service link — once it passes, the student can no longer cancel online and is told to call the school. **Admin cancellation here is never blocked by the cutoff**; you can cancel at any time.

The booking is always cancelled in the database even if a Google Calendar deletion fails.

### Retry a failed calendar sync

1. Find the booking (filter by status **Sync issue**).
2. Open the booking details.
3. Confirm the center or service has a canonical Calendar mapping on the **Google Calendar** screen.
4. Confirm the Google connection is active (Google Calendar screen → Connected status).
5. Click **Retry sync**.
6. Confirm one event appears on the canonical calendar and the student received one invite.

### Reconcile calendar

The **Reconcile calendar** button (on both the Today dashboard and the Bookings screen) reconciles app bookings against Google Calendar on demand. It is the manual version of a job that otherwise runs automatically every 30 minutes.

What it does: for every future, still-active booking, it checks whether the canonical Google event still exists. If staff deleted the event **directly in Google Calendar**, the app treats that as a cancellation — it cancels the booking (status `cancelled_by_admin`, flagged *"Calendar deleted externally"*), frees the slot, and removes the instructor/car blocking events.

Use it when someone deleted an event straight from Google and you want the freed slot to reflect in the app immediately rather than waiting for the next automatic run.

**Scope and limits — what it does not do:**

- It is **one-directional** (Google → app). It does not push app changes back to Google; that is what **Retry sync** does per booking.
- It only reacts to **deleted** events. An event that was **moved or edited** in Google is not detected — the app keeps the original time. To change a time, use **Reschedule** in the app, not Google.
- It does not create app bookings for events added directly in Google.
- The manual button forces a check across **all centers right now**; the automatic 30-minute job only checks centers currently within their opening hours.

### Create a booking on a student's behalf (ad-hoc admin booking)

Use **New booking** (top of the Bookings screen) to book for a student over the phone or in person.

1. Click **New booking**.
2. Select the center and service. Enter the student's name (required) and optionally email and phone.
3. Pick a time using the **availability picker** (see [The availability picker](#the-availability-picker) below).
4. Click **Create booking**.

**What admin booking overrides — and what it does not.** An admin booking is allowed to ignore:

- the **booking cutoff** (you can book inside the lead-time window, or even for a past time);
- **opening hours** and **temporary closures** (outside-hours, center-closed, service-closed);
- **service capacity** limits (base concurrency / capacity overrides).

It will **not** override a genuine resource conflict: if the specific instructor or car the service needs is already booked at that time, the booking is refused with *"The selected resource is already booked at this time."* This is deliberate — overrides give flexibility for exceptions, but never create a real double-booking. If you must free the resource, cancel or reschedule the conflicting booking first, or block/adjust resources via Emergency Control.

The minimal admin form captures only name/email/phone — it does not collect the full public service form. The student still receives a Google Calendar invite if an email is provided.

### Reschedule a booking

Rescheduling is one click — it keeps the same booking (and reference), moves it to a new time, updates the resource allocations, and moves the Google Calendar event so the student's invite is updated automatically (no separate email is sent).

1. Find the booking using search or filters.
2. Click the **reschedule** (calendar) icon on its row.
3. Pick the new time with the **availability picker**.
4. Click **Reschedule**.

The same override rules as admin booking apply: cutoffs, hours, and closures are bypassed, but the move is **blocked if the required instructor or car is already booked** at the new time.

### The availability picker

Both **New booking** and **Reschedule** show an inline picker so you can see what is actually open instead of guessing a time:

- Choose a **day**; the grid shows that day's slots for the selected center/service.
- **White** slots are fully available — click to select.
- **Amber** slots are blocked only by an overridable rule (cutoff, hours, or a closure). They remain clickable because admins may override those — the booking will go through.
- **Greyed / struck-through** slots have a real **resource conflict** (instructor or car taken) and are disabled — they cannot be booked even by an admin.
- Use **Or enter an exact time** to type any time directly (useful when the day is closed and shows no grid, or for an off-grid time).

A day that is fully closed shows no grid; use the exact-time field to override.

### Student self-service cancel link

Every booking confirmation includes a unique **Manage or cancel** link in the Google Calendar invite description. The student clicks it, views their booking, and can cancel without logging in — subject to the service cancellation cutoff. Once the cutoff passes, the link shows a message to call the school.

## Centers

Each center controls public name, address, timezone, business hours, enabled services, resource groups, and Google Calendar mapping.

### Add a center

1. Open **Centers**.
2. Click **Add center**.
3. Enter a unique slug (URL identifier), e.g. `west-island`. The slug appears in the public booking URL.
4. Enter the public name and optional address.
5. Keep timezone set to `America/Montreal` unless the center is in a different timezone.
6. Save, then open the center to set business hours, attach services, and create resource groups.
7. Go to **Google Calendar** and add a canonical mapping for the new center.
8. Test at least one public booking before announcing the center.

### Set business hours

Open the center and go to **Availability rules** → select the center → set the days and times the center accepts bookings. Hours must be set for each weekday separately. Days with no hours enabled will show no slots on the public booking page.

### Ordering centers

Drag a center card by the grip handle (top-left of each card) to reorder the list. The order you set is saved immediately and is the **same order students see** when choosing a center on the public booking page — so put your most common or highest-priority centers first. Newly added centers appear at the end until you move them.

### Disable versus delete

- **Disable** a center when it may return later. Existing bookings are unaffected.
- **Delete** only when the center has no future bookings and should never return. The system refuses deletion if future confirmed bookings exist.

## Services

Each service defines what students can book, how long it takes, what it costs, which form they fill in, and which resources it requires.

### Ordering services

Drag a service by the grip handle (left of each row) to reorder the list. The order you set is saved immediately and is the **same order students see** when choosing a service on the public booking page — so put your most common or highest-priority services at the top. Newly added services appear at the end until you move them.

### Key service settings

| Setting | What it controls |
|---|---|
| Duration | The length of the appointment shown to the student |
| Buffer before / after | Extra operational time added around the slot — the instructor or car is blocked for this extra time |
| Slot interval | How often a new slot starts (e.g. every 30 min) |
| Booking cutoff | How far in advance a *public* booking must be made (e.g. 2 hours before). Admin booking and reschedule override this. |
| Cancellation cutoff | How close to the appointment *student* self-service cancellation is blocked. Admin cancellation is never blocked. |
| Base concurrency | How many bookings of this service can run at exactly the same time. Admin booking can exceed this; a real resource conflict still cannot. |
| Resource requirements | How many cars and instructors each booking of this service needs |

### Resource requirements

Set these on the **Edit service** form under **Resource requirements**:

- **Cars**: number of vehicles needed per booking (usually 1)
- **Instructors**: number of instructors needed (1 for lessons, 0 for car rental only)
- **Seats**: for group/theory sessions
- **Generic**: for any other named resource type

Setting a value to 0 means that resource type is not required for this service. The availability engine will only allow a slot if enough free resources exist in the center's resource groups.

### Change a service safely

1. Review existing future bookings before changing duration or buffers — existing allocations do not auto-update.
2. Change one rule group at a time (e.g. don't change duration and resource requirements in the same save).
3. Save bilingual names and descriptions.
4. After saving, test public availability at every enabled center.
5. Make a test booking to confirm the slot, form, and calendar event all work correctly.

## Instructors and cars

### Named instructors

Named instructors appear in the system as individual resources. Each can be assigned to a center, a resource group, and a Google Calendar.

When a booking requiring an instructor is confirmed, the engine automatically picks a free instructor from the center's instructor group. The student never sees which instructor is assigned.

To add an instructor:

1. Open **Instructors & cars**.
2. Click **Add instructor**.
3. Enter name, email, and assign to a center group.
4. Go to **Google Calendar** → load available calendars → assign the instructor's personal calendar from the dropdown → Save.

The assigned calendar is used for two things:
- **Blocking events**: when the instructor is booked, a blocking event is written to their calendar so they can see their schedule.
- **FreeBusy check**: the booking engine checks this calendar before offering a slot. If the instructor has any Busy event (personal, vacation, another app), no slots using that instructor will appear.

### Instructor availability process

1. Instructor opens their assigned Google Calendar.
2. Instructor creates a normal event and marks it **Busy**.
3. Use titles like `Unavailable`, `Vacation`, or `Personal appointment`.
4. The booking app reads these automatically — no login or action in this portal required.

### Pooled car capacity

Cars are managed as a pool, not as named individuals (unless you create named vehicle resources). Each center has a car group with a capacity number (e.g. Laval Cars = 3).

To change car capacity:

1. Open **Instructors & cars**.
2. Find the car group for the center.
3. Update the capacity number and save.

The engine will allow bookings up to the pool size concurrently. Set capacity to 0 to effectively disable car-requiring services at that center.

## Availability rules

Availability is calculated in this exact order. If any check fails, the slot is blocked:

1. Center business hours
2. Service-specific hours (if set)
3. Booking cutoff (student cannot book too close to the start time)
4. Operational duration and buffers
5. Center closure override
6. Service closure override
7. Named resource block override
8. Temporary service concurrency override
9. Normal service concurrency (base concurrency setting)
10. Google Calendar FreeBusy for each required instructor/vehicle
11. Existing D1 bookings and resource allocations

### Buffer example

A 60-minute lesson with a 10-minute buffer after runs 10:00–11:00. The operational window is 10:00–11:10. The same instructor cannot be allocated to any booking starting before 11:10.

### Debugging unavailable slots

If a slot should be available but isn't, admins can use the debug availability endpoint:

```
POST /api/admin/debug/availability
```

The response includes the reason the slot is blocked, such as:

- `outside_business_hours` — center hours not configured for that day/time
- `center_closed` — an emergency closure override is active
- `service_closed` — a service closure override is active
- `service_capacity_full` — base concurrency limit reached
- `cars_capacity_full` — not enough cars in the pool
- `instructors_unavailable` — all instructors are busy or blocked
- `cutoff_exceeded` — booking cutoff window has passed

## Form Builder

Forms are the questionnaire students fill in when booking. Each service is assigned one form. Forms are versioned — existing bookings always retain a snapshot of the form version they used.

### Supported field types

Text, textarea, email, phone, select, radio, checkbox, consent, date, time, datetime, number, hidden.

### Key field settings

| Setting | Effect |
|---|---|
| Required | Student cannot submit without answering |
| Show on Calendar event | Field answer appears in the Google Calendar event description (use for operationally useful info like license number or SAAQ exam date) |
| Show in admin list | Field answer appears in the Bookings table |
| Retention category | Controls how long this field's data is kept before anonymization |

### Publish a form change

1. Open **Form Builder**.
2. Select the form.
3. Add, remove, reorder, or edit fields.
4. Add both English and French labels for every field.
5. Set required status and retention category.
6. Decide which fields should appear in calendar events and admin lists.
7. Click **Publish**.
8. Test the service's public booking flow to confirm the new form appears and submits correctly.

Do not put unnecessary personal information into calendar-visible fields — the event description may be visible to anyone with access to the calendar.

## Google Calendar

### Connection

The portal uses a single owner Google account connected via OAuth. All calendar reads and writes go through this account. To connect or reconnect:

1. Go to **Google Calendar**.
2. If not connected, click **Connect Google account** — you will be redirected to Google to authorize.
3. Approve all requested Calendar permissions (read calendars, check FreeBusy, create and delete events).
4. You are returned to the portal with a **Connected** status.

The connection must remain active for booking confirmations to create calendar events and for availability to check instructor FreeBusy. If the connection expires or is revoked, reconnect here before the next booking.

### Canonical mappings

A canonical mapping tells the system which Google Calendar to use for student-facing booking events for each center or service.

- Each center needs one canonical mapping.
- You can add a service-level mapping to override the center mapping for a specific service.
- Canonical events are the ones students are invited to — they receive a Google Calendar invite email when their booking is confirmed.

To add a mapping:

1. Go to **Google Calendar**.
2. Calendars load automatically if connected. If not, click **Load available calendars**.
3. Under **Canonical mappings → Add mapping**, choose Center or Service, select the target, then pick the calendar from the dropdown.
4. Click **Add mapping**.

### Instructor and vehicle calendars

Assign a personal Google Calendar to each named instructor or vehicle from the **Instructor & vehicle calendars** section on this screen.

- Calendars load automatically when the page opens.
- Select the correct calendar from the dropdown next to each instructor.
- Click **Save** for each one.

The app writes silent blocking events to these calendars when a booking is confirmed. It also checks these calendars for Busy periods before offering slots to students.

### Event template

Customize the title and description of booking events using placeholders:

| Placeholder | Value |
|---|---|
| `{service}` | Service name |
| `{center}` | Center name |
| `{reference}` | Booking reference, e.g. ED-251002 |
| `{student}` | Student name |
| `{price}` | Service display price |
| `{manageUrl}` | Unique manage/cancel link for the student |
| `{visibleFields}` | Form fields marked "Show on Calendar event" |

Leave a field blank to use the built-in default, which is privacy-safe and already includes the manage/cancel link. Keep phone numbers and other sensitive personal data out of templates — the event description may be visible to anyone with access to the calendar.

Example description template:

```
Booking reference: {reference}
Service: {service} — {price}
Center: {center}
{visibleFields}

To manage or cancel your booking:
{manageUrl}
```

## Embedding the booking page on another website

The public booking page can be linked to directly or embedded inside another site (for example `easydriving.ca`) using an `<iframe>`. The booking app is a normal web page on the booking domain, so embedding requires no special integration — you point an iframe at the booking URL with the right query parameters.

Throughout this section, replace `easydriving.nextiadriveops.com` with your live booking domain if it differs.

### How it works

- The booking page lives at the **root** of the booking domain: `https://easydriving.nextiadriveops.com/`.
- Its behaviour is controlled entirely by **URL query parameters** (below). The same URL works whether opened directly or loaded in an iframe.
- All booking API calls are made **from the booking domain to itself**, so embedding on a different domain (like easydriving.ca) works without any cross-origin/CORS setup. The visitor's browser only talks to your site's iframe; the iframe talks to the booking backend.

### URL parameters

| Parameter | Effect | Example |
|---|---|---|
| `embed=1` | Hides the page header and footer for a clean, chromeless embed. Use this for iframes. | `?embed=1` |
| `center=<slug>` | Pre-selects a center and skips the "choose location" step. The slug is the center's URL identifier (e.g. `laval`, `kirkland`, `henri-bourassa`). | `?center=laval` |
| `service=<slug>` | Pre-selects a service and skips to the schedule step. **Requires `center` as well** (a service is chosen within a center). | `?center=laval&service=road-test-package` |
| `lang=en` / `lang=fr` | Sets the initial language. Visitors can still switch unless the header is hidden by `embed=1`. | `?lang=fr` |

Combine parameters with `&`, e.g. `?embed=1&center=laval&lang=fr`.

> Find the exact slugs in **Centers** and **Services** in this portal (the slug is the locked URL identifier shown on each). Always test a new embed URL in a private/incognito window before publishing it.

### Scenario 1 — Simple "Book now" link (no embed)

The easiest option. Add a normal link/button on your website that opens the full booking page (with its own header/footer) in a new tab:

```html
<a href="https://easydriving.nextiadriveops.com/?lang=en" target="_blank" rel="noopener">
  Book a lesson
</a>
```

Use this when you don't want to manage iframe sizing. It always works on every device.

### Scenario 2 — Full booking flow embedded in a page

Embed the whole flow (starting from the choose-location step) inside one of your pages:

```html
<iframe
  src="https://easydriving.nextiadriveops.com/?embed=1"
  title="Book a driving lesson"
  style="width:100%; min-height:900px; border:0;"
  loading="lazy">
</iframe>
```

`embed=1` removes the booking page's own header/footer so it blends into your site. Give it generous height (see [Sizing](#sizing-and-responsiveness)).

### Scenario 3 — A specific center

If a page on your site is about one location, skip the location step:

```html
<iframe
  src="https://easydriving.nextiadriveops.com/?embed=1&center=laval"
  title="Book at our Laval center"
  style="width:100%; min-height:850px; border:0;">
</iframe>
```

The visitor lands directly on the service step for Laval.

### Scenario 4 — A specific service at a specific center

For a landing page dedicated to one offer (e.g. the SAAQ road-test package at Laval), pass both `center` and `service` so the visitor lands on the calendar:

```html
<iframe
  src="https://easydriving.nextiadriveops.com/?embed=1&center=laval&service=road-test-package"
  title="Book the SAAQ road test package at Laval"
  style="width:100%; min-height:800px; border:0;">
</iframe>
```

If the service slug is wrong or the service isn't offered at that center, the flow falls back to the normal service-selection step rather than erroring — so double-check the slug.

### Scenario 5 — French page

Match the embed language to the page it sits on:

```html
<iframe
  src="https://easydriving.nextiadriveops.com/?embed=1&center=laval&lang=fr"
  title="Réservez une leçon de conduite"
  style="width:100%; min-height:850px; border:0;">
</iframe>
```

### Scenario 6 — Multiple "Book" buttons that open a popup

Instead of an always-visible iframe, you can open the booking page in a modal/popup when a button is clicked. Any popup/lightbox plugin works — point it at the same URLs above (use `embed=1` for the cleanest look). On WordPress (which easydriving.ca uses), a popup block/plugin pointed at the booking URL is often tidier than an inline iframe.

### Sizing and responsiveness

The booking page is responsive and fills the width of its iframe, so always set `width:100%`. Height is the one thing to watch: the page does **not** auto-resize the parent iframe, so set a fixed `min-height` large enough for the tallest step (the details form). Guidelines:

- Whole flow (`embed=1` only): `min-height: 900px`.
- Pre-selected center: `min-height: 850px`.
- Pre-selected service (starts on calendar): `min-height: 800px`.

If you see an inner scrollbar on mobile, increase the height. Keep `border:0` and `width:100%` for a seamless look.

### WordPress note (easydriving.ca)

- In the block editor, use a **Custom HTML** block and paste one of the iframe snippets above.
- Some themes/plugins strip `<iframe>` tags from the classic editor; if the embed disappears on save, use a Custom HTML block or an "iframe embed" plugin.
- Page builders (Elementor, etc.) usually have an **HTML / Embed** widget — paste the same snippet there.

### Testing an embed

1. Build the URL with the parameters you want and open it directly in a private window first — confirm the right starting step, center/service, and language.
2. Add the iframe to a draft page on your site and preview it.
3. Complete one real test booking end-to-end from inside the embed; confirm the confirmation screen shows and the Google Calendar invite arrives.
4. Check on a phone — adjust `min-height` if an inner scrollbar appears.

## Privacy and retention

The system automatically anonymizes student personal data after the configured retention period (default: 90 days after the appointment).

### What is removed after retention

- Student name
- Email address
- Phone number
- All form answers
- Public management token (cancel link stops working)

### What is kept permanently

- Booking reference
- Center and service
- Appointment date and time
- Booking status
- Anonymous reporting dimensions (used for statistics)

Google Calendar events are a separate system and may retain minimal information in the event description. The booking cancellation flow deletes calendar events when a booking is cancelled, but Google may retain events in trash for a period.

### Change the retention period

1. Open **Privacy & retention**.
2. Update the number of days.
3. Click **Save**.

The retention cleanup job runs automatically once per day. The **Last run** status shows when it last completed and how many records were anonymized.

## End-of-day checklist

1. Review all bookings for the day and confirm outcomes are recorded.
2. Mark bookings as completed or no-show where applicable.
3. Resolve any remaining Calendar sync failures using Retry sync.
4. Remove emergency controls that should not carry over to tomorrow.
5. Confirm instructor Busy events in Google Calendar for tomorrow cover any known unavailability.
6. Confirm any cars unavailable tomorrow are blocked via Emergency Control or reflected in pool capacity.
7. Review tomorrow's road test packages for any operational notes in the form answers.

## Troubleshooting

### Public booking page shows no slots

Check in order:

1. Center is enabled and has business hours for that weekday.
2. Service is enabled and attached to the center.
3. Service has resource requirements that match the center's resource groups.
4. Booking cutoff has not already passed for the desired time.
5. No active emergency closure covers the center or service.
6. Service base concurrency is not 0.
7. Required instructors exist, are enabled, and are not all marked Busy in Google Calendar.
8. Required cars: pool capacity is greater than 0 and not fully allocated by existing bookings.

### Bookings screen shows no data

The admin session may have expired. Go to `/api/auth/google/start` to sign in again. If the Worker is not running, the API will return errors — check the Cloudflare Workers dashboard.

### "That time was just booked"

This is the conflict protection working correctly. Another student completed a booking for the same slot between when the student loaded the page and when they submitted. Ask the student to choose another slot.

### Booking saved but Calendar event missing

1. Go to **Google Calendar** and confirm the connection shows **Connected**.
2. Confirm the center or service has a canonical mapping.
3. Go to **Bookings**, find the affected booking, and click **Retry sync**.
4. If the connection is broken, reconnect Google and then retry sync.

### Student did not receive a Calendar invite

1. Confirm the booking status is `confirmed` (not `calendar_sync_failed`).
2. Ask the student to check their spam folder — Google Calendar invites sometimes land there.
3. Check that the student's email address was entered correctly in the booking form answers.
4. If the event was created but the invite was not sent, retry sync will attempt to resend.
