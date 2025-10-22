-- Migration 0001: Add approval_notes column and index on approval_date for faster weekly stats queries
-- Reversible: down section provided at end (manual execution if needed)

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Ensure approval_date column exists (older code used approved_at)
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP;

-- Backfill approval_date from approved_at if legacy column present (best-effort)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='time_entries' AND column_name='approved_at'
  ) THEN
    EXECUTE 'UPDATE time_entries SET approval_date = approved_at WHERE approval_date IS NULL';
  END IF;
END $$;

-- Create index on approval_date for weekly stats lookups
CREATE INDEX IF NOT EXISTS idx_time_entries_approval_date ON time_entries(approval_date);

-- DOWN (manual):
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS approval_notes;
-- DROP INDEX IF EXISTS idx_time_entries_approval_date;