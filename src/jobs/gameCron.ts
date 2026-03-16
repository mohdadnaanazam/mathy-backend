import cron from 'node-cron'
import { deleteExpiredGames, ensureGamesExist, forceRegenerateAllGames } from '../services/gameService'

// Track whether we've done the initial full regeneration (clears stale data from old code).
let initialRegenerationDone = false

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
  // Run once at startup: full flush + regenerate to clear any stale games
  // from old code that used wrong number ranges.
  ;(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log('[cron] Initial full regeneration — clearing stale games')
      await forceRegenerateAllGames(50)
      initialRegenerationDone = true
      // eslint-disable-next-line no-console
      console.log('[cron] Initial regeneration complete')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[cron] Error during initial regeneration, falling back to ensure', error)
      try {
        await runHourlyGameRefresh()
      } catch (err2) {
        // eslint-disable-next-line no-console
        console.error('[cron] Fallback also failed', err2)
      }
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

