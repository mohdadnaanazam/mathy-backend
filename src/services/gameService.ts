import { getSupabaseClient } from '../database/supabaseClient'
import {
  GeneratedGame,
  generateAndStoreGames,
  generateCustomGames,
  storeGeneratedGames,
  GameDifficulty,
} from '../ai/gameGenerator'
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
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()

  const ops: OperationMode[] = ['addition', 'subtraction', 'multiplication', 'division']
  const diffs: GameDifficulty[] = ['easy', 'medium', 'hard']
  // Ensure a larger pool of questions per (operation, difficulty) combo.
  // Frontend still limits sessions to 20, but we now keep at least 50 in the pool.
  const perComboTarget = Math.max(minCount, 50)

  for (const op of ops) {
    for (const diff of diffs) {
      const { data, error } = await supabase
        .from('games')
        .select('id')
        .eq('game_type', op)
        .eq('difficulty', diff)
        .gt('expires_at', nowIso)

      if (error) throw error
      const have = data?.length ?? 0
      if (have >= perComboTarget) continue

      await deleteExpiredGames()
      const missing = perComboTarget - have
      await generateRandomGames(missing, op, diff)
    }
  }
}

export async function generateRandomGames(
  batchSize = 20,
  operation?: OperationMode,
  difficulty?: GameDifficulty,
) {
  await generateAndStoreGames(batchSize, operation, difficulty)
}

/** Delete ALL games (not just expired) and regenerate for every combo. */
export async function forceRegenerateAllGames(perCombo = 50): Promise<void> {
  const supabase = getSupabaseClient()
  // Wipe everything
  const { error } = await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[forceRegenerateAllGames] delete error', error)
    throw error
  }

  const ops: OperationMode[] = ['addition', 'subtraction', 'multiplication', 'division']
  const diffs: GameDifficulty[] = ['easy', 'medium', 'hard']

  for (const op of ops) {
    for (const diff of diffs) {
      await generateRandomGames(perCombo, op, diff)
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[forceRegenerateAllGames] Regenerated ${ops.length * diffs.length * perCombo} games`)
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

