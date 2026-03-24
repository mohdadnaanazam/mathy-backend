-- Leaderboard scores table (upsert model: one row per user)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  avatar_color TEXT NOT NULL DEFAULT '#f97316',
  score INTEGER NOT NULL CHECK (score >= 0),
  game_type TEXT NOT NULL DEFAULT 'total',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_created ON leaderboard_scores (created_at DESC);

-- Enable Row Level Security
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read leaderboard
CREATE POLICY "Public read leaderboard" ON leaderboard_scores
  FOR SELECT USING (true);

-- Allow inserts/updates via service role (backend)
CREATE POLICY "Service insert leaderboard" ON leaderboard_scores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update leaderboard" ON leaderboard_scores
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: If upgrading from old multi-row schema, run these steps:
-- ═══════════════════════════════════════════════════════════════════════
--
-- Step 1: Delete duplicate rows, keeping only the highest score per user
-- DELETE FROM leaderboard_scores a
-- USING leaderboard_scores b
-- WHERE a.user_id = b.user_id
--   AND a.score < b.score;
--
-- Step 2: If there are still duplicates with same score, keep newest
-- DELETE FROM leaderboard_scores a
-- USING leaderboard_scores b
-- WHERE a.user_id = b.user_id
--   AND a.score = b.score
--   AND a.created_at < b.created_at;
--
-- Step 3: Add unique constraint
-- ALTER TABLE leaderboard_scores ADD CONSTRAINT leaderboard_scores_user_id_key UNIQUE (user_id);
--
-- Step 4: Update all rows to game_type = 'total'
-- UPDATE leaderboard_scores SET game_type = 'total';
