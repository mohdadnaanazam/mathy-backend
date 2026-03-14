import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env'

type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          game_type: string
          question: string
          correct_answer: string
          difficulty: string
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          game_type: string
          question: string
          correct_answer: string
          difficulty: string
          created_at?: string
          expires_at: string
        }
      }
    }
  }
}

let client: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return client
}
