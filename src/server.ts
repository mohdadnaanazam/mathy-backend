import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import gameRoutes from './routes/gameRoutes'
import { errorHandler } from './utils/errorHandler'
import { startGameCron } from './jobs/gameCron'

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [env.frontendUrl, env.frontendUrlLocal].filter(Boolean)
      if (!origin) return callback(null, true) // non-browser clients
      if (allowed.includes(origin)) return callback(null, true)
      return callback(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    name: 'Mathy API',
    version: '1.0',
    endpoints: { health: '/health', games: '/games', gamesByType: '/games/:type' },
  })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/games', gameRoutes)

app.use(errorHandler)

startGameCron()

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mathy backend listening on port ${env.port}`)
})

