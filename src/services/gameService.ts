import { getSupabaseClient } from '../database/supabaseClient'
import { GeneratedGame, generateAndStoreGames, generateCustomGames, storeGeneratedGames } from '../ai/gameGenerator'
import { OperationMode } from '../ai/types'

export async function getActiveGames(type?: OperationMode) {
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()

  let query = supabase.from('games').select('*').gt('expires_at', nowIso)

  // For "mixed" we return all games (no filter). Backend only stores addition/subtraction/multiplication/division.
  if (type && type !== 'mixed') {
    query = query.eq('game_type', type)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function ensureGamesExist(minCount = 10): Promise<void> {
  const existing = await getActiveGames('mixed')
  if (existing.length >= minCount) return
  await deleteExpiredGames()
  await generateRandomGames(20)
}

export async function generateRandomGames(batchSize = 20) {
  await generateAndStoreGames(batchSize)
}

/** Delete games whose expires_at has passed. Returns how many were deleted. */
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

export function generateCustomGameBatch(params: any): GeneratedGame[] {
  return generateCustomGames(params as any)
}

/** Generate custom games and persist them to the DB; returns the inserted rows. */
export async function generateAndStoreCustomGames(params: any): Promise<Array<Record<string, unknown>>> {
  const games = generateCustomGames(params as any)
  return storeGeneratedGames(games)
}

