-- Leaderboard scores table (upsert model: one row per user)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 1 AND 30),
  score INTEGER NOT NULL CHECK (score >= 0),
  game_type TEXT NOT NULL DEFAULT 'total',
  difficulty TEXT DEFAULT NULL,
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

-- Allow inserts/updates/deletes via service role (backend)
CREATE POLICY "Service insert leaderboard" ON leaderboard_scores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update leaderboard" ON leaderboard_scores
  FOR UPDATE USING (true);

CREATE POLICY "Service delete leaderboard" ON leaderboard_scores
  FOR DELETE USING (true);
