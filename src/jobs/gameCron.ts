import cron from 'node-cron'
import { deleteExpiredGames, generateRandomGames } from '../services/gameService'

export function startGameCron() {
  // Run once at startup so fresh deploys aren't empty until the next hour.
  ;(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[cron] Initial game maintenance run')
      await deleteExpiredGames()
      await generateRandomGames(20)
      // eslint-disable-next-line no-console
      console.log('[cron] Initial run completed')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cron] Error during initial run', error)
    }
  })()

  // Runs every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[cron] Running hourly game maintenance job')
      await deleteExpiredGames()
      await generateRandomGames(20)
      // eslint-disable-next-line no-console
      console.log('[cron] Completed')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cron] Error running hourly job', error)
    }
  })
}

