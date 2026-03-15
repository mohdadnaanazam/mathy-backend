import { getSupabaseClient, type Database } from '../database/supabaseClient'

type UserUpdate = Database['public']['Tables']['users']['Update']

/**
 * Ensure a user exists. If row exists, reuse; otherwise insert.
 * Safe for duplicate calls with the same UUID.
 */
export async function ensureUser(userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: existing } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return

  const { error } = await supabase.from('users').insert({
    user_id: userId,
    score: 0,
  } as any)
  if (error && error.code !== '23505') throw error
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
  // Supabase generic can infer update() as 'never'; cast to satisfy type checker
  const { error } = await supabase.from('users').update(payload as never).eq('user_id', userId)

  if (error) throw error
}
