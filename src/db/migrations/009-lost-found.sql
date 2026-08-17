-- Phase 10: lost & found (đồ thất lạc)
-- Run via: bun run migrate  (then RESTART postgrest)

CREATE TYPE lost_found_status AS ENUM ('stored', 'returned');

CREATE TABLE lost_found (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  item TEXT NOT NULL,
  location TEXT,                 -- nơi nhặt được (phòng 101, sảnh...)
  found_on DATE NOT NULL DEFAULT current_date,
  status lost_found_status NOT NULL DEFAULT 'stored',
  note TEXT,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ
);

CREATE INDEX idx_lost_found_property_status ON lost_found(property_id, status);
