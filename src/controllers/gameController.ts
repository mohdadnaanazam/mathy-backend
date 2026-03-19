import { z } from 'zod'
import {
  ensureGamesExist,
  getActiveGames,
  generateRandomGames,
  generateAndStoreCustomGames,
  forceRegenerateAllGames,
  getSessionInfo,
} from '../services/gameService.js'
import { OperationMode } from '../ai/types.js'

const customGameSchema = z.object({
  operation: z.enum(['addition', 'subtraction', 'multiplication', 'division', 'mixed']),
  min_number: z.number().int().min(0).default(0),
  max_number: z.number().int().min(1),
  questions: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
})

export async function getGames(req: any, res: any, next: any) {
  try {
    // No on-demand generation — just return what's in the active session
    const games = await getActiveGames()
    res.json(games)
  } catch (err) {
    next(err)
  }
}

const VALID_GAME_TYPES: readonly string[] = [
  'addition', 'subtraction', 'multiplication', 'division', 'mixed', 'true_false_math',
  'square_root', 'fractions', 'percentage', 'algebra', 'speed_math', 'logic_puzzle',
]

export async function getGamesByType(req: any, res: any, next: any) {
  try {
    const type = (req as any).params.type as string
    if (!VALID_GAME_TYPES.includes(type)) {
      res.status(400).json({ error: `Invalid game type "${type}". Must be one of: ${VALID_GAME_TYPES.join(', ')}` })
      return
    }
    // No on-demand generation — just return preloaded session games
    const games = await getActiveGames(type as OperationMode)
    res.json(games)
  } catch (err) {
    next(err)
  }
}

export async function generateGamesHandler(req: any, res: any, next: any) {
  try {
    const rawCount = (req as any).query?.count
    const batchSize = Number(rawCount ?? 20)
    await generateRandomGames(Number.isNaN(batchSize) ? 20 : batchSize)
    res.status(201).json({ message: 'Games generated' })
  } catch (err) {
    next(err)
  }
}

export async function generateCustomGamesHandler(req: any, res: any, next: any) {
  try {
    const parsed = customGameSchema.parse((req as any).body)
    const saved = await generateAndStoreCustomGames(parsed as any)
    res.status(201).json(saved)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.issues })
      return
    }
    next(err)
  }
}

export async function regenerateAllGamesHandler(req: any, res: any, next: any) {
  try {
    await forceRegenerateAllGames(50)
    res.status(201).json({ message: 'All games regenerated for every operation × difficulty combo' })
  } catch (err) {
    next(err)
  }
}

export async function getSessionHandler(req: any, res: any, next: any) {
  try {
    const info = await getSessionInfo()
    res.json(info)
  } catch (err) {
    next(err)
  }
}
