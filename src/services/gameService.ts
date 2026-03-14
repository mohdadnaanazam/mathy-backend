import { getSupabaseClient } from '../database/supabaseClient'
import { GeneratedGame, generateAndStoreGames, generateCustomGames } from '../ai/gameGenerator'
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

export async function generateRandomGames(batchSize = 20) {
  await generateAndStoreGames(batchSize)
}

export async function deleteExpiredGames() {
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('games').delete().lte('expires_at', nowIso)
  if (error) throw error
}

export function generateCustomGameBatch(params: {
  operation: OperationMode
  min_number: number
  max_number: number
  questions: number
  difficulty: 'easy' | 'medium' | 'hard'
}): GeneratedGame[] {
  return generateCustomGames(params)
}

