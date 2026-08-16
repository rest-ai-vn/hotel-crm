-- Phase 6: shift handover, night audit, deposits/refunds, rate overrides, audit log
-- Run via: bun run migrate

-- ── Deposits / refunds on payments ──────────────────
CREATE TYPE payment_kind AS ENUM ('payment', 'deposit', 'refund');

ALTER TABLE payments
  ADD COLUMN kind payment_kind NOT NULL DEFAULT 'payment';

-- Recompute payment_status accounting for kind:
-- paid = payments + deposits - refunds
CREATE OR REPLACE FUNCTION recompute_reservation_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  res_id UUID;
  paid_total BIGINT;
  refund_total BIGINT;
  folio_total BIGINT;
  next_status payment_status;
BEGIN
  res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM payments
  WHERE reservation_id = res_id AND kind IN ('payment', 'deposit');

  SELECT COALESCE(SUM(amount), 0) INTO refund_total
  FROM payments
  WHERE reservation_id = res_id AND kind = 'refund';

  paid_total := paid_total - refund_total;

  SELECT COALESCE(total_amount, 0) + COALESCE(services_total, 0) INTO folio_total
  FROM reservations
  WHERE id = res_id;

  IF paid_total <= 0 THEN
    next_status := 'pending';
  ELSIF paid_total >= folio_total THEN
    next_status := 'paid';
  ELSE
    next_status := 'partial';
  END IF;

  UPDATE reservations
  SET payment_status = next_status
  WHERE id = res_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ── Shifts (giao ca) ────────────────────────────────
CREATE TYPE shift_status AS ENUM ('open', 'closed');

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  status shift_status NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  expected_cash BIGINT,          -- computed at close
  counted_cash BIGINT,           -- entered by cashier at close
  variance BIGINT,               -- counted - expected
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shifts_opened ON shifts(opened_at DESC);
-- Only one open shift at a time (single cashier desk)
CREATE UNIQUE INDEX idx_shifts_single_open ON shifts(status) WHERE status = 'open';

-- ── Night audit (chốt ngày) ─────────────────────────
CREATE TABLE night_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL UNIQUE,
  closed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  no_show_count INT NOT NULL DEFAULT 0,
  stats JSONB NOT NULL DEFAULT '{}',
  note TEXT
);

CREATE INDEX idx_night_audits_date ON night_audits(business_date DESC);

-- ── Rate overrides (giá ngày lễ / sự kiện) ──────────
CREATE TABLE rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  room_type_id UUID REFERENCES room_types(id) ON DELETE CASCADE,  -- NULL = all room types
  surcharge_pct INT NOT NULL DEFAULT 0 CHECK (surcharge_pct BETWEEN 0 AND 200),
  fixed_hourly BIGINT CHECK (fixed_hourly IS NULL OR fixed_hourly >= 0),
  fixed_overnight BIGINT CHECK (fixed_overnight IS NULL OR fixed_overnight >= 0),
  fixed_daytime BIGINT CHECK (fixed_daytime IS NULL OR fixed_daytime >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_overrides_date ON rate_overrides(date) WHERE is_active;

CREATE TRIGGER tr_rate_overrides_updated
BEFORE UPDATE ON rate_overrides
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ── Audit log ───────────────────────────────────────
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID,
  staff_name TEXT,
  action TEXT NOT NULL,          -- e.g. reservation.check_in, payment.delete
  entity TEXT NOT NULL,          -- e.g. reservation, payment, rate_plan
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
