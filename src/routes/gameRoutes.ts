import { Router } from 'express'
import {
  getGames,
  getGamesByType,
  generateGamesHandler,
  generateCustomGamesHandler,
  regenerateAllGamesHandler,
  getSessionHandler,
} from '../controllers/gameController'

const router = Router()

router.get('/session', getSessionHandler)
router.get('/', getGames)
router.get('/:type', getGamesByType)
router.post('/generate', generateGamesHandler)
router.post('/custom', generateCustomGamesHandler)
router.post('/regenerate', regenerateAllGamesHandler)

export default router

