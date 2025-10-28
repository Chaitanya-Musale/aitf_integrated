-- Migration: add candidate education/work history fields, scheduling, and job sheet columns
-- Run with: psql (or your migration runner)

BEGIN;

-- Jobs: sheet metadata (for Google Sheets integration)
ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS sheet_id TEXT,
  ADD COLUMN IF NOT EXISTS sheet_url TEXT;

-- Candidates: education and work history fields
ALTER TABLE IF EXISTS candidates
  ADD COLUMN IF NOT EXISTS college_name TEXT,
  ADD COLUMN IF NOT EXISTS degree TEXT,
  ADD COLUMN IF NOT EXISTS graduation_year INT,
  ADD COLUMN IF NOT EXISTS experience_level TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Already existing columns assumed: name, email, contact, resume_url, program, course,
-- cgpa_percentage, years_experience, past_workplaces, positions, skills_summary

-- Candidate rounds: scheduling info per round
ALTER TABLE IF EXISTS candidate_rounds
  ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interviewer_name TEXT;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_candidate_rounds_round ON candidate_rounds(round_id);
CREATE INDEX IF NOT EXISTS idx_candidate_rounds_status ON candidate_rounds(status);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);

COMMIT;
