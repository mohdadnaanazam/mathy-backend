import { env } from '../config/env'

// Text-generation (causal) models like FLAN-T5 use the serverless Inference API with "inputs".
// https://huggingface.co/docs/api-inference/detailed_parameters
const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co'

/**
 * Call Hugging Face Inference API for text-generation models (e.g. FLAN-T5).
 * Uses { "inputs": "..." } format, not chat messages.
 */
export async function generateText(prompt: string, model?: string): Promise<string> {
  const token = env.aiApiKey
  if (!token) throw new Error('AI_API_KEY (Hugging Face token) is required')

  const modelId = model ?? env.huggingfaceModelId
  const url = `${HF_INFERENCE_BASE}/models/${modelId}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 2048,
        temperature: 0.3,
        return_full_text: false,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hugging Face API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as
    | { generated_text?: string }
    | Array<{ generated_text?: string }>

  const raw = Array.isArray(data)
    ? data.map((x) => x.generated_text ?? '').join('')
    : (data as { generated_text?: string }).generated_text ?? ''
  return String(raw).trim()
}
