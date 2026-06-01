-- Housekeeping tracking + payments folio
-- Run via: bun run migrate

-- Housekeeping fields on rooms
ALTER TABLE rooms
  ADD COLUMN last_cleaned_at TIMESTAMPTZ,
  ADD COLUMN cleaning_assignee UUID REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX idx_rooms_cleaning_assignee
  ON rooms(cleaning_assignee)
  WHERE cleaning_assignee IS NOT NULL;

-- Payments (folio entries against a reservation)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL DEFAULT 'cash',
  note TEXT,
  received_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_reservation ON payments(reservation_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Recompute reservation.payment_status when a payment is added/removed.
CREATE OR REPLACE FUNCTION recompute_reservation_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  res_id UUID;
  paid_total BIGINT;
  res_total BIGINT;
  next_status payment_status;
BEGIN
  res_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM payments
  WHERE reservation_id = res_id;

  SELECT total_amount INTO res_total
  FROM reservations
  WHERE id = res_id;

  IF paid_total <= 0 THEN
    next_status := 'pending';
  ELSIF paid_total >= res_total THEN
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

CREATE TRIGGER tr_payments_recompute_status
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION recompute_reservation_payment_status();
