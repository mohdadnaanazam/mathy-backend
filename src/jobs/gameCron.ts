import { forceRegenerateAllGames, preloadNextSession, ensureGamesExist } from '../services/gameService'
import {
  ensureActiveSession,
  getActiveSession,
  getNextSession,
  getPreloadTime,
  shouldPreloadNow,
  cleanupExpiredSessions,
} from '../services/sessionService'

let preloadTimer: ReturnType<typeof setTimeout> | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null

/**
 * Schedule preloading for the next session based on the active session's expiry.
 * Uses setTimeout for precise time-based scheduling (not interval-based).
 */
async function schedulePreload(): Promise<void> {
  // Clear any existing timer
  if (preloadTimer) {
    clearTimeout(preloadTimer)
    preloadTimer = null
  }

  const session = await getActiveSession()
  if (!session) {
    console.log('[scheduler] No active session found, will retry on next check')
    return
  }

  // Check if next session already exists
  const next = await getNextSession()
  if (next) {
    console.log('[scheduler] Next session already preloaded, scheduling for after current expires')
    // Schedule a check for when the current session expires (to set up the next cycle)
    const expiresIn = new Date(session.expires_at).getTime() - Date.now()
    if (expiresIn > 0) {
      preloadTimer = setTimeout(async () => {
        console.log('[scheduler] Active session expired, running new cycle')
        await runSchedulerCycle()
      }, expiresIn + 1000) // +1s buffer
    }
    return
  }

  // Should we preload now?
  if (shouldPreloadNow(session)) {
    console.log('[scheduler] Preload window reached, generating next session now')
    try {
      await preloadNextSession()
    } catch (err) {
      console.error('[scheduler] Preload failed', err)
    }
    // Schedule next cycle for when current session expires
    const expiresIn = new Date(session.expires_at).getTime() - Date.now()
    if (expiresIn > 0) {
      preloadTimer = setTimeout(async () => {
        await runSchedulerCycle()
      }, expiresIn + 1000)
    }
    return
  }

  // Schedule preload for 5 minutes before expiry
  const preloadAt = getPreloadTime(session)
  const delayMs = preloadAt.getTime() - Date.now()

  if (delayMs > 0) {
    console.log(`[scheduler] Preload scheduled in ${Math.round(delayMs / 1000)}s (at ${preloadAt.toISOString()})`)
    preloadTimer = setTimeout(async () => {
      console.log('[scheduler] Preload timer fired')
      try {
        await preloadNextSession()
      } catch (err) {
        console.error('[scheduler] Preload failed', err)
      }
      // After preloading, schedule next cycle
      const session = await getActiveSession()
      if (session) {
        const expiresIn = new Date(session.expires_at).getTime() - Date.now()
        if (expiresIn > 0) {
          preloadTimer = setTimeout(async () => {
            await runSchedulerCycle()
          }, expiresIn + 1000)
        }
      }
    }, delayMs)
  }
}

/**
 * Run a full scheduler cycle: cleanup expired sessions, then schedule next preload.
 */
async function runSchedulerCycle(): Promise<void> {
  try {
    await cleanupExpiredSessions()
  } catch (err) {
    console.error('[scheduler] Cleanup error', err)
  }

  // Ensure we have an active session (promotes next if current expired)
  try {
    await ensureActiveSession()
  } catch (err) {
    console.error('[scheduler] ensureActiveSession error', err)
  }

  await schedulePreload()
}

export function startGameCron() {
  // Run once at startup: full flush + regenerate to clear stale games
  ;(async () => {
    try {
      console.log('[scheduler] Initial full regeneration — clearing stale games')
      await forceRegenerateAllGames(50)
      console.log('[scheduler] Initial regeneration complete')

      // Schedule the first preload cycle
      await schedulePreload()
    } catch (error) {
      console.error('[scheduler] Error during initial regeneration, falling back to ensure', error)
      try {
        await ensureGamesExist(50)
        await schedulePreload()
      } catch (err2) {
        console.error('[scheduler] Fallback also failed', err2)
      }
    }
  })()

  // Safety net: check every 5 minutes in case a setTimeout was missed
  // (e.g. due to Node.js timer drift or process restart).
  // Also runs cleanup to prevent stale data accumulation.
  checkInterval = setInterval(async () => {
    try {
      // Always run cleanup to catch orphaned/stale games
      await cleanupExpiredSessions()

      const session = await getActiveSession()
      if (!session) {
        console.log('[scheduler:check] No active session, running cycle')
        await runSchedulerCycle()
        return
      }

      // If we should be preloading but haven't yet, do it now
      if (shouldPreloadNow(session)) {
        const next = await getNextSession()
        if (!next) {
          console.log('[scheduler:check] Preload window reached but no next session, triggering preload')
          await preloadNextSession()
        }
      }
    } catch (err) {
      console.error('[scheduler:check] Error in safety check', err)
    }
  }, 5 * 60 * 1000) // every 5 minutes
}
