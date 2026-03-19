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
  getNextSession,
  createSession,
  cleanupExpiredSessions,
  isSessionExpired,
  type GameSession,
  SESSION_DURATION_MS,
} from './sessionService'

// All game types and difficulties that need to be pre-generated
const BASIC_OPS: OperationMode[] = ['addition', 'subtraction', 'multiplication', 'division']
const DIFFS: GameDifficulty[] = ['easy', 'medium', 'hard']
const NEW_GAME_TYPES = ['square_root', 'fractions', 'percentage', 'algebra', 'speed_math', 'logic_puzzle'] as const
const PER_COMBO_TARGET = 50

/**
 * Get active games for the current session, filtered by type.
 * This is the main query endpoint — it never generates games.
 * If the active session expired, it promotes the preloaded "next" session.
 */
export async function getActiveGames(type?: OperationMode) {
  const supabase = getSupabaseClient()

  // Ensure we have an active session (promotes next if current expired)
  const session = await ensureActiveSession()

  let query = supabase
    .from('games')
    .select('*')
    .eq('session_id', session.id)

  // For "mixed" we return all games (no filter)
  if (type && type !== 'mixed') {
    query = query.eq('game_type', type)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error

  // If we got games, return them immediately
  if (data && data.length > 0) return data

  // Edge case: active session exists but has no games yet (first boot or
  // games weren't generated). Generate them now as a fallback, but this
  // should rarely happen once the scheduler is running.
  console.warn('[getActiveGames] No games found for active session, generating on-demand as fallback')
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

/**
 * Generate all game types × difficulties for a given session.
 * This is the core generation function used by both initial boot and preloading.
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

/**
 * Preload the next session: create a "next" session and generate all its games.
 * If a "next" session already exists, skip.
 */
export async function preloadNextSession(): Promise<void> {
  const existing = await getNextSession()
  if (existing) {
    console.log('[gameService] Next session already exists, skipping preload')
    return
  }

  // The next session starts when the current one expires
  const active = await ensureActiveSession()
  const nextStart = new Date(active.expires_at)
  const nextEnd = new Date(nextStart.getTime() + SESSION_DURATION_MS)

  const nextSession = await createSession('next', nextStart, nextEnd)
  await generateAllGamesForSession(nextSession)
  console.log(`[gameService] Preloaded next session ${nextSession.id}`)
}

/**
 * Force regenerate: wipe everything and create a fresh active session with games.
 * Used for initial boot to clear stale data.
 */
export async function forceRegenerateAllGames(perCombo = 50): Promise<void> {
  const supabase = getSupabaseClient()

  // Wipe all games
  const { error: gErr } = await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (gErr) {
    console.error('[forceRegenerateAllGames] delete games error', gErr)
    throw gErr
  }

  // Wipe all sessions
  const { error: sErr } = await supabase.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (sErr) {
    console.error('[forceRegenerateAllGames] delete sessions error', sErr)
    // Non-fatal — sessions table might not exist yet
  }

  // Create a fresh active session and generate all games
  const session = await createSession('active')
  await generateAllGamesForSession(session)

  console.log(`[forceRegenerateAllGames] Regenerated all games for fresh session ${session.id}`)
}

/** Delete games whose expires_at has passed (legacy cleanup). Returns how many were deleted. */
export async function deleteExpiredGames(): Promise<number> {
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('games')
    .delete()
    .lte('expires_at', nowIso)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

/**
 * Ensure games exist for the current active session.
 * This is a lightweight check — if the session has games, it's a no-op.
 * Only generates on-demand as a fallback.
 */
export async function ensureGamesExist(minCount = 10): Promise<void> {
  const session = await ensureActiveSession()
  const supabase = getSupabaseClient()

  // Quick check: does this session have any games at all?
  const { count, error } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id)

  if (error) throw error

  if ((count ?? 0) > 0) return // Session has games, we're good

  // No games for this session — generate them (fallback for first boot)
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

/** Generate custom games and persist them to the DB; returns the inserted rows. */
export async function generateAndStoreCustomGames(params: any): Promise<Array<Record<string, unknown>>> {
  const session = await ensureActiveSession()
  const games = generateCustomGames(params as any)
  return storeGeneratedGames(games, session.id, new Date(session.expires_at))
}

/** Get info about the current session for the /session endpoint. */
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
