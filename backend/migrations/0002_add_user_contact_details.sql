-- Migration 0002: Add user contact & address fields
-- Adds standard HR contact information to users table for detailed user profile page.
-- Reversible via dropping the added columns (manual rollback if needed).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(200),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(200),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40),
  ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR(40);

-- Index helpful for filtering / searching by city/state/postal_code later (composite kept simple now)
CREATE INDEX IF NOT EXISTS idx_users_location ON users (city, state, postal_code);
