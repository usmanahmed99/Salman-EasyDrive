-- Optional address that receives a Google Calendar invite for every new booking (public, admin,
-- and each package session). Added as an attendee on the canonical event in syncBookingCalendar,
-- so Google emails it automatically. NULL/empty disables the notification.
ALTER TABLE calendar_event_settings ADD COLUMN notification_email TEXT;
