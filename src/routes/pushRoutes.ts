import { Router } from 'express'
import { subscribe, unsubscribe } from '../controllers/pushController'

const router = Router()

/**
 * @route POST /push/subscribe
 * @desc  Save or update a push subscription for the browser
 */
router.post('/subscribe', subscribe)

/**
 * @route POST /push/unsubscribe
 * @desc  Remove a push subscription when browser disables it
 */
router.post('/unsubscribe', unsubscribe)

export default router
