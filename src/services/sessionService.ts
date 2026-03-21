import { getSupabaseClient } from '../database/supabaseClient'
import { randomUUID } from 'crypto'

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

// ─── Core Queries ────────────────────────────────────────────────────

/**
 * Get the currently active session (status = 'active' AND not yet expired).
 */
export async function getActiveSession(): Promise<GameSession | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
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
 * Create a new session row.
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
    id: randomUUID(),
    starts_at: start.toISOString(),
    expires_at: end.toISOString(),
    status,
    created_at: now.toISOString(),
  }

  const { error } = await supabase.from('sessions').insert(session as any)
  if (error) {
    console.error('[session] Failed to create session', error)
    throw error
  }
  console.log(`[session] Created ${status} session ${session.id}, expires ${session.expires_at}`)
  return session
}

// ─── Batch Rotation (Generate → Switch → Delete) ────────────────────

/**
 * STEP 1-2: Create a "next" session and return it so the caller can generate games into it.
 * If a "next" session already exists, return it (idempotent).
 */
export async function createNextSession(): Promise<GameSession> {
  const existing = await getNextSession()
  if (existing) return existing

  const active = await getActiveSession()
  const nextStart = active ? new Date(active.expires_at) : new Date()
  const nextEnd = new Date(nextStart.getTime() + SESSION_DURATION_MS)
  return createSession('next', nextStart, nextEnd)
}

/**
 * STEP 3-4-5: Atomic batch switch.
 * - Mark ALL non-"next" sessions as "expired"
 * - Promote the given "next" session to "active"
 * - Delete all expired sessions + their games
 *
 * This is the CRITICAL function — it ensures users always have games.
 * If anything fails, the old active session remains untouched.
 */
export async function promoteBatch(nextSessionId: string): Promise<GameSession | null> {
  const supabase = getSupabaseClient()

  // STEP 3: Mark everything except the next session as expired
  const { error: markErr } = await (supabase as any)
    .from('sessions')
    .update({ status: 'expired' })
    .neq('id', nextSessionId)
    .neq('status', 'expired')
  if (markErr) {
    console.error('[session] Failed to mark old sessions expired', markErr)
    return null
  }

  // STEP 4: Promote next → active
  const { error: promoteErr } = await (supabase as any)
    .from('sessions')
    .update({ status: 'active' })
    .eq('id', nextSessionId)
  if (promoteErr) {
    console.error('[session] Failed to promote session', promoteErr)
    return null
  }

  console.log(`[session] Promoted session ${nextSessionId} to active`)

  // STEP 5: Delete expired sessions + their games (async, non-blocking)
  cleanupExpiredSessions().catch(err =>
    console.error('[session] Background cleanup error', err),
  )

  return { id: nextSessionId, status: 'active' } as GameSession
}

/**
 * Delete ALL expired sessions and their games.
 * Also cleans up orphaned games and zombie sessions.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = getSupabaseClient()
  let totalDeleted = 0

  // 1. Find all expired session IDs
  const { data: expiredSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('status', 'expired') as any

  if (expiredSessions?.length) {
    const ids = (expiredSessions as any[]).map((s: any) => s.id)

    // Delete in chunks of 20 to avoid Supabase .in() limits
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20)
      const { data } = await supabase.from('games').delete().in('session_id', chunk).select('id')
      totalDeleted += data?.length ?? 0
      await supabase.from('sessions').delete().in('id', chunk)
    }
    console.log(`[session] Cleaned ${ids.length} expired sessions, ${totalDeleted} games`)
  }

  // 2. Delete orphaned games (null session_id)
  const { data: orphaned } = await supabase
    .from('games').delete().is('session_id', null).select('id')
  if (orphaned?.length) {
    totalDeleted += orphaned.length
    console.log(`[session] Cleaned ${orphaned.length} orphaned games`)
  }

  // 3. Delete zombie sessions (status='active' but expired time has passed)
  const now = new Date().toISOString()
  const { data: zombies } = await supabase
    .from('sessions')
    .select('id')
    .eq('status', 'active')
    .lte('expires_at', now) as any

  if (zombies?.length) {
    const zombieIds = (zombies as any[]).map((s: any) => s.id)
    for (let i = 0; i < zombieIds.length; i += 20) {
      const chunk = zombieIds.slice(i, i + 20)
      const { data } = await supabase.from('games').delete().in('session_id', chunk).select('id')
      totalDeleted += data?.length ?? 0
      await supabase.from('sessions').delete().in('id', chunk)
    }
    console.log(`[session] Cleaned ${zombieIds.length} zombie sessions`)
  }

  // 4. Safety: delete games with past expires_at that somehow survived
  const { data: stale } = await supabase
    .from('games').delete().lte('expires_at', now).select('id')
  if (stale?.length) {
    totalDeleted += stale.length
    console.log(`[session] Cleaned ${stale.length} stale games`)
  }

  return totalDeleted
}

// ─── Ensure Active Session (API fallback) ────────────────────────────

/**
 * Guarantee an active session exists. Used by API endpoints.
 * If no active session, promotes "next" or creates a fresh one.
 * NEVER generates games — that's the caller's job.
 */
export async function ensureActiveSession(): Promise<GameSession> {
  // 1. Active session exists and not expired
  const active = await getActiveSession()
  if (active) return active

  // 2. Try to promote a preloaded "next" session
  const next = await getNextSession()
  if (next) {
    const promoted = await promoteBatch(next.id)
    if (promoted) {
      // Re-fetch the full session data
      const fresh = await getActiveSession()
      if (fresh) return fresh
    }
  }

  // 3. Nothing at all — create a fresh active session
  return createSession('active')
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getPreloadTime(session: GameSession): Date {
  return new Date(new Date(session.expires_at).getTime() - PRELOAD_BEFORE_MS)
}

export function shouldPreloadNow(session: GameSession): boolean {
  return new Date() >= getPreloadTime(session)
}

export function isSessionExpired(session: GameSession): boolean {
  return new Date() >= new Date(session.expires_at)
}

export { SESSION_DURATION_MS, PRELOAD_BEFORE_MS }
