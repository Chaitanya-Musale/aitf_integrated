-- Migration: drop redundant flat columns now stored in JSONB arrays
BEGIN;

-- These columns may or may not exist depending on previous state; use IF EXISTS.
ALTER TABLE IF EXISTS candidates
  DROP COLUMN IF EXISTS program,
  DROP COLUMN IF EXISTS course,
  DROP COLUMN IF EXISTS past_workplaces,
  DROP COLUMN IF EXISTS positions;

COMMIT;
