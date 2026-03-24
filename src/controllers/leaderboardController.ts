import {
  submitScore,
  getGlobalLeaderboard,
  getDailyLeaderboard,
  getWeeklyLeaderboard,
  getUserRank,
} from '../services/leaderboardService'

export async function submitScoreHandler(req: any, res: any, next: any) {
  try {
    const { user_id, username, score, game_type, difficulty } = req.body ?? {}

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ error: 'user_id required' })
    }
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username required (1-30 chars)' })
    }
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'score must be a non-negative number' })
    }

    const entry = await submitScore(
      user_id,
      username,
      score,
      game_type || 'mixed',
      difficulty || 'easy',
    )
    res.status(201).json(entry)
  } catch (err: any) {
    if (err.status === 429) return res.status(429).json({ error: err.message })
    if (err.status === 400) return res.status(400).json({ error: err.message })
    next(err)
  }
}

export async function getGlobalHandler(_req: any, res: any, next: any) {
  try {
    const data = await getGlobalLeaderboard()
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function getDailyHandler(_req: any, res: any, next: any) {
  try {
    const data = await getDailyLeaderboard()
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function getWeeklyHandler(_req: any, res: any, next: any) {
  try {
    const data = await getWeeklyLeaderboard()
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function getUserRankHandler(req: any, res: any, next: any) {
  try {
    const userId = req.params.userId
    if (!userId) return res.status(400).json({ error: 'userId required' })
    const data = await getUserRank(userId)
    res.json(data)
  } catch (err) {
    next(err)
  }
}
