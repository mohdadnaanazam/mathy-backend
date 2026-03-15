import { Router } from 'express'
import { ensureUserHandler, updateScoreHandler } from '../controllers/userController'

const router = Router()

router.post('/', ensureUserHandler)
router.patch('/:userId', updateScoreHandler)

export default router
