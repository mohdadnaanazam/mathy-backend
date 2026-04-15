import { env } from '../config/env'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Call OpenAI Chat Completions API for text generation.
 * Uses GPT-3.5-turbo for cost-effective game generation.
 */
export async function generateText(prompt: string, model?: string): Promise<string> {
  const apiKey = env.openaiApiKey
  if (!apiKey) {
    console.log('[OpenAI] ❌ No OPENAI_API_KEY found in environment')
    throw new Error('OPENAI_API_KEY is required')
  }

  const modelId = model ?? 'gpt-3.5-turbo'
  console.log('[OpenAI] 🚀 Starting request to', modelId)
  console.log('[OpenAI] 📝 Prompt length:', prompt.length, 'chars')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout

  let res: Response
  try {
    const startTime = Date.now()
    res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a math question generator. Generate questions in valid JSON format only. No extra text or explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })
    const elapsed = Date.now() - startTime
    console.log('[OpenAI] ⏱️ Response received in', elapsed, 'ms, status:', res.status)
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[OpenAI] ⏰ Request timed out after 30s')
      throw new Error('OpenAI API request timed out after 30s')
    }
    console.log('[OpenAI] ❌ Fetch error:', err?.message)
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    console.log('[OpenAI] ❌ API error:', res.status, text.substring(0, 200))
    throw new Error(`OpenAI API ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  console.log('[OpenAI] ✅ Success! Response length:', content.length, 'chars')
  if (data.usage) {
    console.log('[OpenAI] 📊 Tokens used:', data.usage.total_tokens, '(prompt:', data.usage.prompt_tokens, ', completion:', data.usage.completion_tokens, ')')
  }
  
  return content.trim()
}
