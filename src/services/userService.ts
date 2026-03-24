import { getSupabaseClient, type Database } from '../database/supabaseClient'

type UserUpdate = Database['public']['Tables']['users']['Update']

/**
 * Check if a user exists in the database.
 */
export async function checkUserExists(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

/**
 * Ensure a user exists. If row exists, reuse; otherwise insert.
 * Accepts optional username and avatar for new users.
 * Safe for duplicate calls with the same UUID.
 */
export async function ensureUser(
  userId: string,
  username?: string,
  avatar?: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: existing } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return

  const insertData: Record<string, unknown> = {
    user_id: userId,
    score: 0,
  }
  // Only add username/avatar if the table supports them
  if (username) insertData.username = username
  if (avatar) insertData.avatar = avatar

  const { error } = await supabase.from('users').insert(insertData as any)
  if (error && error.code !== '23505') {
    // If error is about unknown column, retry without username/avatar
    if (error.message?.includes('column') && (username || avatar)) {
      const { error: retryErr } = await supabase.from('users').insert({
        user_id: userId,
        score: 0,
      } as any)
      if (retryErr && retryErr.code !== '23505') throw retryErr
    } else {
      throw error
    }
  }
}

/**
 * Update user score and last_sync. Does not create the user.
 */
export async function updateUserScore(
  userId: string,
  score: number,
): Promise<void> {
  const supabase = getSupabaseClient()
  const now = new Date().toISOString()
  const payload: UserUpdate = { score, last_sync: now }
  const { error } = await supabase.from('users').update(payload as never).eq('user_id', userId)
  if (error) throw error
}
