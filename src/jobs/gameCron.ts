import cron from 'node-cron'
import { deleteExpiredGames, ensureGamesExist } from '../services/gameService'

async function runHourlyGameRefresh(): Promise<void> {
  let deleted = 0
  try {
    deleted = await deleteExpiredGames()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron] Failed to delete expired games, continuing with generation', err)
  }
  // Generate games for every (operation × difficulty) combo so all
  // difficulty levels always have questions available — even when the
  // LLM is down and we fall back to local generation.
  await ensureGamesExist(50)
  // eslint-disable-next-line no-console
  console.log(`[cron] Hourly refresh: deleted ${deleted} old games, ensured all combos filled`)
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

