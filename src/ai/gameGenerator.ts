import { z } from 'zod'
import { env } from '../config/env'
import { OperationMode } from './types'
import { getSupabaseClient } from '../database/supabaseClient'
import { v4 as uuidv4 } from 'uuid'
import { generateText } from './huggingfaceClient'

// Lightweight type shared with backend; mirrors frontend OperationMode
export type GameDifficulty = 'easy' | 'medium' | 'hard'

export const GeneratedGameSchema = z.object({
  game_type: z.enum(['addition', 'subtraction', 'multiplication', 'division', 'mixed']),
  question: z.string(),
  correct_answer: z.union([z.string(), z.number()]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
})

export type GeneratedGame = z.infer<typeof GeneratedGameSchema>

export const GeneratedGameArraySchema = z.array(GeneratedGameSchema)

/**
 * Generate math games using LangChain (prompt) + Hugging Face Inference API.
 * Falls back to local deterministic generation if no AI_API_KEY or on error.
 */
export async function generateGamesWithAI(
  count: number,
  operation?: OperationMode,
  difficultyHint?: GameDifficulty,
): Promise<GeneratedGame[]> {
  if (!env.aiApiKey) {
    return generateGamesLocally(count, operation, difficultyHint)
  }

  try {
    const opPart = operation && operation !== 'mixed'
      ? `Only use the "${operation}" operation for all questions.`
      : 'Use only these operations: addition, subtraction, multiplication, division.'
    const diffPart = difficultyHint
      ? `All questions must match "${difficultyHint}" difficulty. Number ranges: easy = 1–10, medium = 10–50, hard = 50–200. For multiplication: easy = 1–10, medium = 5–15, hard = 10–30. Do NOT use numbers outside these ranges.`
      : 'Mix easy, medium, and hard questions.'

    const prompt = [
      `Generate exactly ${count} random math questions in JSON format.`,
      opPart,
      diffPart,
      'Return ONLY a JSON array, no extra text.',
      'Each object must have: "game_type" (addition|subtraction|multiplication|division),',
      '"question" (e.g. "12 + 7 = ?"), "correct_answer" (number), "difficulty" (easy|medium|hard).',
      'Example:',
      '[{"game_type":"addition","question":"15 + 9 = ?","correct_answer":24,"difficulty":"easy"}]',
      `Now generate ${count} questions as a single JSON array.`,
    ].join('\n')

    const raw = await generateText(prompt)
    const parsed = extractJsonArray(raw)
    const games = GeneratedGameArraySchema.parse(parsed)
    if (games.length === 0) return generateGamesLocally(count, operation, difficultyHint)
    return games.slice(0, count)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[generateGamesWithAI] Hugging Face failed, using local fallback', err)
    return generateGamesLocally(count, operation, difficultyHint)
  }
}

/** Extract a JSON array from model output (may be wrapped in markdown or extra text). */
function extractJsonArray(raw: string): unknown[] {
  // Use non-greedy match to avoid grabbing content between separate arrays
  const match = raw.match(/\[[\s\S]*?\]/)
  if (!match) throw new Error('No JSON array in response')
  // If the non-greedy match fails to parse (nested arrays), fall back to greedy
  try {
    return JSON.parse(match[0]) as unknown[]
  } catch {
    const greedyMatch = raw.match(/\[[\s\S]*\]/)
    if (!greedyMatch) throw new Error('No valid JSON array in response')
    return JSON.parse(greedyMatch[0]) as unknown[]
  }
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const OPERATIONS: Array<'addition' | 'subtraction' | 'multiplication' | 'division'> = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
]

function generateSingleQuestion(
  forcedOp?: OperationMode,
  forcedDifficulty?: GameDifficulty,
): GeneratedGame {
  const opBase = forcedOp && forcedOp !== 'mixed' && forcedOp !== 'custom'
    ? forcedOp
    : OPERATIONS[randomInt(0, OPERATIONS.length - 1)]
  const op = opBase as (typeof OPERATIONS)[number]

  const difficulty: GameDifficulty = forcedDifficulty ?? 'easy'

  // Number ranges per difficulty
  const ranges: Record<GameDifficulty, { min: number; max: number }> = {
    easy:   { min: 1,  max: 10 },
    medium: { min: 10, max: 50 },
    hard:   { min: 50, max: 200 },
  }
  // Multiplication uses smaller ranges to keep answers reasonable
  const mulRanges: Record<GameDifficulty, { min: number; max: number }> = {
    easy:   { min: 1,  max: 10 },
    medium: { min: 5,  max: 15 },
    hard:   { min: 10, max: 30 },
  }

  let question: string
  let answer: number

  switch (op) {
    case 'addition': {
      const { min, max } = ranges[difficulty]
      const a = randomInt(min, max)
      const b = randomInt(min, max)
      question = `${a} + ${b} = ?`
      answer = a + b
      break
    }
    case 'subtraction': {
      const { min, max } = ranges[difficulty]
      let a = randomInt(min, max)
      let b = randomInt(min, max)
      if (b > a) [a, b] = [b, a]
      question = `${a} - ${b} = ?`
      answer = a - b
      break
    }
    case 'multiplication': {
      const { min, max } = mulRanges[difficulty]
      const a = randomInt(min, max)
      const b = randomInt(min, max)
      question = `${a} × ${b} = ?`
      answer = a * b
      break
    }
    case 'division': {
      const { min, max } = mulRanges[difficulty]
      const divisor = randomInt(min, max)
      const quotient = randomInt(min, max)
      const dividend = divisor * quotient
      question = `${dividend} ÷ ${divisor} = ?`
      answer = quotient
      break
    }
    default: {
      const { min, max } = ranges[difficulty]
      const a = randomInt(min, max)
      const b = randomInt(min, max)
      question = `${a} + ${b} = ?`
      answer = a + b
    }
  }

  return {
    game_type: op === 'addition' || op === 'subtraction' || op === 'multiplication' || op === 'division' ? op : 'mixed',
    question,
    correct_answer: answer,
    difficulty,
  }
}

function generateGamesLocally(
  count: number,
  operation?: OperationMode,
  difficulty?: GameDifficulty,
): GeneratedGame[] {
  return Array.from(
    { length: count },
    () => generateSingleQuestion(operation, difficulty),
  )
}

export async function generateAndStoreGames(
  batchSize = 20,
  operation?: OperationMode,
  difficulty?: GameDifficulty,
): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = new Date(now.getTime() + 60 * 60 * 1000) // +1 hour

  let games: GeneratedGame[]
  try {
    const rawGames = await generateGamesWithAI(batchSize, operation, difficulty)
    games = GeneratedGameArraySchema.parse(rawGames)
  } catch (parseErr) {
    // eslint-disable-next-line no-console
    console.warn('[generateAndStoreGames] AI output invalid, using local fallback', parseErr)
    games = generateGamesLocally(batchSize, operation, difficulty)
  }

  if (games.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[generateAndStoreGames] No games to insert')
    return
  }

  const payload = games.map(g => ({
    id: uuidv4(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }))

  const { error } = await supabase.from('games').insert(payload as any)
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[generateAndStoreGames] insert error', error)
    throw error
  }
  // eslint-disable-next-line no-console
  console.log('[generateAndStoreGames] Inserted', payload.length, 'games')
}

/** Insert generated games into DB and return the inserted rows (with id, created_at, expires_at). */
export async function storeGeneratedGames(games: GeneratedGame[]): Promise<Array<Record<string, unknown>>> {
  if (games.length === 0) return []
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = new Date(now.getTime() + 60 * 60 * 1000)

  const payload = games.map(g => ({
    id: uuidv4(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }))

  const { data, error } = await supabase.from('games').insert(payload as any).select()
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[storeGeneratedGames] insert error', error)
    throw error
  }
  return (data ?? []) as Array<Record<string, unknown>>
}

export function generateCustomGames(params: {
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed'
  min_number: number
  max_number: number
  questions: number
  difficulty: GameDifficulty
}): GeneratedGame[] {
  const { operation, min_number, max_number, questions, difficulty } = params

  const safeMin = Math.max(0, Math.min(min_number, max_number))
  const safeMax = Math.max(min_number, max_number)

  const list: GeneratedGame[] = []
  for (let i = 0; i < questions; i += 1) {
    const a = randomInt(safeMin, safeMax)
    const b = randomInt(safeMin, safeMax || 1) || 1
    let question: string
    let answer: number

    switch (operation) {
      case 'addition':
        question = `${a} + ${b} = ?`
        answer = a + b
        break
      case 'subtraction': {
        const [x, y] = a >= b ? [a, b] : [b, a]
        question = `${x} - ${y} = ?`
        answer = x - y
        break
      }
      case 'multiplication':
        question = `${a} × ${b} = ?`
        answer = a * b
        break
      case 'division': {
        const divisor = randomInt(safeMin || 1, safeMax || 12)
        const quotient = randomInt(safeMin || 1, safeMax || 12)
        const dividend = divisor * quotient
        question = `${dividend} ÷ ${divisor} = ?`
        answer = quotient
        break
      }
      case 'mixed': {
        const mixedOp = OPERATIONS[randomInt(0, OPERATIONS.length - 1)]
        const g = generateCustomGames({ ...params, operation: mixedOp, questions: 1 })
        list.push(...g)
        continue
      }
      default:
        question = `${a} + ${b} = ?`
        answer = a + b
    }

    list.push({
      game_type: operation as GeneratedGame['game_type'],
      question,
      correct_answer: answer,
      difficulty,
    })
  }

  return list
}

