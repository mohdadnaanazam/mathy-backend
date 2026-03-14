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
): Promise<GeneratedGame[]> {
  if (!env.aiApiKey) {
    return generateGamesLocally(count)
  }

  try {
    const prompt = [
      `Generate exactly ${count} random math questions in JSON format.`,
      'Use only these operations: addition, subtraction, multiplication, division.',
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
    if (games.length === 0) return generateGamesLocally(count)
    return games.slice(0, count)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[generateGamesWithAI] Hugging Face failed, using local fallback', err)
    return generateGamesLocally(count)
  }
}

/** Extract a JSON array from model output (may be wrapped in markdown or extra text). */
function extractJsonArray(raw: string): unknown[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in response')
  return JSON.parse(match[0]) as unknown[]
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

function generateSingleQuestion(): GeneratedGame {
  const op = OPERATIONS[randomInt(0, OPERATIONS.length - 1)]
  const a = randomInt(1, 50)
  const b = randomInt(1, 50)

  let question: string
  let answer: number

  switch (op) {
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
      const divisor = randomInt(1, 12)
      const quotient = randomInt(1, 12)
      const dividend = divisor * quotient
      question = `${dividend} ÷ ${divisor} = ?`
      answer = quotient
      break
    }
    default:
      question = `${a} + ${b} = ?`
      answer = a + b
  }

  const difficulty: GameDifficulty =
    answer < 50 ? 'easy' : answer < 250 ? 'medium' : 'hard'

  return {
    game_type: op === 'addition' || op === 'subtraction' || op === 'multiplication' || op === 'division' ? op : 'mixed',
    question,
    correct_answer: answer,
    difficulty,
  }
}

function generateGamesLocally(count: number): GeneratedGame[] {
  return Array.from({ length: count }, () => generateSingleQuestion())
}

export async function generateAndStoreGames(batchSize = 20): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = new Date(now.getTime() + 60 * 60 * 1000) // +1 hour

  const rawGames = await generateGamesWithAI(batchSize)
  const games = GeneratedGameArraySchema.parse(rawGames)

  const payload = games.map(g => ({
    id: uuidv4(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }))

  // Supabase generic types are strict; cast payload to any for insert.
  const { error } = await supabase.from('games').insert(payload as any)
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[generateAndStoreGames] insert error', error)
    throw error
  }
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
        const divisor = randomInt(1, safeMax || 12)
        const quotient = randomInt(1, safeMax || 12)
        const dividend = divisor * quotient
        question = `${dividend} ÷ ${divisor} = ?`
        answer = quotient
        break
      }
      case 'mixed': {
        const mixedOp = OPERATIONS[randomInt(0, OPERATIONS.length - 1)]
        return generateCustomGames({ ...params, operation: mixedOp })
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

