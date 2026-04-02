import { Router } from 'express'
import { checkUserHandler, ensureUserHandler, updateScoreHandler, getUserCountHandler } from '../controllers/userController'

const router = Router()

router.get('/count', getUserCountHandler)
router.post('/check', checkUserHandler)
router.post('/', ensureUserHandler)
router.patch('/:userId', updateScoreHandler)

export default router
