# Easy Driving School Admin Guide

This guide explains the day-to-day operating processes for owners, administrators, and staff.

> **Current MVP status**
>
> The public booking flow, availability engine, D1 booking storage, resource allocation, emergency override API, booking lock, and retention job are implemented. The admin portal is **fully wired to the live REST APIs**: Today dashboard, Bookings, Centers, Services, Instructors & cars, Availability Rules, Form Builder, Google Calendar mappings, and Retention settings all read and write through authenticated CRUD endpoints. A sign-in screen guards every admin screen until a session exists. Remaining previews (not blockers) are the advanced per-field form validation/options editor and the per-service-per-day service-hours UI; see `docs/technical-setup.md` §18/§23.

## 1. Opening the admin portal

### Local development

1. Open a terminal in the project folder.
2. Run:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173/admin](http://localhost:5173/admin).

### Production

Open the production booking domain followed by `/admin`, for example:

```text
https://booking.easydriving.ca/admin
```

Production administration should only be used after Google OAuth and the admin email allowlist are configured.

## 2. Signing in

The production admin portal uses Google OAuth.

1. Open the Google sign-in endpoint:

   ```text
   /api/auth/google/start
   ```

2. Choose an authorized Google account.
3. Approve the requested Calendar permissions.
4. Google returns you to `/admin`.
5. The app creates a secure, HTTP-only session cookie.

Only email addresses listed in `ADMIN_EMAILS`, or users already stored in the `users` table, should be allowed to sign in.

> During local UI preview, the portal can display sample content when no authenticated API session exists. Preview content is not proof that an admin change was saved.

## 3. Today dashboard

Use **Today** as the main operating screen.

It is designed to show:

- number of bookings today;
- cars currently in use;
- active instructors;
- Google Calendar synchronization issues;
- today’s booking list;
- center status;
- active emergency controls.

### Recommended morning check

1. Open **Today**.
2. Confirm every center that should operate is open.
3. Review active emergency controls.
4. Check for Calendar sync warnings.
5. Compare the first bookings with the operational Google Calendars.
6. Confirm unavailable instructors have added Busy or Vacation events to their assigned calendars.

## 4. Emergency Control

Emergency Control is the fastest way to change public availability.

Use it when:

- a center must close;
- a service must stop temporarily;
- fewer cars are available;
- an instructor is unexpectedly unavailable;
- weather or building access affects operations;
- capacity should be temporarily increased or reduced.

### Close an entire center

Example: Laval must close from 2:00 PM to 6:00 PM because of weather.

1. Open **Today**.
2. Expand **Emergency Control**.
3. Under **What do you want to change?**, choose **Close a center**.
4. Choose **Laval**.
5. Choose the time range.
6. Enter a reason such as `Weather`.
7. Select **Apply immediately**.
8. Open the public booking page in a private/incognito tab and confirm affected slots disappeared.

Center closure has the highest override priority and blocks every service at that center during the selected period.

### Close one service

Example: Road Test Package is unavailable tomorrow morning in Kirkland.

1. Choose **Close a service**.
2. Choose **Kirkland**.
3. Choose **SAAQ Road Test Package**.
4. Choose **Tomorrow** or a custom range.
5. Add the operational reason.
6. Apply the control.
7. Verify that other Kirkland services remain available.

### Limit service capacity

Example: Laval normally has three rental cars, but only one is available.

1. Choose **Limit service capacity**.
2. Choose **Laval**.
3. Choose **Car Rental Only**.
4. Choose **Rest of today**.
5. Set maximum concurrent bookings to `1`.
6. Enter `One car in maintenance`.
7. Apply the control.
8. Test availability from the public booking flow.

### Block an instructor or car

1. Choose **Block instructor or car**.
2. Select the center.
3. Select the named resource.
4. Select the affected time range.
5. Add a reason.
6. Apply the control.

For instructors, the preferred normal workflow is still to create a Busy event in Google Calendar. Resource blocks are most useful for owner-controlled exceptions.

### Remove an active control

1. Open the active controls list.
2. Confirm the center, target, period, and reason.
3. Select the remove icon.
4. Recheck public availability.

Do not remove a control until the underlying operational problem is resolved.

## 5. Booking operations

Open **Bookings** to review scheduled bookings.

The booking list is intended to support:

- searching by student or booking reference;
- filtering by center, service, date, and status;
- viewing student-submitted form answers;
- creating a staff booking;
- cancelling a booking;
- resynchronizing a failed Calendar event;
- marking completed or no-show bookings.

### Booking statuses

| Status | Meaning |
|---|---|
| `pending_confirmation` | Temporary state if an approval flow is later enabled |
| `confirmed` | Booking is valid and Calendar sync succeeded |
| `calendar_sync_failed` | Booking is saved, but one or more Calendar events failed |
| `cancelled_by_student` | Student cancelled using a secure management link |
| `cancelled_by_admin` | Staff cancelled the booking |
| `rescheduled` | Original booking was replaced by a new booking |
| `completed` | Appointment was completed |
| `no_show` | Student did not attend |

### Calendar sync failure

If a booking shows **Sync issue**:

1. Do not recreate the booking manually.
2. Open the booking details.
3. Confirm the booking exists in D1 and has a valid time/resource allocation.
4. Check whether the owner’s Google connection is active.
5. Check that the center or service has a canonical Calendar mapping.
6. Use **Retry sync**.
7. Confirm the canonical event appears once.
8. Confirm the student receives only one invitation.

The booking remains saved even when Calendar creation fails.

### Cancel a booking

Before cancelling:

1. Confirm the booking reference and student.
2. Check the cancellation cutoff.
3. Record the reason.
4. Cancel from the app.
5. Confirm the slot becomes available again.
6. Confirm related Google events are handled.

> Cancellation now removes the booking's Google events automatically. The canonical event is
> deleted with notifications on, so the **student receives a Google cancellation email**; the
> instructor/resource blocking events are deleted silently, which also frees that instructor's
> FreeBusy. Calendar deletion is best-effort: the booking is always cancelled in D1 even if a
> Google call fails, and any failure is recorded on the `booking_calendar_events` row.

### Learner self-service cancellation link

Every booking generates a unique, hashed management token. The confirmation screen and the
calendar event description both include a **Manage or cancel** link of the form
`/booking/{reference}?token={code}`. The learner opens it (no login) to view the booking and
cancel it themselves — subject to the service's cancellation cutoff. Online cancellation is
blocked once the cutoff window is reached, with a message to call the school. The same Google
event cleanup and student cancellation email apply to learner-initiated cancellations.

### Reschedule a booking

Rescheduling must never be treated as a simple time edit.

1. Find the booking.
2. Choose a new date and time.
3. Run full availability again.
4. Confirm car, instructor, service capacity, buffers, closures, and Calendar busy status.
5. Create the replacement booking.
6. Mark the original booking as rescheduled.
7. Confirm Calendar events and student invitation.

## 6. Centers

Each center controls:

- public name and slug;
- address;
- timezone;
- enabled/disabled status;
- business hours;
- available services;
- resource groups;
- Calendar mappings.

### Add a center

1. Open **Centers**.
2. Choose **Add center**.
3. Enter a unique slug, such as `west-island`.
4. Enter the public name and optional address.
5. Keep timezone set to `America/Montreal` unless the center is elsewhere.
6. Set business hours.
7. Attach services.
8. Create resource groups.
9. Map a canonical Google Calendar.
10. Test at least one public booking.

### Disable versus delete

- **Disable** a center when it may return later.
- **Delete** only when it has no future bookings and should no longer be retained.

The API defensively refuses deletion when future bookings exist.

## 7. Services

Each service can define:

- bilingual name and description;
- enabled centers;
- duration;
- buffer before and after;
- slot interval;
- optional displayed price;
- booking cutoff;
- cancellation cutoff;
- base concurrency;
- resource requirements;
- form;
- Calendar behavior.

### Resource examples

| Service | Cars | Instructors | Capacity behavior |
|---|---:|---:|---|
| Car Rental Only | 1 | 0 | Can run concurrently up to available car capacity |
| Road Test Package | 1 | 1 | Limited by both cars and instructors |
| Driving Lesson | 1 | 1 | Limited by both resources and buffers |
| Group Theory | 0 | 1 | Instructor plus seat capacity |
| Admin Consultation | 0 | 0 | Fixed service concurrency |

### Change a service safely

1. Review existing future bookings.
2. Change only one rule group at a time.
3. Save bilingual public text.
4. Confirm duration and buffers.
5. Confirm resource requirements.
6. Confirm form assignment.
7. Test public availability at every enabled center.
8. Test a final booking.

Avoid changing a service duration in a way that makes existing operational allocations misleading.

## 8. Instructors, cars, and resource groups

### Named resources

Use named resources when an individual resource must be allocated and checked separately.

Examples:

- Instructor Ali;
- Instructor Sara;
- a specific vehicle with its own Calendar.

Named instructors can have:

- center membership;
- service eligibility;
- Google Calendar ID;
- enabled/disabled state;
- optional public visibility.

### Pooled capacity

Use pooled capacity when individual names do not matter operationally.

Examples:

- `Laval Cars = 3`;
- `Kirkland Cars = 2`;
- `Classroom Seats = 10`.

The public never needs to see internal capacity unless explicitly configured.

### Instructor availability process

1. Instructor opens their assigned Google Calendar.
2. Instructor creates a normal event.
3. The event must mark them Busy.
4. Use titles such as `Unavailable`, `Vacation`, or `Personal`.
5. The booking app reads the busy period through Google FreeBusy.
6. No instructor app login is required.

App-created booking events should be changed through the booking app, not dragged manually in Google Calendar.

## 9. Availability rules

Availability is calculated in this order:

1. center business hours;
2. service-specific hours;
3. booking cutoff;
4. operational duration and buffers;
5. center closure;
6. service closure;
7. resource blocks;
8. temporary service concurrency;
9. normal service concurrency;
10. Google Calendar busy periods;
11. existing D1 bookings and allocations.

### Buffer example

A lesson runs from 10:00 AM to 11:00 AM with a 10-minute buffer after. The allocated operational window ends at 11:10 AM. The same car or instructor cannot be allocated to another overlapping booking at 11:00 AM.

### Debugging unavailable slots

Authenticated admins can use:

```text
POST /api/admin/debug/availability
```

The response can include reasons such as:

- `center_closed`;
- `service_closed`;
- `service_capacity_full`;
- `cars_capacity_full`;
- `instructors_unavailable`;
- `cutoff_exceeded`;
- `outside_business_hours`.

## 10. Form Builder

Forms are configured separately from services and are versioned.

Supported fields include:

- text and textarea;
- email and phone;
- select and radio;
- checkbox and consent;
- date, time, and datetime;
- number;
- hidden values.

### Publish a form change

1. Open **Form Builder**.
2. Select the form.
3. Add, remove, reorder, or edit fields.
4. Add both English and French labels.
5. Set required status.
6. Choose whether the field appears in Calendar descriptions.
7. Choose whether the field appears in admin lists.
8. Assign a retention category.
9. Publish the new version.
10. Test the service’s public booking form.

Existing bookings retain a snapshot of the schema used when they were booked.

Avoid putting unnecessary personal information into Calendar-visible fields.

## 11. Google Calendar operations

### Recommended Calendar structure

Create:

- one canonical booking Calendar per center or major service;
- one shared operational Calendar per instructor;
- optional vehicle Calendars only when vehicle-specific scheduling is required.

### Event rules

For every confirmed booking:

1. Create one canonical event.
2. Invite the student from the canonical event only.
3. Create internal blocking events for allocated instructor resources.
4. Optionally block a vehicle Calendar.
5. Store all Google event IDs in D1.

### Email notifications on booking

| Recipient | Gets an email? | How it works |
|---|---|---|
| **Student / learner** | **Yes — one Google Calendar invite** | The student is added as an *attendee* on the canonical event, which is created with `sendUpdates: all`, so Google emails them the invite (and any later updates to that event). |
| **Instructor** | **No email** | The instructor's calendar receives an *internal blocking event* created with `sendUpdates: none` and **no attendee**. The event simply appears on their assigned calendar — they are not invited or emailed. They see it because the app writes it directly onto the calendar they have access to. |

There is no separate confirmation-email system: the only email a booking generates is the
student's Google Calendar invite. (See "Email delivery beyond Google Calendar invitations is not
included" in the technical limitations.) If instructors should be notified by email, either add
them as attendees on their resource events or share their operational calendar with email
notifications enabled in their own Google Calendar settings.

Privacy-safe title:

```text
Driving Lesson - Laval - Booking ED-1042
```

Do not use:

```text
Driving Lesson - John Smith - 514-555-0123
```

### Configurable event title and description

Admin → Google Calendar includes an **Event template** editor. You can customize the title and
description used for created events (and therefore the student's invite email) using placeholders:
`{service}`, `{center}`, `{reference}`, `{student}`, `{manageUrl}`, and `{visibleFields}` (the
form fields flagged "Show on Calendar event"). Leave a field blank to use the built-in default
format, which is already privacy-safe and includes the manage/cancel link. Keep phone numbers and
other sensitive data out of templates.

### Known Calendar limitation

The MVP does not provide full two-way synchronization. If someone manually moves or deletes an
app-created event in Google Calendar, D1 is not automatically reconciled. (Cancellation from the
app *does* now delete the app-created events — see §5.)

## 12. Privacy and retention

The default retention period is 90 days after the appointment.

After retention cleanup:

- student name is removed;
- email is removed;
- phone is removed;
- form answers are cleared;
- public management token is invalidated;
- anonymous booking statistics remain.

Retained information includes:

- booking reference;
- center;
- service;
- appointment time;
- status;
- anonymous reporting dimensions.

Google Calendar is a separate system and may retain minimal event-description information.

## 13. End-of-day checklist

1. Review remaining bookings.
2. Mark operational outcomes if required.
3. Resolve Calendar sync failures.
4. Remove emergency controls that should not continue.
5. Confirm tomorrow’s instructor Busy events.
6. Confirm cars unavailable tomorrow are blocked.
7. Review tomorrow’s road test packages for operational notes.

## 14. Support troubleshooting

### Public booking page shows no slots

Check:

1. center and service are enabled;
2. center has hours for that weekday;
3. service is attached to the center;
4. cutoff has not passed;
5. no active closure exists;
6. service concurrency is not full;
7. required resources exist and are enabled;
8. Google Calendar does not mark every instructor busy.

### Admin portal shows sample data

The admin API session is missing or failed.

1. Confirm the Worker is running.
2. Open `/api/admin/me`.
3. If unauthorized, sign in through `/api/auth/google/start`.
4. Confirm `.dev.vars` or production secrets are configured.

### “That time was just booked”

This is normal conflict protection. Another booking consumed the capacity between availability display and final confirmation. Ask the student to choose another slot.

### Booking saved but Calendar failed

The booking is not lost. Reconnect Google if required, verify Calendar mappings, then retry sync.

