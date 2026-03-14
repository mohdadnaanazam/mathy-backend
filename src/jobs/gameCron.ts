import cron from 'node-cron'
import { deleteExpiredGames, generateRandomGames } from '../services/gameService'

const HOURLY_BATCH_SIZE = 20

async function runHourlyGameRefresh(): Promise<void> {
  const deleted = await deleteExpiredGames()
  await generateRandomGames(HOURLY_BATCH_SIZE)
  // eslint-disable-next-line no-console
  console.log(`[cron] Hourly refresh: deleted ${deleted} old games, added ${HOURLY_BATCH_SIZE} new games`)
}

export function startGameCron() {
  // Run once at startup so the DB has games immediately.
  ;(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[cron] Initial game maintenance run')
      await runHourlyGameRefresh()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cron] Error during initial run', error)
    }
  })()

  // Every hour at minute 0: delete expired games, then add new games.
  cron.schedule('0 * * * *', async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[cron] Running hourly game refresh')
      await runHourlyGameRefresh()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cron] Error running hourly job', error)
    }
  })
}

