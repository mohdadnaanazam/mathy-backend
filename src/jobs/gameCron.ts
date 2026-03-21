import { initializeOnBoot, preloadNextSession, rotateBatch } from '../services/gameService'
import {
  getActiveSession,
  getNextSession,
  shouldPreloadNow,
  cleanupExpiredSessions,
  promoteBatch,
  isSessionExpired,
} from '../services/sessionService'

let preloadTimer: ReturnType<typeof setTimeout> | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null

/**
 * Schedule the preload + rotation cycle based on the active session's expiry.
 */
async function schedulePreload(): Promise<void> {
  if (preloadTimer) { clearTimeout(preloadTimer); preloadTimer = null }

  const session = await getActiveSession()
  if (!session) {
    console.log('[scheduler] No active session, will retry on next check')
    return
  }

  // If next session already exists and current has expired, promote immediately
  if (isSessionExpired(session)) {
    const next = await getNextSession()
    if (next) {
      console.log('[scheduler] Active expired + next ready — promoting now')
      await promoteBatch(next.id)
      await schedulePreload() // re-schedule for the new active
      return
    }
    // No next session — do a full rotation
    console.log('[scheduler] Active expired + no next — full rotation')
    await rotateBatch()
    await schedulePreload()
    return
  }

  // Check if next session already exists
  const next = await getNextSession()
  if (next) {
    // Wait until current expires, then promote + schedule next cycle
    const expiresIn = new Date(session.expires_at).getTime() - Date.now()
    if (expiresIn > 0) {
      console.log(`[scheduler] Next ready, will promote in ${Math.round(expiresIn / 1000)}s`)
      preloadTimer = setTimeout(async () => {
        await promoteBatch(next.id)
        await runCycle()
      }, expiresIn + 1000)
    }
    return
  }

  // Should we preload now? (5 min before expiry)
  if (shouldPreloadNow(session)) {
    console.log('[scheduler] Preload window — generating next session now')
    try { await preloadNextSession() } catch (err) { console.error('[scheduler] Preload failed', err) }

    const expiresIn = new Date(session.expires_at).getTime() - Date.now()
    if (expiresIn > 0) {
      preloadTimer = setTimeout(async () => {
        const n = await getNextSession()
        if (n) await promoteBatch(n.id)
        await runCycle()
      }, expiresIn + 1000)
    }
    return
  }

  // Schedule preload for 5 min before expiry
  const preloadAt = new Date(new Date(session.expires_at).getTime() - 5 * 60 * 1000)
  const delayMs = preloadAt.getTime() - Date.now()
  if (delayMs > 0) {
    console.log(`[scheduler] Preload in ${Math.round(delayMs / 1000)}s`)
    preloadTimer = setTimeout(async () => {
      try { await preloadNextSession() } catch (err) { console.error('[scheduler] Preload failed', err) }
      const s = await getActiveSession()
      if (s) {
        const wait = new Date(s.expires_at).getTime() - Date.now()
        if (wait > 0) {
          preloadTimer = setTimeout(async () => {
            const n = await getNextSession()
            if (n) await promoteBatch(n.id)
            await runCycle()
          }, wait + 1000)
        }
      }
    }, delayMs)
  }
}

async function runCycle(): Promise<void> {
  try { await cleanupExpiredSessions() } catch (err) { console.error('[scheduler] Cleanup error', err) }
  await schedulePreload()
}

export function startGameCron() {
  // Boot: check existing data, only generate if needed (no wipe)
  ;(async () => {
    try {
      await initializeOnBoot()
      await schedulePreload()
    } catch (error) {
      console.error('[scheduler] Boot error', error)
      // Fallback: try to at least have something
      try {
        const { ensureGamesExist } = await import('../services/gameService')
        await ensureGamesExist(50)
        await schedulePreload()
      } catch (err2) {
        console.error('[scheduler] Fallback also failed', err2)
      }
    }
  })()

  // Safety net: every 5 minutes, check for issues
  checkInterval = setInterval(async () => {
    try {
      // Always clean up stale data
      await cleanupExpiredSessions()

      const session = await getActiveSession()
      if (!session) {
        console.log('[scheduler:check] No active session — running full rotation')
        await rotateBatch()
        await schedulePreload()
        return
      }

      // If session expired and next is ready, promote
      if (isSessionExpired(session)) {
        const next = await getNextSession()
        if (next) {
          await promoteBatch(next.id)
        } else {
          await rotateBatch()
        }
        await schedulePreload()
        return
      }

      // If preload window and no next session, preload
      if (shouldPreloadNow(session)) {
        const next = await getNextSession()
        if (!next) {
          console.log('[scheduler:check] Preload window, generating next session')
          await preloadNextSession()
        }
      }
    } catch (err) {
      console.error('[scheduler:check] Error', err)
    }
  }, 5 * 60 * 1000)
}
