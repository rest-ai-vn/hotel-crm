-- Phase 11: Row Level Security — DB-enforced tenant isolation.
-- App queries run as role `tenant_user` with a `property_id` JWT claim;
-- service_role (BYPASSRLS) remains for cross-tenant paths (auth, admin, chain).
--
-- PREREQUISITE (one-time, as postgres superuser — migrations run as `hotel`
-- which cannot create roles):
--   CREATE ROLE tenant_user NOLOGIN;
--   GRANT tenant_user TO authenticator;
--
-- Run via: bun run migrate  (then RESTART postgrest AND hotel-crm)

GRANT USAGE ON SCHEMA public TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenant_user;
ALTER DEFAULT PRIVILEGES FOR ROLE hotel IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_user;

-- Tenant may read only its own property row (name, vat, bank config).
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_own_property ON properties
  FOR SELECT TO tenant_user
  USING (id = (current_setting('request.jwt.claims', true)::json->>'property_id')::uuid);

-- All tenant-scoped tables: full CRUD strictly within the claimed property.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'room_types', 'rooms', 'guests', 'reservations', 'staff', 'rate_plans',
    'payments', 'services', 'reservation_services', 'cash_transactions',
    'shifts', 'night_audits', 'rate_overrides', 'audit_logs',
    'vouchers', 'companies', 'work_orders', 'lost_found'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_rw ON %I FOR ALL TO tenant_user '
      || 'USING (property_id = (current_setting(''request.jwt.claims'', true)::json->>''property_id'')::uuid) '
      || 'WITH CHECK (property_id = (current_setting(''request.jwt.claims'', true)::json->>''property_id'')::uuid)',
      t
    );
  END LOOP;
END $$;
