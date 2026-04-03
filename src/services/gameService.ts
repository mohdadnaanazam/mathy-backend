import { getSupabaseClient } from '../database/supabaseClient'
import {
  GeneratedGame,
  generateAndStoreGames,
  generateCustomGames,
  storeGeneratedGames,
  GameDifficulty,
  generateAndStoreTrueFalseGames,
  generateAndStoreNewGameType,
} from '../ai/gameGenerator'
import { OperationMode } from '../ai/types'
import {
  ensureActiveSession,
  getActiveSession,
  getNextSession,
  createNextSession,
  promoteBatch,
  cleanupExpiredSessions,
  type GameSession,
  SESSION_DURATION_MS,
} from './sessionService'

// All game types and difficulties to pre-generate
const BASIC_OPS: OperationMode[] = ['addition', 'subtraction', 'multiplication', 'division']
const DIFFS: GameDifficulty[] = ['easy', 'medium', 'hard']
const NEW_GAME_TYPES = ['square_root', 'fractions', 'percentage', 'algebra', 'speed_math', 'logic_puzzle', 'speed_sort'] as const
const PER_COMBO_TARGET = 50

// ─── Public API: Fetch Games ─────────────────────────────────────────

/**
 * Get games from the active session. This is the main read endpoint.
 * NEVER generates games inline — returns what's available or empty array.
 * If the active session has no games, triggers background generation as fallback.
 */
export async function getActiveGames(type?: OperationMode) {
  const supabase = getSupabaseClient()
  const session = await ensureActiveSession()

  let query = supabase
    .from('games')
    .select('*')
    .eq('session_id', session.id)

  if (type && type !== 'mixed') {
    query = query.eq('game_type', type)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error

  if (data && data.length > 0) return data

  // Fallback: session exists but has no games (first boot / generation failed)
  console.warn('[getActiveGames] No games for active session, generating on-demand')
  await generateAllGamesForSession(session)

  // Re-query
  let retryQuery = supabase
    .from('games')
    .select('*')
    .eq('session_id', session.id)
  if (type && type !== 'mixed') {
    retryQuery = retryQuery.eq('game_type', type)
  }
  const { data: retryData, error: retryError } = await retryQuery.order('created_at', { ascending: false })
  if (retryError) throw retryError
  return retryData ?? []
}

// ─── Core: Generate Games for a Session ──────────────────────────────

/**
 * Generate ALL game types × difficulties for a given session.
 */
export async function generateAllGamesForSession(session: GameSession): Promise<void> {
  const expiresAt = new Date(session.expires_at)
  const sessionId = session.id

  console.log(`[gameService] Generating all games for session ${sessionId}`)

  // Basic math operations
  for (const op of BASIC_OPS) {
    for (const diff of DIFFS) {
      await generateAndStoreGames(PER_COMBO_TARGET, op, diff, sessionId, expiresAt)
    }
  }

  // True/false math
  for (const diff of DIFFS) {
    await generateAndStoreTrueFalseGames(PER_COMBO_TARGET, diff, sessionId, expiresAt)
  }

  // New game types
  for (const gt of NEW_GAME_TYPES) {
    for (const diff of DIFFS) {
      await generateAndStoreNewGameType(gt, PER_COMBO_TARGET, diff, sessionId, expiresAt)
    }
  }

  console.log(`[gameService] Finished generating all games for session ${sessionId}`)
}

// ─── Batch Rotation: Generate → Switch → Delete ─────────────────────

/**
 * The main rotation function. Called by the cron/scheduler.
 *
 * 1. Create a "next" session
 * 2. Generate all games into it
 * 3. Promote it to "active" (old becomes "expired")
 * 4. Delete expired sessions + games
 *
 * If generation fails, the old active session stays untouched.
 */
export async function rotateBatch(): Promise<void> {
  console.log('[rotateBatch] Starting batch rotation...')

  // Step 1: Create next session
  const nextSession = await createNextSession()
  console.log(`[rotateBatch] Next session: ${nextSession.id}`)

  // Step 2: Generate all games into the next session
  try {
    await generateAllGamesForSession(nextSession)
  } catch (err) {
    console.error('[rotateBatch] Generation failed — keeping current active batch', err)
    // Don't promote. Old active session stays. Next attempt will retry.
    return
  }

  // Step 3-4-5: Promote next → active, mark old → expired, delete old
  const promoted = await promoteBatch(nextSession.id)
  if (promoted) {
    console.log('[rotateBatch] Batch rotation complete')
  } else {
    console.error('[rotateBatch] Promotion failed — next session has games but is not active')
  }
}

/**
 * Preload the next session's games WITHOUT switching.
 * Used by the scheduler to prepare games in advance.
 */
export async function preloadNextSession(): Promise<void> {
  const existing = await getNextSession()
  if (existing) {
    // Check if it already has games
    const supabase = getSupabaseClient()
    const { count } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', existing.id)
    if ((count ?? 0) > 0) {
      console.log('[preload] Next session already has games, skipping')
      return
    }
    // Has session but no games — generate them
    await generateAllGamesForSession(existing)
    console.log(`[preload] Generated games for existing next session ${existing.id}`)
    return
  }

  const nextSession = await createNextSession()
  await generateAllGamesForSession(nextSession)
  console.log(`[preload] Preloaded next session ${nextSession.id}`)
}

// ─── Initial Boot ────────────────────────────────────────────────────

/**
 * Called on server startup. Instead of wiping everything (which causes downtime),
 * this checks if we have a valid active session with games. If not, creates one.
 * Then cleans up any stale data in the background.
 */
export async function initializeOnBoot(): Promise<void> {
  console.log('[boot] Initializing game system...')

  // Check if we already have a valid active session with games
  const active = await getActiveSession()
  if (active) {
    const supabase = getSupabaseClient()
    const { count } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', active.id)

    if ((count ?? 0) > 0) {
      console.log(`[boot] Active session ${active.id} has ${count} games — system ready`)
      // Clean up stale data in background
      cleanupExpiredSessions().catch(err => console.error('[boot] Cleanup error', err))
      return
    }

    // Active session exists but has no games — generate them
    console.log('[boot] Active session has no games, generating...')
    await generateAllGamesForSession(active)
    cleanupExpiredSessions().catch(err => console.error('[boot] Cleanup error', err))
    return
  }

  // No active session at all — do a full rotation
  console.log('[boot] No active session found, creating fresh batch...')
  await rotateBatch()
}

// ─── Legacy / Compatibility ──────────────────────────────────────────

/** Force regenerate: wipe everything and create fresh. Use sparingly. */
export async function forceRegenerateAllGames(perCombo = 50): Promise<void> {
  // Instead of wiping, just do a proper rotation
  await rotateBatch()
}

export async function ensureGamesExist(minCount = 10): Promise<void> {
  const session = await ensureActiveSession()
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id)
  if (error) throw error
  if ((count ?? 0) > 0) return
  console.warn('[ensureGamesExist] No games for active session, generating...')
  await generateAllGamesForSession(session)
}

export async function generateRandomGames(
  batchSize = 20,
  operation?: OperationMode,
  difficulty?: GameDifficulty,
) {
  const session = await ensureActiveSession()
  await generateAndStoreGames(batchSize, operation, difficulty, session.id, new Date(session.expires_at))
}

export function generateCustomGameBatch(params: any): GeneratedGame[] {
  return generateCustomGames(params as any)
}

export async function generateAndStoreCustomGames(params: any): Promise<Array<Record<string, unknown>>> {
  const session = await ensureActiveSession()
  const games = generateCustomGames(params as any)
  return storeGeneratedGames(games, session.id, new Date(session.expires_at))
}

export async function getSessionInfo(): Promise<{
  session_id: string
  starts_at: string
  expires_at: string
  status: string
  games_count: number
  next_session_ready: boolean
}> {
  const session = await ensureActiveSession()
  const supabase = getSupabaseClient()
  const { count } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id)
  const next = await getNextSession()
  return {
    session_id: session.id,
    starts_at: session.starts_at,
    expires_at: session.expires_at,
    status: session.status,
    games_count: count ?? 0,
    next_session_ready: next !== null,
  }
}

/** Delete games whose expires_at has passed (legacy). */
export async function deleteExpiredGames(): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('games').delete().lte('expires_at', new Date().toISOString()).select('id')
  if (error) throw error
  return data?.length ?? 0
}
