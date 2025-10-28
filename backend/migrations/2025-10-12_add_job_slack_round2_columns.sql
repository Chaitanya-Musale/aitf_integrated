-- Add Slack Round-2 channel columns to jobs
BEGIN;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS slack_round2_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS slack_round2_channel_name TEXT;
COMMIT;
