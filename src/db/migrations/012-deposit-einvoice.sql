-- 012: % cọc cho booking engine công khai + cấu hình hóa đơn điện tử theo từng cơ sở.
-- Mỗi tenant tự nhập thông số hợp đồng HĐĐT của họ (Viettel/VNPT/MISA) trong trang Cơ sở.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS deposit_pct INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS einvoice_provider TEXT,      -- 'viettel' | 'vnpt' | 'misa'
  ADD COLUMN IF NOT EXISTS einvoice_tax_code TEXT,      -- MST đơn vị phát hành
  ADD COLUMN IF NOT EXISTS einvoice_username TEXT,      -- tài khoản API nhà cung cấp
  ADD COLUMN IF NOT EXISTS einvoice_password TEXT,      -- mật khẩu/khóa API (chỉ đọc server-side)
  ADD COLUMN IF NOT EXISTS einvoice_template TEXT,      -- mẫu số, vd '1/001'
  ADD COLUMN IF NOT EXISTS einvoice_serial TEXT;        -- ký hiệu, vd 'C24TAA'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_deposit_pct_range'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_deposit_pct_range CHECK (deposit_pct BETWEEN 0 AND 100);
  END IF;
END $$;
