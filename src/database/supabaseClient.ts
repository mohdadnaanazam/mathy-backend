import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env'

export type Database = {
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
      users: {
        Row: {
          user_id: string
          score: number
          created_at: string
          last_sync: string | null
        }
        Insert: {
          user_id: string
          score?: number
          created_at?: string
          last_sync?: string | null
        }
        Update: {
          score?: number
          last_sync?: string | null
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
