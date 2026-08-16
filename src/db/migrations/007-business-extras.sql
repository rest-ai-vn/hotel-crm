-- Phase 8: VAT, vouchers, group bookings, company ledger, work orders, VietQR config
-- Run via: bun run migrate  (then RESTART postgrest)

-- ── VAT + VietQR bank info per property ─────────────
ALTER TABLE properties
  ADD COLUMN vat_rate INT NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 50),
  ADD COLUMN bank_id TEXT,          -- VietQR bank code, e.g. 'VCB', '970436'
  ADD COLUMN bank_account_no TEXT,
  ADD COLUMN bank_account_name TEXT;

-- ── Vouchers / khuyến mãi ───────────────────────────
CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value BIGINT NOT NULL CHECK (value > 0),  -- percent (1-100) or VND
  valid_from DATE NOT NULL DEFAULT current_date,
  valid_to DATE,
  max_uses INT,                              -- NULL = unlimited
  used_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vouchers_code_per_property UNIQUE (property_id, code),
  CONSTRAINT vouchers_percent_range CHECK (kind <> 'percent' OR value <= 100)
);

-- ── Group bookings + voucher + company on reservations ──
ALTER TABLE reservations
  ADD COLUMN group_code TEXT,
  ADD COLUMN voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN company_id UUID;

CREATE INDEX idx_reservations_group ON reservations(group_code) WHERE group_code IS NOT NULL;

-- ── Companies (công nợ đại lý / công ty) ────────────
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  tax_code TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tr_companies_updated
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

ALTER TABLE reservations
  ADD CONSTRAINT fk_reservations_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX idx_reservations_company ON reservations(company_id) WHERE company_id IS NOT NULL;

-- ── Work orders (phiếu bảo trì) ─────────────────────
CREATE TYPE work_order_status AS ENUM ('open', 'in_progress', 'done');

CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT,
  status work_order_status NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_work_orders_property_status ON work_orders(property_id, status);
