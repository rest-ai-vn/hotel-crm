-- Rate plans: pricing per room_type x booking_type, with date validity windows
-- Run via: bun run migrate

CREATE TABLE rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  booking_type booking_type NOT NULL,
  name TEXT NOT NULL,

  -- One of these is required depending on booking_type. Stored as VND BIGINT.
  hourly_rate BIGINT,
  overnight_rate BIGINT,
  daytime_rate BIGINT,

  -- Hourly billing helpers
  min_hours INT NOT NULL DEFAULT 1,
  extra_hour_rate BIGINT,

  -- Optional weekend surcharge (percent, 0-100). Applied on Sat/Sun for the
  -- nights spanned by overnight/daytime bookings.
  weekend_surcharge_pct INT NOT NULL DEFAULT 0,

  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,

  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rate_plans_validity_window CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT rate_plans_has_rate CHECK (
    (booking_type = 'hourly'    AND hourly_rate    IS NOT NULL) OR
    (booking_type = 'overnight' AND overnight_rate IS NOT NULL) OR
    (booking_type = 'daytime'   AND daytime_rate   IS NOT NULL)
  ),
  CONSTRAINT rate_plans_weekend_pct CHECK (weekend_surcharge_pct BETWEEN 0 AND 100)
);

CREATE INDEX idx_rate_plans_lookup
  ON rate_plans(room_type_id, booking_type, is_active, priority);

CREATE INDEX idx_rate_plans_validity
  ON rate_plans(valid_from, valid_to)
  WHERE is_active;

CREATE TRIGGER tr_rate_plans_updated
BEFORE UPDATE ON rate_plans
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Wire up the existing reservations.rate_plan_id column with a real FK.
ALTER TABLE reservations
  ADD CONSTRAINT fk_reservations_rate_plan
  FOREIGN KEY (rate_plan_id) REFERENCES rate_plans(id) ON DELETE SET NULL;

CREATE INDEX idx_reservations_rate_plan
  ON reservations(rate_plan_id)
  WHERE rate_plan_id IS NOT NULL;
