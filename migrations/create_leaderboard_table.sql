-- Leaderboard scores table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  avatar_color TEXT NOT NULL DEFAULT '#f97316',
  score INTEGER NOT NULL CHECK (score >= 0),
  game_type TEXT NOT NULL DEFAULT 'mixed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_created ON leaderboard_scores (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_daily ON leaderboard_scores (created_at DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_game_type ON leaderboard_scores (game_type);

-- Enable Row Level Security
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read leaderboard
CREATE POLICY "Public read leaderboard" ON leaderboard_scores
  FOR SELECT USING (true);

-- Allow inserts via service role (backend)
CREATE POLICY "Service insert leaderboard" ON leaderboard_scores
  FOR INSERT WITH CHECK (true);

-- If upgrading from old schema (no avatar_color column), run:
-- ALTER TABLE leaderboard_scores ADD COLUMN IF NOT EXISTS avatar_color TEXT NOT NULL DEFAULT '#f97316';
-- CREATE INDEX IF NOT EXISTS idx_leaderboard_game_type ON leaderboard_scores (game_type);
