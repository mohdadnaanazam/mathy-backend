import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getActiveGames, generateRandomGames, generateCustomGameBatch } from '../services/gameService'
import { OperationMode } from '../ai/types'

const customGameSchema = z.object({
  operation: z.enum(['addition', 'subtraction', 'multiplication', 'division', 'mixed']),
  min_number: z.number().int().min(0).default(0),
  max_number: z.number().int().min(1),
  questions: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
})

export async function getGames(req: Request, res: Response, next: NextFunction) {
  try {
    const games = await getActiveGames()
    res.json(games)
  } catch (err) {
    next(err)
  }
}

export async function getGamesByType(req: Request, res: Response, next: NextFunction) {
  try {
    const type = req.params.type as OperationMode
    const games = await getActiveGames(type)
    res.json(games)
  } catch (err) {
    next(err)
  }
}

export async function generateGamesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const batchSize = Number(req.query.count ?? 20)
    await generateRandomGames(Number.isNaN(batchSize) ? 20 : batchSize)
    res.status(201).json({ message: 'Games generated' })
  } catch (err) {
    next(err)
  }
}

export async function generateCustomGamesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customGameSchema.parse(req.body)
    const games = generateCustomGameBatch(parsed)
    res.status(201).json(games)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.issues })
      return
    }
    next(err)
  }
}

