import path from 'path'
import fs from 'fs'

type Difficulty = 'easy' | 'medium' | 'hard'

// ── In-memory cache: load each JSON file once ────────────────────────
const cache: Record<Difficulty, unknown[] | null> = {
  easy: null,
  medium: null,
  hard: null,
}

function dataDir(): string {
  return path.resolve(__dirname, '..', '..', 'data', 'ssc')
}

function loadDifficulty(diff: Difficulty): unknown[] {
  if (cache[diff]) return cache[diff]!
  const filePath = path.join(dataDir(), `${diff}.json`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw) as unknown[]
  cache[diff] = parsed
  return parsed
}

// Pre-load all three on first import so subsequent requests are instant
try {
  loadDifficulty('easy')
  loadDifficulty('medium')
  loadDifficulty('hard')
} catch {
  // Files may not exist in test environments — that's fine, will 404 at request time
}

// ── Handler ──────────────────────────────────────────────────────────
export async function getSscCglQuestions(req: any, res: any, next: any) {
  try {
    const diff = req.query?.difficulty as string | undefined

    if (!diff || !['easy', 'medium', 'hard'].includes(diff)) {
      res.status(400).json({
        error: 'Missing or invalid "difficulty" query param. Use: easy, medium, or hard.',
      })
      return
    }

    const questions = loadDifficulty(diff as Difficulty)
    res.json({ difficulty: diff, count: questions.length, questions })
  } catch (err) {
    next(err)
  }
}
