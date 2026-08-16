-- Phase 5: POS additional services, cash book, loyalty points
-- Run via: bun run migrate

-- ── POS / Additional services ──────────────────────
-- Service catalog (minibar, giặt ủi, spa, ăn sáng, tour, thuê xe, ...)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  price BIGINT NOT NULL CHECK (price >= 0),
  unit TEXT NOT NULL DEFAULT 'lần',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER tr_services_updated
  BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Folio charges: a service charged against a reservation
CREATE TABLE reservation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,            -- snapshot of service name at charge time
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount BIGINT NOT NULL CHECK (amount >= 0),  -- unit_price * quantity
  note TEXT,
  charged_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservation_services_res ON reservation_services(reservation_id);

-- Track total of extra services on each reservation (room total stays in total_amount)
ALTER TABLE reservations
  ADD COLUMN services_total BIGINT NOT NULL DEFAULT 0;

-- Recompute reservation.services_total when a folio charge changes.
CREATE OR REPLACE FUNCTION recompute_reservation_services_total()
RETURNS TRIGGER AS $$
DECLARE
  res_id UUID;
  svc_total BIGINT;
BEGIN
  res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT COALESCE(SUM(amount), 0) INTO svc_total
  FROM reservation_services
  WHERE reservation_id = res_id;

  UPDATE reservations
  SET services_total = svc_total
  WHERE id = res_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_reservation_services_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_services
FOR EACH ROW EXECUTE FUNCTION recompute_reservation_services_total();

-- Update payment-status recompute to include services_total in the folio total.
CREATE OR REPLACE FUNCTION recompute_reservation_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  res_id UUID;
  paid_total BIGINT;
  folio_total BIGINT;
  next_status payment_status;
BEGIN
  res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM payments
  WHERE reservation_id = res_id;

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

-- Re-run payment status when services change too (folio total shifts).
CREATE TRIGGER tr_reservation_services_payment_status
AFTER INSERT OR UPDATE OR DELETE ON reservation_services
FOR EACH ROW EXECUTE FUNCTION recompute_reservation_payment_status();

-- ── Cash book (thu / chi ngoài tiền phòng) ─────────
CREATE TYPE cash_direction AS ENUM ('income', 'expense');

CREATE TABLE cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction cash_direction NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount BIGINT NOT NULL CHECK (amount > 0),
  note TEXT,
  occurred_on DATE NOT NULL DEFAULT current_date,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_tx_occurred ON cash_transactions(occurred_on DESC);
CREATE INDEX idx_cash_tx_direction ON cash_transactions(direction);

-- ── Loyalty ─────────────────────────────────────────
-- visit_count, total_revenue, loyalty_tier already exist on guests.
ALTER TABLE guests
  ADD COLUMN loyalty_points BIGINT NOT NULL DEFAULT 0;
