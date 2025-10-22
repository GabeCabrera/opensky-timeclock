-- Migration: Remove work_description column from time_entries
-- Date: 2025-10-14
-- WARNING: This is destructive. Backup data first if needed.

BEGIN;

ALTER TABLE time_entries DROP COLUMN IF EXISTS work_description;

COMMIT;
