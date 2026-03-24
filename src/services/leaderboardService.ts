import { getSupabaseClient } from '../database/supabaseClient'

export interface LeaderboardEntry {
  id: string
  user_id: string
  username: string
  avatar_color?: string
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
// Ensures exactly ONE row per user with the latest total score.
// Handles legacy multi-row data by cleaning up duplicates.
export async function submitScore(
  userId: string,
  username: string,
  _avatarColor: string,
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

  console.log(`[Leaderboard] submitScore: userId=${userId}, score=${score}`)

  // Fetch ALL rows for this user (no .single() — that fails on multiple rows)
  const { data: rows, error: fetchErr } = await (supabase as any)
    .from('leaderboard_scores')
    .select('id, score')
    .eq('user_id', userId)
    .order('score', { ascending: false })

  if (fetchErr) {
    console.error('[Leaderboard] Fetch failed:', fetchErr.message)
    throw fetchErr
  }

  const existingRows: { id: string; score: number }[] = rows ?? []
  console.log(`[Leaderboard] Found ${existingRows.length} existing row(s)`)

  // Build the data object — only include columns that exist in the table.
  // The table has: id, user_id, username, score, game_type, difficulty, created_at
  // It does NOT have avatar_color (based on actual Supabase schema).
  const writeData: Record<string, unknown> = {
    username: trimmedName,
    score,
    game_type: 'total',
    created_at: now,
  }

  let result: LeaderboardEntry

  if (existingRows.length > 0) {
    const keepId = existingRows[0].id
    const { data, error } = await (supabase as any)
      .from('leaderboard_scores')
      .update(writeData)
      .eq('id', keepId)
      .select()
      .single()

    if (error) {
      console.error('[Leaderboard] Update failed:', error.message, error.details, error.hint)
      throw error
    }

    console.log(`[Leaderboard] Updated: ${existingRows[0].score} → ${score}`)
    result = data as LeaderboardEntry

    // Delete duplicate rows
    if (existingRows.length > 1) {
      const dupeIds = existingRows.slice(1).map(r => r.id)
      console.log(`[Leaderboard] Cleaning ${dupeIds.length} duplicate(s)`)
      const { error: delErr } = await (supabase as any)
        .from('leaderboard_scores')
        .delete()
        .in('id', dupeIds)
      if (delErr) console.error('[Leaderboard] Cleanup failed:', delErr.message)
    }
  } else {
    const insertData = { ...writeData, user_id: userId }
    const { data, error } = await (supabase as any)
      .from('leaderboard_scores')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[Leaderboard] Insert failed:', error.message, error.details, error.hint)
      throw error
    }

    console.log(`[Leaderboard] Inserted new row with score ${score}`)
    result = data as LeaderboardEntry
  }

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
    .limit(limit * 3)

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

  const { data: rows } = await (supabase as any)
    .from('leaderboard_scores')
    .select('score')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)

  const userRow = rows?.[0]
  if (!userRow) return { rank: null, bestScore: 0, totalGames: 0 }

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
