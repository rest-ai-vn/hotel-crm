-- 013: API key cho tích hợp AI (chatbot Zalo/Facebook, tổng đài AI, trợ lý đặt phòng).
-- Mỗi cơ sở tự phát hành key riêng; key chỉ lưu dạng băm SHA-256, bản rõ hiện
-- đúng một lần lúc tạo. Quyền theo scope: `read` (tra cứu) và `book` (đặt/hủy).
-- Run via: bun run migrate  (then RESTART postgrest to refresh schema cache)

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,               -- 10 ký tự đầu, để nhận diện trên UI
  key_hash TEXT NOT NULL,                 -- sha256 hex của key đầy đủ
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_property ON api_keys(property_id, created_at DESC);

-- Chống đặt trùng khi AI retry: mỗi (cơ sở, idempotency_key) chỉ tạo booking 1 lần,
-- lần gọi lại trả nguyên response cũ.
CREATE TABLE api_idempotency (
  property_id UUID NOT NULL REFERENCES properties(id),
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_idempotency TO tenant_user;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rw ON api_keys FOR ALL TO tenant_user
  USING (property_id = (current_setting('request.jwt.claims', true)::json->>'property_id')::uuid)
  WITH CHECK (property_id = (current_setting('request.jwt.claims', true)::json->>'property_id')::uuid);

CREATE POLICY tenant_rw ON api_idempotency FOR ALL TO tenant_user
  USING (property_id = (current_setting('request.jwt.claims', true)::json->>'property_id')::uuid)
  WITH CHECK (property_id = (current_setting('request.jwt.claims', true)::json->>'property_id')::uuid);
