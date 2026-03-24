import {
  submitScore,
  getGlobalLeaderboard,
  getDailyLeaderboard,
  getWeeklyLeaderboard,
  getUserRank,
} from '../services/leaderboardService'

export async function submitScoreHandler(req: any, res: any, next: any) {
  try {
    const { user_id, username, avatar_color, score, game_type } = req.body ?? {}
    if (!user_id || typeof user_id !== 'string') return res.status(400).json({ error: 'user_id required' })
    if (!username || typeof username !== 'string') return res.status(400).json({ error: 'username required' })
    if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'score must be non-negative' })

    const entry = await submitScore(user_id, username, avatar_color || '#f97316', score, game_type || 'mixed')
    res.status(201).json(entry)
  } catch (err: any) {
    if (err.status === 429) return res.status(429).json({ error: err.message })
    if (err.status === 400) return res.status(400).json({ error: err.message })
    next(err)
  }
}

export async function getGlobalHandler(req: any, res: any, next: any) {
  try {
    const gameType = req.query.game_type as string | undefined
    const data = await getGlobalLeaderboard(50, gameType)
    res.json(data)
  } catch (err) { next(err) }
}

export async function getDailyHandler(req: any, res: any, next: any) {
  try {
    const gameType = req.query.game_type as string | undefined
    const data = await getDailyLeaderboard(50, gameType)
    res.json(data)
  } catch (err) { next(err) }
}

export async function getWeeklyHandler(req: any, res: any, next: any) {
  try {
    const gameType = req.query.game_type as string | undefined
    const data = await getWeeklyLeaderboard(50, gameType)
    res.json(data)
  } catch (err) { next(err) }
}

export async function getUserRankHandler(req: any, res: any, next: any) {
  try {
    const userId = req.params.userId
    if (!userId) return res.status(400).json({ error: 'userId required' })
    const data = await getUserRank(userId)
    res.json(data)
  } catch (err) { next(err) }
}
