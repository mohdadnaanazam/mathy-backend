import { env } from '../config/env'

const HF_INFERENCE = 'https://api-inference.huggingface.co'

/**
 * Call Hugging Face Inference API (text generation).
 * Uses AI_API_KEY as the Hugging Face token; optional HUGGINGFACE_MODEL_ID in env.
 */
export async function generateText(prompt: string, model?: string): Promise<string> {
  const token = env.aiApiKey
  if (!token) throw new Error('AI_API_KEY (Hugging Face token) is required')

  const modelId = model ?? env.huggingfaceModelId
  const res = await fetch(`${HF_INFERENCE}/models/${modelId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 2048,
        return_full_text: false,
        temperature: 0.3,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hugging Face API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { generated_text?: string } | Array<{ generated_text?: string }>
  const raw = Array.isArray(data)
    ? data.map((x) => x.generated_text ?? '').join('')
    : (data as { generated_text?: string }).generated_text ?? ''
  return raw.trim()
}
