import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import gameRoutes from './routes/gameRoutes'
import userRoutes from './routes/userRoutes'
import sscCglRoutes from './routes/sscCglRoutes'
import leaderboardRoutes from './routes/leaderboardRoutes'
import { errorHandler } from './utils/errorHandler'
import { startGameCron } from './jobs/gameCron'
import { startPushCron } from './jobs/pushCron'
import pushRoutes from './routes/pushRoutes'

const app = express()

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
const allowedOrigins = [
  'https://www.themathy.com',
  'https://themathy.com',
  'https://matthy.netlify.app',
  'http://localhost:5173',
]
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  credentials: true,
}))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    name: 'Mathy API',
    version: '1.0',
    endpoints: {
      health: '/health',
      healthDb: '/health/db',
      session: '/games/session',
      games: '/games',
      gamesByType: '/games/:type',
      generate: 'POST /games/generate',
      sscCgl: '/api/ssc-cgl?difficulty=easy|medium|hard',
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Check Supabase connection and current row count (for debugging "no data" issues)
app.get('/health/db', async (_req, res) => {
  try {
    const supabaseUrl = env.supabaseUrl
    const hasKey = Boolean(env.supabaseServiceRoleKey)
    if (!supabaseUrl || !hasKey) {
      return res.status(503).json({
        status: 'error',
        message: 'Supabase not configured',
        hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
      })
    }
    const { getSupabaseClient } = await import('./database/supabaseClient')
    const supabase = getSupabaseClient()
    const { count, error } = await supabase.from('games').select('*', { count: 'exact', head: true })
    if (error) {
      return res.status(503).json({
        status: 'error',
        message: 'Database error',
        error: error.message,
        hint: 'Ensure the "games" table exists in Supabase (Table Editor). Required columns: id, game_type, question, correct_answer, difficulty, created_at, expires_at',
      })
    }
    res.json({
      status: 'ok',
      configured: true,
      gamesCount: count ?? 0,
      hint: 'POST /games/generate to insert new games',
    })
  } catch (e: any) {
    res.status(503).json({ status: 'error', message: e?.message ?? 'Unknown error' })
  }
})

app.use('/games', gameRoutes)
app.use('/users', userRoutes)
app.use('/api/ssc-cgl', sscCglRoutes)
app.use('/leaderboard', leaderboardRoutes)
app.use('/push', pushRoutes)

app.use(errorHandler)

startGameCron()
startPushCron()

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mathy backend listening on port ${env.port}`)
})

