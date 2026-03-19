import { getSupabaseClient } from '../database/supabaseClient'
import { v4 as uuidv4 } from 'uuid'

export type SessionStatus = 'active' | 'next' | 'expired'

export interface GameSession {
  id: string
  starts_at: string
  expires_at: string
  status: SessionStatus
  created_at: string
}

const SESSION_DURATION_MS = 60 * 60 * 1000 // 1 hour
const PRELOAD_BEFORE_MS = 5 * 60 * 1000    // 5 minutes before expiry

/**
 * Get the currently active session (status = 'active' and not yet expired).
 */
export async function getActiveSession(): Promise<GameSession | null> {
  const supabase = getSupabaseClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as GameSession
}

/**
 * Get the preloaded "next" session.
 */
export async function getNextSession(): Promise<GameSession | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'next')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as GameSession
}

/**
 * Create a new session with the given status.
 * startsAt/expiresAt default to now + 1 hour.
 */
export async function createSession(
  status: SessionStatus,
  startsAt?: Date,
  expiresAt?: Date,
): Promise<GameSession> {
  const supabase = getSupabaseClient()
  const now = new Date()
  const start = startsAt ?? now
  const end = expiresAt ?? new Date(start.getTime() + SESSION_DURATION_MS)

  const session: GameSession = {
    id: uuidv4(),
    starts_at: start.toISOString(),
    expires_at: end.toISOString(),
    status,
    created_at: now.toISOString(),
  }

  const { error } = await supabase.from('sessions').insert(session as any)
  if (error) {
    console.error('[sessionService] Failed to create session', error)
    throw error
  }

  console.log(`[sessionService] Created ${status} session ${session.id}, expires ${session.expires_at}`)
  return session
}

/**
 * Promote the "next" session to "active" and mark old active sessions as "expired".
 * Returns the newly active session.
 */
export async function promoteNextSession(): Promise<GameSession | null> {
  const supabase = getSupabaseClient()

  // Mark all active sessions as expired
  const client = supabase as any
  await client
    .from('sessions')
    .update({ status: 'expired' })
    .eq('status', 'active')

  // Promote next → active
  const next = await getNextSession()
  if (!next) return null

  const { error } = await client
    .from('sessions')
    .update({ status: 'active' })
    .eq('id', next.id)

  if (error) {
    console.error('[sessionService] Failed to promote session', error)
    return null
  }

  console.log(`[sessionService] Promoted session ${next.id} to active`)
  return { ...next, status: 'active' }
}

/**
 * Delete all expired sessions and their associated games.
 * Also cleans up orphaned games (null session_id or expired timestamps).
 * Only keeps current + next session data.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = getSupabaseClient()
  let totalDeleted = 0

  // 1. Delete games belonging to expired sessions
  const { data: expiredSessions, error: fetchErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('status', 'expired') as any

  if (!fetchErr && expiredSessions?.length) {
    const expiredIds = (expiredSessions as any[]).map((s: any) => s.id)

    const { data: deletedGames } = await supabase
      .from('games')
      .delete()
      .in('session_id', expiredIds)
      .select('id')

    await supabase
      .from('sessions')
      .delete()
      .in('id', expiredIds)

    const count = deletedGames?.length ?? 0
    totalDeleted += count
    if (count > 0) {
      console.log(`[sessionService] Cleaned up ${expiredIds.length} expired sessions, ${count} games`)
    }
  }

  // 2. Delete orphaned games (null session_id)
  const { data: orphaned } = await supabase
    .from('games')
    .delete()
    .is('session_id', null)
    .select('id')

  if (orphaned?.length) {
    totalDeleted += orphaned.length
    console.log(`[sessionService] Cleaned up ${orphaned.length} orphaned games (null session_id)`)
  }

  // 3. Delete games whose expires_at has passed (safety net for stale data)
  const nowIso = new Date().toISOString()
  const { data: stale } = await supabase
    .from('games')
    .delete()
    .lte('expires_at', nowIso)
    .select('id')

  if (stale?.length) {
    totalDeleted += stale.length
    console.log(`[sessionService] Cleaned up ${stale.length} stale games (past expires_at)`)
  }

  return totalDeleted
}

/**
 * Get or create the active session. If no active session exists,
 * try to promote a "next" session. If that also doesn't exist,
 * create a brand new active session.
 */
export async function ensureActiveSession(): Promise<GameSession> {
  // 1. Check for existing active session
  let session = await getActiveSession()
  if (session) return session

  // 2. Try to promote a preloaded "next" session
  session = await promoteNextSession()
  if (session) {
    // Clean up old expired sessions in the background
    cleanupExpiredSessions().catch(err =>
      console.error('[sessionService] Cleanup error', err),
    )
    return session
  }

  // 3. No sessions at all — create a fresh active session
  return createSession('active')
}

/**
 * Calculate when preloading should start for a given session.
 */
export function getPreloadTime(session: GameSession): Date {
  const expiresAt = new Date(session.expires_at)
  return new Date(expiresAt.getTime() - PRELOAD_BEFORE_MS)
}

/**
 * Check if it's time to preload the next session.
 */
export function shouldPreloadNow(session: GameSession): boolean {
  const preloadAt = getPreloadTime(session)
  return new Date() >= preloadAt
}

/**
 * Check if a session has expired.
 */
export function isSessionExpired(session: GameSession): boolean {
  return new Date() >= new Date(session.expires_at)
}

export { SESSION_DURATION_MS, PRELOAD_BEFORE_MS }
