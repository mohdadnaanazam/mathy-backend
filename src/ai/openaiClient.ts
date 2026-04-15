import { env } from '../config/env'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Call OpenAI Chat Completions API for text generation.
 * Uses GPT-3.5-turbo for cost-effective game generation.
 */
export async function generateText(prompt: string, model?: string): Promise<string> {
  const apiKey = env.openaiApiKey
  if (!apiKey) throw new Error('OPENAI_API_KEY is required')

  const modelId = model ?? 'gpt-3.5-turbo'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout

  let res: Response
  try {
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
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('OpenAI API request timed out after 30s')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  return content.trim()
}
