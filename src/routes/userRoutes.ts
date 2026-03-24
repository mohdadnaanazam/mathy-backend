import { Router } from 'express'
import { checkUserHandler, ensureUserHandler, updateScoreHandler } from '../controllers/userController'

const router = Router()

router.post('/check', checkUserHandler)
router.post('/', ensureUserHandler)
router.patch('/:userId', updateScoreHandler)

export default router
