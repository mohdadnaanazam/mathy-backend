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

// ─── Submit Score ────────────────────────────────────────────────────
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
  if (score < 0 || score > 10000) {
    throw Object.assign(new Error('Invalid score'), { status: 400 })
  }
  if (!username || username.length > 30) {
    throw Object.assign(new Error('Username must be 1-30 characters'), { status: 400 })
  }

  const supabase = getSupabaseClient()
  const entry = {
    user_id: userId,
    username: username.trim(),
    avatar_color: avatarColor || '#f97316',
    score,
    game_type: gameType || 'mixed',
    created_at: new Date().toISOString(),
  }

  const { data, error } = await (supabase as any)
    .from('leaderboard_scores')
    .insert(entry)
    .select()
    .single()

  if (error) throw error
  recentSubmissions.set(userId, Date.now())
  return data as LeaderboardEntry
}


// ─── Fetch Leaderboards ──────────────────────────────────────────────

export async function getGlobalLeaderboard(limit = 50, gameType?: string): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  let query = (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit * 3)

  if (gameType && gameType !== 'all') {
    query = query.eq('game_type', gameType)
  }

  const { data, error } = await query
  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
}

export async function getDailyLeaderboard(limit = 50, gameType?: string): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let query = (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .gte('created_at', todayStart.toISOString())
    .order('score', { ascending: false })
    .limit(limit * 3)

  if (gameType && gameType !== 'all') {
    query = query.eq('game_type', gameType)
  }

  const { data, error } = await query
  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
}

export async function getWeeklyLeaderboard(limit = 50, gameType?: string): Promise<RankedEntry[]> {
  const supabase = getSupabaseClient()
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)

  let query = (supabase as any)
    .from('leaderboard_scores')
    .select('*')
    .gte('created_at', weekStart.toISOString())
    .order('score', { ascending: false })
    .limit(limit * 3)

  if (gameType && gameType !== 'all') {
    query = query.eq('game_type', gameType)
  }

  const { data, error } = await query
  if (error) throw error
  return deduplicateAndRank(data ?? [], limit)
}

export async function getUserRank(userId: string): Promise<{
  rank: number | null
  bestScore: number
  totalGames: number
}> {
  const supabase = getSupabaseClient()
  const { data: userBest } = await (supabase as any)
    .from('leaderboard_scores')
    .select('score')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (!userBest) return { rank: null, bestScore: 0, totalGames: 0 }

  const { count: higherCount } = await (supabase as any)
    .from('leaderboard_scores')
    .select('user_id', { count: 'exact', head: true })
    .gt('score', userBest.score)

  const { count: totalGames } = await (supabase as any)
    .from('leaderboard_scores')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  return {
    rank: (higherCount ?? 0) + 1,
    bestScore: userBest.score,
    totalGames: totalGames ?? 0,
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
