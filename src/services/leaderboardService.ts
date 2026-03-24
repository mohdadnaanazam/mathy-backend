import { getSupabaseClient } from '../database/supabaseClient'

export interface LeaderboardEntry {
  id: string
  user_id: string
  username: string
  avatar_color: string
  score: number
  game_type: string
  created_at: string
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number
}

// ─── Rate Limiting ───────────────────────────────────────────────────
const RATE_LIMIT_MS = 5_000
const recentSubmissions = new Map<string, number>()

// ─── Submit / Upsert Score ───────────────────────────────────────────
// One row per user. Always overwrites with the latest total score.
export async function submitScore(
  userId: string,
  username: string,
  avatarColor: string,
  score: number,
  gameType: string,
): Promise<LeaderboardEntry> {
  const lastSubmit = recentSubmissions.get(userId) ?? 0
  if (Date.now() - lastSubmit < RATE_LIMIT_MS) {
    throw Object.assign(new Error('Too many submissions. Wait a few seconds.'), { status: 429 })
  }
  if (score < 0 || score > 100000) {
    throw Object.assign(new Error('Invalid score'), { status: 400 })
  }
  if (!username || username.length > 30) {
    throw Object.assign(new Error('Username must be 1-30 characters'), { status: 400 })
  }

  const supabase = getSupabaseClient()

  // Upsert: one row per user_id. Always update to latest total score.
  const entry = {
    user_id: userId,
    username: username.trim(),
    avatar_color: avatarColor || '#f97316',
    score,
    game_type: gameType || 'total',
    created_at: new Date().toISOString(),
  }

  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .upsert(entry, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  recentSubmissions.set(userId, Date.now())
  return data as LeaderboardEntry
}

// ─── Fetch Leaderboards ──────────────────────────────────────────────
// With upsert model, each user has exactly one row. No deduplication needed.

export async function getGlobalLeaderboard(limit = 50): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit)

  if (error) throw error
  return rankEntries(data ?? [])
}

export async function getDailyLeaderboard(limit = 50): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .gte('created_at', todayStart.toISOString())
    .order('score', { ascending: false })
    .limit(limit)

  if (error) throw error
  return rankEntries(data ?? [])
}

export async function getWeeklyLeaderboard(limit = 50): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .gte('created_at', weekStart.toISOString())
    .order('score', { ascending: false })
    .limit(limit)

  if (error) throw error
  return rankEntries(data ?? [])
}

export async function getUserRank(userId: string): Promise<{
  rank: number | null
  bestScore: number
  totalGames: number
}> {
  const supabase = getSupabaseClient()

  // With upsert, there's exactly one row per user
  const { data: userRow } = await (supabase as any)
    .from('leaderboard_scores')
    .select('score')
    .eq('user_id', userId)
    .single()

  if (!userRow) return { rank: null, bestScore: 0, totalGames: 0 }

  // Count users with higher score
  const { count: higherCount } = await (supabase as any)
    .from('leaderboard_scores')
    .select('user_id', { count: 'exact', head: true })
    .gt('score', userRow.score)

  return {
    rank: (higherCount ?? 0) + 1,
    bestScore: userRow.score,
    totalGames: 1, // single row per user now
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function rankEntries(entries: LeaderboardEntry[]): RankedEntry[] {
  return entries.map((entry, i) => ({ ...entry, rank: i + 1 }))
}
