import { Router } from 'express'
import {
  submitScoreHandler,
  getGlobalHandler,
  getDailyHandler,
  getWeeklyHandler,
  getUserRankHandler,
  updateUsernameHandler,
} from '../controllers/leaderboardController'

const router = Router()

router.post('/submit-score', submitScoreHandler)
router.patch('/username', updateUsernameHandler)
router.get('/global', getGlobalHandler)
router.get('/daily', getDailyHandler)
router.get('/weekly', getWeeklyHandler)
router.get('/rank/:userId', getUserRankHandler)

export default router
