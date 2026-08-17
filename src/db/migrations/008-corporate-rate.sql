-- Phase 9: corporate rate — per-company discount percentage
-- Run via: bun run migrate  (then RESTART postgrest)

ALTER TABLE companies
  ADD COLUMN discount_pct INT NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100);
