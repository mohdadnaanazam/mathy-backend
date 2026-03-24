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
const RATE_LIMIT_MS = 3_000
const recentSubmissions = new Map<string, number>()

// ─── Submit / Upsert Score ───────────────────────────────────────────
// One row per user. Always overwrites with the latest total score.
// Works whether or not the UNIQUE constraint on user_id exists.
export async function submitScore(
  userId: string,
  username: string,
  avatarColor: string,
  score: number,
  _gameType: string,
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
  const now = new Date().toISOString()
  const trimmedName = username.trim()
  const color = avatarColor || '#f97316'

  // Check if user already has a row
  const { data: existing } = await (supabase as any)
    .from('leaderboard_scores')
    .select('id, score')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  let result: LeaderboardEntry

  if (existing) {
    // UPDATE existing row with latest total score (always overwrite)
    const { data, error } = await (supabase as any)
      .from('leaderboard_scores')
      .update({
        username: trimmedName,
        avatar_color: color,
        score,
        game_type: 'total',
        created_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('[Leaderboard] Update failed:', error.message)
      throw error
    }
    console.log(`[Leaderboard] Updated user ${userId}: ${existing.score} → ${score}`)
    result = data as LeaderboardEntry
  } else {
    // INSERT new row
    const { data, error } = await (supabase as any)
      .from('leaderboard_scores')
      .insert({
        user_id: userId,
        username: trimmedName,
        avatar_color: color,
        score,
        game_type: 'total',
        created_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error('[Leaderboard] Insert failed:', error.message)
      throw error
    }
    console.log(`[Leaderboard] Inserted user ${userId} with score ${score}`)
    result = data as LeaderboardEntry
  }

  // Clean up any duplicate rows for this user (keep only the one we just wrote)
  await (supabase as any)
    .from('leaderboard_scores')
    .delete()
    .eq('user_id', userId)
    .neq('id', result.id)
    .then(() => {}) // fire-and-forget cleanup
    .catch(() => {}) // ignore cleanup errors

  recentSubmissions.set(userId, Date.now())
  return result
}

// ─── Fetch Leaderboards ──────────────────────────────────────────────

export async function getGlobalLeaderboard(limit = 50): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit * 3) // over-fetch to handle duplicates

  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
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
    .limit(limit * 3)

  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
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
    .limit(limit * 3)

  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
}

export async function getUserRank(userId: string): Promise<{
  rank: number | null
  bestScore: number
  totalGames: number
}> {
  const supabase = getSupabaseClient()

  const { data: userRow } = await (supabase as any)
    .from('leaderboard_scores')
    .select('score')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (!userRow) return { rank: null, bestScore: 0, totalGames: 0 }

  // Count distinct users with higher score
  const { count: higherCount } = await (supabase as any)
    .from('leaderboard_scores')
    .select('user_id', { count: 'exact', head: true })
    .gt('score', userRow.score)

  return {
    rank: (higherCount ?? 0) + 1,
    bestScore: userRow.score,
    totalGames: 1,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function deduplicateAndRank(entries: LeaderboardEntry[], limit: number): RankedEntry[] {
  const bestByUser = new Map<string, LeaderboardEntry>()
  for (const e of entries) {
    const existing = bestByUser.get(e.user_id)
    if (!existing || e.score > existing.score) {
      bestByUser.set(e.user_id, e)
    }
  }
  return [...bestByUser.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}
