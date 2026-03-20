import { z } from 'zod'
import { env } from '../config/env'
import { OperationMode } from './types'
import { getSupabaseClient } from '../database/supabaseClient'
import { randomUUID } from 'crypto'
import { generateText } from './huggingfaceClient'

// Lightweight type shared with backend; mirrors frontend OperationMode
export type GameDifficulty = 'easy' | 'medium' | 'hard'

export const GeneratedGameSchema = z.object({
  game_type: z.enum([
    'addition', 'subtraction', 'multiplication', 'division', 'mixed',
    'true_false_math', 'square_root', 'fractions', 'percentage',
    'algebra', 'speed_math', 'logic_puzzle',
  ]),
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
      ? `All questions must match "${difficultyHint}" difficulty using digit-count scaling. Easy: 1–2 digit numbers. Medium: 2–3 digit numbers. Hard: 3–5 digit numbers. Multiplication: Easy = 1–2 digit × 1 digit, Medium = 2 digit × 2 digit, Hard = 3 digit × 2 digit. Division must always produce integer results. Do NOT use small numbers in Medium or Hard.`
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

  // Digit-count-based ranges:
  // Easy:   1–2 digits (1–99)
  // Medium: 2–3 digits (10–999)
  // Hard:   3–5 digits (100–99999)
  const ranges: Record<GameDifficulty, { min: number; max: number }> = {
    easy:   { min: 1,   max: 99 },
    medium: { min: 10,  max: 999 },
    hard:   { min: 100, max: 99999 },
  }

  // Multiplication scaling by digit count:
  // Easy:   1–2 digit × 1 digit
  // Medium: 2 digit × 2 digit
  // Hard:   3 digit × 2 digit (or 2 digit × 3 digit)
  type MulRange = { aMin: number; aMax: number; bMin: number; bMax: number }
  const mulRanges: Record<GameDifficulty, MulRange> = {
    easy:   { aMin: 1,   aMax: 99,  bMin: 2, bMax: 9 },
    medium: { aMin: 10,  aMax: 99,  bMin: 10, bMax: 99 },
    hard:   { aMin: 100, aMax: 999, bMin: 10, bMax: 99 },
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
      const mr = mulRanges[difficulty]
      const a = randomInt(mr.aMin, mr.aMax)
      const b = randomInt(mr.bMin, mr.bMax)
      question = `${a} × ${b} = ?`
      answer = a * b
      break
    }
    case 'division': {
      // Generate divisor and quotient using multiplication ranges,
      // then compute dividend = divisor × quotient for clean integer division.
      const mr = mulRanges[difficulty]
      const divisor = randomInt(mr.bMin, mr.bMax)
      const quotient = randomInt(mr.bMin, mr.bMax)
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
  // Generate with deduplication — avoid repeating the same question in a batch
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  const maxAttempts = count * 5

  while (results.length < count && attempts < maxAttempts) {
    attempts++
    const q = generateSingleQuestion(operation, difficulty)
    if (!seen.has(q.question)) {
      seen.add(q.question)
      results.push(q)
    }
  }

  return results
}

export async function generateAndStoreGames(
  batchSize = 20,
  operation?: OperationMode,
  difficulty?: GameDifficulty,
  sessionId?: string,
  expiresAt?: Date,
): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000) // +1 hour

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
    id: randomUUID(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    session_id: sessionId ?? null,
  }))

  const { error } = await supabase.from('games').insert(payload as any)
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[generateAndStoreGames] insert error', error)
    throw error
  }
  // eslint-disable-next-line no-console
  console.log('[generateAndStoreGames] Inserted', payload.length, 'games', sessionId ? `for session ${sessionId}` : '')
}

/** Insert generated games into DB and return the inserted rows (with id, created_at, expires_at). */
export async function storeGeneratedGames(
  games: GeneratedGame[],
  sessionId?: string,
  expiresAt?: Date,
): Promise<Array<Record<string, unknown>>> {
  if (games.length === 0) return []
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000)

  const payload = games.map(g => ({
    id: randomUUID(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    session_id: sessionId ?? null,
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


// ─── True / False Math ───────────────────────────────────────────────

/**
 * Generate a single True/False math question.
 * Picks a random operation, generates operands per difficulty,
 * then randomly decides if the displayed result is correct or wrong.
 * If wrong, the displayed result is offset by a small amount close to the real answer.
 */
function generateSingleTrueFalseQuestion(
  forcedDifficulty?: GameDifficulty,
): GeneratedGame {
  const op = OPERATIONS[randomInt(0, OPERATIONS.length - 1)]
  const difficulty: GameDifficulty = forcedDifficulty ?? 'easy'

  const ranges: Record<GameDifficulty, { min: number; max: number }> = {
    easy:   { min: 1,   max: 99 },
    medium: { min: 10,  max: 999 },
    hard:   { min: 100, max: 99999 },
  }

  type MulRange = { aMin: number; aMax: number; bMin: number; bMax: number }
  const mulRanges: Record<GameDifficulty, MulRange> = {
    easy:   { aMin: 1,   aMax: 99,  bMin: 2, bMax: 9 },
    medium: { aMin: 10,  aMax: 99,  bMin: 10, bMax: 99 },
    hard:   { aMin: 100, aMax: 999, bMin: 10, bMax: 99 },
  }

  const opSymbol: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
  }

  let a: number, b: number, correctAnswer: number

  switch (op) {
    case 'addition': {
      const { min, max } = ranges[difficulty]
      a = randomInt(min, max)
      b = randomInt(min, max)
      correctAnswer = a + b
      break
    }
    case 'subtraction': {
      const { min, max } = ranges[difficulty]
      a = randomInt(min, max)
      b = randomInt(min, max)
      if (b > a) [a, b] = [b, a]
      correctAnswer = a - b
      break
    }
    case 'multiplication': {
      const mr = mulRanges[difficulty]
      a = randomInt(mr.aMin, mr.aMax)
      b = randomInt(mr.bMin, mr.bMax)
      correctAnswer = a * b
      break
    }
    case 'division': {
      const mr = mulRanges[difficulty]
      const divisor = randomInt(mr.bMin, mr.bMax)
      const quotient = randomInt(mr.bMin, mr.bMax)
      a = divisor * quotient
      b = divisor
      correctAnswer = quotient
      break
    }
    default: {
      const { min, max } = ranges[difficulty]
      a = randomInt(min, max)
      b = randomInt(min, max)
      correctAnswer = a + b
    }
  }

  // 50/50 chance: show correct or wrong result
  const isTrue = Math.random() < 0.5
  let displayResult: number

  if (isTrue) {
    displayResult = correctAnswer
  } else {
    // Generate a close-but-wrong result
    // Offset by 1–10% of the correct answer, minimum ±1
    const magnitude = Math.max(1, Math.ceil(Math.abs(correctAnswer) * 0.1))
    let offset = randomInt(1, magnitude)
    // Randomly positive or negative offset
    if (Math.random() < 0.5) offset = -offset
    displayResult = correctAnswer + offset
    // Ensure we didn't accidentally land on the correct answer
    if (displayResult === correctAnswer) displayResult = correctAnswer + 1
  }

  const symbol = opSymbol[op] ?? '+'
  const question = `${a} ${symbol} ${b} = ${displayResult} ?`

  return {
    game_type: 'true_false_math',
    question,
    correct_answer: isTrue ? 'true' : 'false',
    difficulty,
  }
}

/**
 * Generate a batch of True/False math questions with deduplication.
 */
export function generateTrueFalseGamesLocally(
  count: number,
  difficulty?: GameDifficulty,
): GeneratedGame[] {
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  const maxAttempts = count * 5

  while (results.length < count && attempts < maxAttempts) {
    attempts++
    const q = generateSingleTrueFalseQuestion(difficulty)
    if (!seen.has(q.question)) {
      seen.add(q.question)
      results.push(q)
    }
  }

  return results
}

/**
 * Generate True/False games and store them in Supabase.
 */
export async function generateAndStoreTrueFalseGames(
  batchSize = 20,
  difficulty?: GameDifficulty,
  sessionId?: string,
  expiresAt?: Date,
): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const expires = expiresAt ?? new Date(now.getTime() + 60 * 60 * 1000)

  const games = generateTrueFalseGamesLocally(batchSize, difficulty)

  if (games.length === 0) {
    console.warn('[generateAndStoreTrueFalseGames] No games to insert')
    return
  }

  const payload = games.map(g => ({
    id: randomUUID(),
    game_type: g.game_type,
    question: g.question,
    correct_answer: String(g.correct_answer),
    difficulty: g.difficulty,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    session_id: sessionId ?? null,
  }))

  const { error } = await supabase.from('games').insert(payload as any)
  if (error) {
    console.error('[generateAndStoreTrueFalseGames] insert error', error)
    throw error
  }
  console.log('[generateAndStoreTrueFalseGames] Inserted', payload.length, 'games')
}

// ─── New Game Type Generators ────────────────────────────────────────

/** Perfect squares by difficulty. */
const PERFECT_SQUARES: Record<GameDifficulty, number[]> = {
  easy:   [1, 4, 9, 16, 25, 36, 49, 64, 81, 100],
  medium: [121, 144, 169, 196, 225, 256, 289, 324, 361, 400, 441, 484, 529, 576, 625],
  hard:   [676, 729, 784, 841, 900, 961, 1024, 1089, 1156, 1225, 1296, 1369, 1444, 1521, 1600, 1681, 1764, 1849, 1936, 2025, 2500, 3600, 4900, 6400, 8100, 10000],
}

function generateSingleSquareRootQuestion(difficulty: GameDifficulty): GeneratedGame {
  const pool = PERFECT_SQUARES[difficulty]
  const n = pool[randomInt(0, pool.length - 1)]
  const root = Math.round(Math.sqrt(n))
  return { game_type: 'square_root', question: `√${n} = ?`, correct_answer: root, difficulty }
}

export function generateSquareRootGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSingleSquareRootQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

function generateSingleFractionQuestion(difficulty: GameDifficulty): GeneratedGame {
  const maxDenom: Record<GameDifficulty, number> = { easy: 10, medium: 20, hard: 50 }
  const md = maxDenom[difficulty]
  const d1 = randomInt(2, md), n1 = randomInt(1, d1 - 1)
  const d2 = randomInt(2, md), n2 = randomInt(1, d2 - 1)
  const ops = ['+', '-'] as const
  const op = ops[randomInt(0, ops.length - 1)]
  const numResult = op === '+' ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1
  const denomResult = d1 * d2
  const g = gcd(Math.abs(numResult), denomResult)
  const sn = numResult / g, sd = denomResult / g
  const answer = sd === 1 ? `${sn}` : `${sn}/${sd}`
  return { game_type: 'fractions', question: `${n1}/${d1} ${op} ${n2}/${d2} = ?`, correct_answer: answer, difficulty }
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }

export function generateFractionGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSingleFractionQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

function generateSinglePercentageQuestion(difficulty: GameDifficulty): GeneratedGame {
  const ranges: Record<GameDifficulty, { maxBase: number; percents: number[] }> = {
    easy:   { maxBase: 100,  percents: [10, 20, 25, 50] },
    medium: { maxBase: 500,  percents: [5, 10, 15, 20, 25, 30, 40, 50, 75] },
    hard:   { maxBase: 2000, percents: [3, 7, 12, 15, 18, 22, 33, 45, 60, 85] },
  }
  const { maxBase, percents } = ranges[difficulty]
  const base = randomInt(10, maxBase)
  const pct = percents[randomInt(0, percents.length - 1)]
  const answer = (base * pct) / 100
  return { game_type: 'percentage', question: `${pct}% of ${base} = ?`, correct_answer: answer, difficulty }
}

export function generatePercentageGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSinglePercentageQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

function generateSingleAlgebraQuestion(difficulty: GameDifficulty): GeneratedGame {
  // Solve for x: a*x + b = c
  const ranges: Record<GameDifficulty, { aMax: number; xMax: number; bMax: number }> = {
    easy:   { aMax: 1, xMax: 20, bMax: 20 },
    medium: { aMax: 9, xMax: 20, bMax: 50 },
    hard:   { aMax: 15, xMax: 50, bMax: 200 },
  }
  const { aMax, xMax, bMax } = ranges[difficulty]
  const x = randomInt(1, xMax)
  const a = randomInt(1, aMax)
  const b = randomInt(0, bMax)
  const c = a * x + b
  const question = a === 1 ? `x + ${b} = ${c}, x = ?` : `${a}x + ${b} = ${c}, x = ?`
  return { game_type: 'algebra', question, correct_answer: x, difficulty }
}

export function generateAlgebraGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSingleAlgebraQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

function generateSingleSpeedMathQuestion(difficulty: GameDifficulty): GeneratedGame {
  // Chain of two operations: a op1 b op2 c (left-to-right, no precedence)
  const ranges: Record<GameDifficulty, { min: number; max: number }> = {
    easy:   { min: 1, max: 20 },
    medium: { min: 5, max: 50 },
    hard:   { min: 10, max: 200 },
  }
  const { min, max } = ranges[difficulty]
  const a = randomInt(min, max), b = randomInt(min, max), c = randomInt(min, max)
  const ops = ['+', '-'] as const
  const op1 = ops[randomInt(0, 1)], op2 = ops[randomInt(0, 1)]
  const step1 = op1 === '+' ? a + b : a - b
  const answer = op2 === '+' ? step1 + c : step1 - c
  return { game_type: 'speed_math', question: `${a} ${op1} ${b} ${op2} ${c} = ?`, correct_answer: answer, difficulty }
}

export function generateSpeedMathGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSingleSpeedMathQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

function generateSingleLogicPuzzleQuestion(difficulty: GameDifficulty): GeneratedGame {
  // Number sequence: find the next number
  const start = randomInt(1, difficulty === 'easy' ? 10 : difficulty === 'medium' ? 30 : 100)
  const step = randomInt(difficulty === 'easy' ? 1 : 2, difficulty === 'easy' ? 5 : difficulty === 'medium' ? 12 : 25)
  const len = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6
  const seq: number[] = []
  for (let i = 0; i < len; i++) seq.push(start + step * i)
  const answer = start + step * len
  return { game_type: 'logic_puzzle', question: `${seq.join(', ')}, ? = ?`, correct_answer: answer, difficulty }
}

export function generateLogicPuzzleGamesLocally(count: number, difficulty?: GameDifficulty): GeneratedGame[] {
  const diff = difficulty ?? 'easy'
  const seen = new Set<string>()
  const results: GeneratedGame[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 5) {
    attempts++
    const q = generateSingleLogicPuzzleQuestion(diff)
    if (!seen.has(q.question)) { seen.add(q.question); results.push(q) }
  }
  return results
}

/** Unified generator: store a batch of any new game type into Supabase. */
export async function generateAndStoreNewGameType(
  gameType: 'square_root' | 'fractions' | 'percentage' | 'algebra' | 'speed_math' | 'logic_puzzle',
  batchSize = 20,
  difficulty?: GameDifficulty,
  sessionId?: string,
  expiresAt?: Date,
): Promise<void> {
  const generators: Record<string, (c: number, d?: GameDifficulty) => GeneratedGame[]> = {
    square_root: generateSquareRootGamesLocally,
    fractions: generateFractionGamesLocally,
    percentage: generatePercentageGamesLocally,
    algebra: generateAlgebraGamesLocally,
    speed_math: generateSpeedMathGamesLocally,
    logic_puzzle: generateLogicPuzzleGamesLocally,
  }
  const gen = generators[gameType]
  if (!gen) throw new Error(`Unknown game type: ${gameType}`)
  const games = gen(batchSize, difficulty)
  if (games.length === 0) return
  await storeGeneratedGames(games, sessionId, expiresAt)
}
