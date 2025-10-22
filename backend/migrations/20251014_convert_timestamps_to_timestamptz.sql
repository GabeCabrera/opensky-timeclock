-- Migration: Convert timestamp columns to timestamptz (UTC canonical storage)
-- Date: 2025-10-14
-- Notes:
--  - This assumes existing timestamps are in the server's current timezone.
--  - We convert by interpreting stored 'timestamp without time zone' values as local then storing UTC.
--  - For stricter correctness across mixed historical zones, a per-record adjustment may be needed.

BEGIN;

-- Users table
ALTER TABLE users
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

-- time_entries table
ALTER TABLE time_entries
  ALTER COLUMN clock_in TYPE timestamptz USING clock_in AT TIME ZONE 'UTC';
ALTER TABLE time_entries
  ALTER COLUMN clock_out TYPE timestamptz USING clock_out AT TIME ZONE 'UTC';
ALTER TABLE time_entries
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

COMMIT;
