export async function checkUserHandler(req: any, res: any, next: any) {
  try {
    const userId = req.body?.user_id
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'user_id required' })
    }
    const { checkUserExists } = await import('../services/userService')
    const exists = await checkUserExists(userId)
    res.status(200).json({ ok: true, exists })
  } catch (err) {
    next(err)
  }
}

export async function ensureUserHandler(req: any, res: any, next: any) {
  try {
    const { user_id, username, avatar } = req.body ?? {}
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ error: 'user_id (UUID string) required' })
    }
    const { ensureUser } = await import('../services/userService')
    await ensureUser(user_id, username, avatar)
    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
}

export async function updateScoreHandler(req: any, res: any, next: any) {
  try {
    const userId = req.params.userId
    const score = Number(req.body?.score)
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId required' })
    }
    if (Number.isNaN(score) || score < 0) {
      return res.status(400).json({ error: 'score must be a non-negative number' })
    }
    const { ensureUser, updateUserScore } = await import('../services/userService')
    await ensureUser(userId)
    await updateUserScore(userId, score)
    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
}
