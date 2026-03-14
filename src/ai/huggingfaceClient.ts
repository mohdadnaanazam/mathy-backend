import { env } from '../config/env'

// Hugging Face Inference Providers (OpenAI-compatible)
// https://huggingface.co/changelog/inference-providers-openai-compatible
const HF_BASE_URL = 'https://router.huggingface.co/v1'

/**
 * Call Hugging Face Inference API (text generation).
 * Uses AI_API_KEY as the Hugging Face token; optional HUGGINGFACE_MODEL_ID in env.
 */
export async function generateText(prompt: string, model?: string): Promise<string> {
  const token = env.aiApiKey
  if (!token) throw new Error('AI_API_KEY (Hugging Face token) is required')

  const modelId = model ?? env.huggingfaceModelId
  const res = await fetch(`${HF_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns concise JSON only when asked.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hugging Face API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  return String(content).trim()
}
