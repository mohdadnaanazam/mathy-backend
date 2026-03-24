-- Backup leaderboard table (data preserved, not deleted)
-- Run this in Supabase SQL Editor to safely archive the leaderboard data.

-- Rename the table to keep data intact
ALTER TABLE IF EXISTS leaderboard_scores RENAME TO leaderboard_scores_backup;

-- Drop the old indexes (they auto-rename with the table in most cases,
-- but explicitly drop to avoid confusion)
DROP INDEX IF EXISTS idx_leaderboard_score;
DROP INDEX IF EXISTS idx_leaderboard_user;
DROP INDEX IF EXISTS idx_leaderboard_created;
DROP INDEX IF EXISTS idx_leaderboard_daily;

-- Drop the old RLS policies
DROP POLICY IF EXISTS "Public read leaderboard" ON leaderboard_scores_backup;
DROP POLICY IF EXISTS "Service insert leaderboard" ON leaderboard_scores_backup;

-- Disable RLS on the backup table (no longer needed)
ALTER TABLE IF EXISTS leaderboard_scores_backup DISABLE ROW LEVEL SECURITY;
