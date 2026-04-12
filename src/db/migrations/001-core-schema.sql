-- Hotel CRM Core Schema
-- Run: psql $DATABASE_URL -f src/db/migrations/001-core-schema.sql

-- Enums
CREATE TYPE room_status AS ENUM ('available', 'reserved', 'occupied', 'cleaning', 'maintenance', 'out_of_order');
CREATE TYPE reservation_status AS ENUM ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');
CREATE TYPE booking_type AS ENUM ('hourly', 'overnight', 'daytime');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'transfer', 'vietqr');
CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded');
CREATE TYPE guest_source AS ENUM ('walk_in', 'zalo', 'facebook', 'phone', 'ota_agoda', 'ota_booking', 'ota_traveloka', 'website');

-- Room types (e.g. ONTOP, 7 HEAVEN, CLOUD 10, CLOUD 9)
CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  max_guests INT NOT NULL DEFAULT 2,
  amenities TEXT[] DEFAULT '{}',
  photos TEXT[] DEFAULT '{}',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual rooms (e.g. room 108 = floor 1, ONTOP)
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  number TEXT UNIQUE NOT NULL,
  floor INT NOT NULL,
  status room_status DEFAULT 'available',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Guest profiles
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_number TEXT,
  id_type TEXT,
  nationality TEXT DEFAULT 'VN',
  address TEXT,
  zalo_id TEXT,
  facebook_id TEXT,
  visit_count INT DEFAULT 0,
  total_revenue BIGINT DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'standard',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  is_blacklisted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_guests_phone ON guests(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_guests_zalo ON guests(zalo_id) WHERE zalo_id IS NOT NULL;
CREATE INDEX idx_guests_facebook ON guests(facebook_id) WHERE facebook_id IS NOT NULL;

-- Reservations
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id),
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  room_id UUID REFERENCES rooms(id),
  booking_type booking_type NOT NULL,
  status reservation_status DEFAULT 'confirmed',
  source guest_source DEFAULT 'walk_in',
  check_in DATE NOT NULL,
  check_in_time TIME,
  check_out DATE NOT NULL,
  check_out_time TIME,
  duration_hours INT,
  adults INT DEFAULT 1,
  children INT DEFAULT 0,
  rate_plan_id UUID,
  base_amount BIGINT NOT NULL,
  surcharge BIGINT DEFAULT 0,
  discount_amount BIGINT DEFAULT 0,
  tax_amount BIGINT DEFAULT 0,
  total_amount BIGINT NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  notes TEXT,
  internal_notes TEXT,
  confirmation_code TEXT UNIQUE,
  created_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reservations_dates ON reservations(check_in, check_out) WHERE status != 'cancelled';
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_reservations_room ON reservations(room_id) WHERE room_id IS NOT NULL;

-- Staff users
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'receptionist',
  phone TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_room_types_updated BEFORE UPDATE ON room_types FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tr_rooms_updated BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tr_guests_updated BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tr_reservations_updated BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Auto-generate confirmation code
CREATE OR REPLACE FUNCTION generate_confirmation_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.confirmation_code IS NULL THEN
    NEW.confirmation_code := 'BON-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 3));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_reservation_code BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION generate_confirmation_code();
