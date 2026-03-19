-- Migration: Add sessions table and session_id to games
-- Run this in your Supabase SQL Editor before deploying the new backend.

-- 1. Create the sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'next', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by status
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- 2. Add session_id column to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;

-- Index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_games_session_id ON games (session_id);

-- 3. Backfill: existing games without a session_id will be cleaned up
--    on first backend boot (forceRegenerateAllGames wipes everything).
--    No backfill needed.
