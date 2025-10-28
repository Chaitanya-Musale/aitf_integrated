-- Migration: add JSONB arrays for educations and work_history on candidates
-- Run after previous migrations.

BEGIN;

ALTER TABLE IF EXISTS candidates
  ADD COLUMN IF NOT EXISTS educations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_history JSONB DEFAULT '[]'::jsonb;

-- Optional simple check constraint to ensure arrays
DO $$
BEGIN
  BEGIN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_educations_is_array CHECK (jsonb_typeof(educations) = 'array');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_work_history_is_array CHECK (jsonb_typeof(work_history) = 'array');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

COMMIT;
