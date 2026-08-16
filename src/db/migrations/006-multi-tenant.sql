-- Phase 7: multi-tenant — properties table + property_id on all tenant-scoped
-- tables, backfilled to a default property, with per-tenant constraints.
-- Run via: bun run migrate  (then RESTART postgrest to refresh schema cache)

-- ── Properties (tenants) ────────────────────────────
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tr_properties_updated
BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

INSERT INTO properties (name, code) VALUES ('Khách sạn chính', 'MAIN');

-- ── Add property_id to tenant-scoped tables ─────────
-- NOT NULL after backfill; audit_logs stays nullable so logging never fails.
DO $$
DECLARE
  main_id UUID;
  t TEXT;
BEGIN
  SELECT id INTO main_id FROM properties WHERE code = 'MAIN';

  FOREACH t IN ARRAY ARRAY[
    'room_types', 'rooms', 'guests', 'reservations', 'staff', 'rate_plans',
    'payments', 'services', 'reservation_services', 'cash_transactions',
    'shifts', 'night_audits', 'rate_overrides', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN property_id UUID REFERENCES properties(id)', t);
    EXECUTE format('UPDATE %I SET property_id = %L', t, main_id);
    IF t <> 'audit_logs' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN property_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- ── Rework uniqueness to be per-property ────────────
ALTER TABLE rooms DROP CONSTRAINT rooms_number_key;
ALTER TABLE rooms ADD CONSTRAINT rooms_number_per_property UNIQUE (property_id, number);

ALTER TABLE room_types DROP CONSTRAINT room_types_code_key;
ALTER TABLE room_types ADD CONSTRAINT room_types_code_per_property UNIQUE (property_id, code);

DROP INDEX idx_guests_phone;
CREATE UNIQUE INDEX idx_guests_phone ON guests(property_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE night_audits DROP CONSTRAINT night_audits_business_date_key;
ALTER TABLE night_audits ADD CONSTRAINT night_audits_date_per_property UNIQUE (property_id, business_date);

-- One open shift per property (was: one open shift globally)
DROP INDEX idx_shifts_single_open;
CREATE UNIQUE INDEX idx_shifts_single_open ON shifts(property_id) WHERE status = 'open';

-- staff.email stays globally unique (login identifier).
-- reservations.confirmation_code stays globally unique (random suffix).

-- ── Hot-path indexes ────────────────────────────────
CREATE INDEX idx_reservations_property_dates ON reservations(property_id, check_in);
CREATE INDEX idx_rooms_property ON rooms(property_id);
CREATE INDEX idx_guests_property ON guests(property_id);
CREATE INDEX idx_payments_property_created ON payments(property_id, created_at DESC);
CREATE INDEX idx_cash_property_occurred ON cash_transactions(property_id, occurred_on DESC);
CREATE INDEX idx_audit_property_created ON audit_logs(property_id, created_at DESC);
CREATE INDEX idx_shifts_property_opened ON shifts(property_id, opened_at DESC);
