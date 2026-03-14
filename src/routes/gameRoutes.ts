import { Router } from 'express'
import {
  getGames,
  getGamesByType,
  generateGamesHandler,
  generateCustomGamesHandler,
} from '../controllers/gameController'

const router = Router()

router.get('/', getGames)
router.get('/:type', getGamesByType)
router.post('/generate', generateGamesHandler)
router.post('/custom', generateCustomGamesHandler)

export default router

