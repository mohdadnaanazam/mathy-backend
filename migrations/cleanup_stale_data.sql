-- Run this ONCE on Supabase SQL Editor to clean up the 14k games / 14 sessions mess.
-- This keeps only the most recent active session and its games.

-- Step 1: Find the most recent active session
-- (If none is active, this will clean everything and the backend will create a fresh one on boot)

-- Delete games belonging to non-active sessions
DELETE FROM games
WHERE session_id NOT IN (
  SELECT id FROM sessions
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
)
OR session_id IS NULL;

-- Delete all sessions except the most recent active one
DELETE FROM sessions
WHERE id NOT IN (
  SELECT id FROM sessions
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Verify the cleanup
SELECT 'sessions' AS table_name, COUNT(*) AS row_count FROM sessions
UNION ALL
SELECT 'games', COUNT(*) FROM games;
