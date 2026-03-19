import { Router } from 'express'
import { getSscCglQuestions } from '../controllers/sscCglController'

const router = Router()

// GET /api/ssc-cgl?difficulty=easy|medium|hard
router.get('/', getSscCglQuestions)

export default router
