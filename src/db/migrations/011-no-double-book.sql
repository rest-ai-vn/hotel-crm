-- Phase 11b: DB-level double-booking guard for overnight stays.
-- Two active overnight reservations can never hold the same room on
-- overlapping nights, no matter how racy the API calls are.
-- (Hourly/daytime bookings share a room across one day by design — excluded.)
-- Run via: bun run migrate  (then RESTART postgrest)

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT no_double_book_overnight
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (
    room_id IS NOT NULL
    AND booking_type = 'overnight'
    AND status IN ('confirmed', 'checked_in')
  );
