import dotenv from 'dotenv'

dotenv.config()

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  aiApiKey: process.env.AI_API_KEY ?? '',
  huggingfaceModelId: process.env.HUGGINGFACE_MODEL_ID ?? 'google/flan-t5-large',
  frontendUrl: process.env.FRONTEND_URL ?? '',
  frontendUrlLocal: process.env.FRONTEND_URL_LOCAL ?? 'http://localhost:3000',
}

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
  // eslint-disable-next-line no-console
  console.warn('[env] Missing Supabase configuration. Database calls will fail until configured.')
}

if (!env.aiApiKey) {
  // eslint-disable-next-line no-console
  console.warn('[env] Missing AI_API_KEY. AI question generation will be disabled.')
}
