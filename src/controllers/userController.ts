export async function ensureUserHandler(req: any, res: any, next: any) {
  try {
    const userId = (req as any).body?.user_id
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'user_id (UUID string) required' })
      return
    }
    const { ensureUser } = await import('../services/userService')
    await ensureUser(userId)
    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
}

export async function updateScoreHandler(req: any, res: any, next: any) {
  try {
    const userId = (req as any).params.userId
    const score = Number((req as any).body?.score)
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId required' })
      return
    }
    if (Number.isNaN(score) || score < 0) {
      res.status(400).json({ error: 'score must be a non-negative number' })
      return
    }
    const { ensureUser, updateUserScore } = await import('../services/userService')
    await ensureUser(userId)
    await updateUserScore(userId, score)
    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
}
