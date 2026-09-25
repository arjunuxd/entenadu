import { env } from '../config/env.js'
import { COMPLAINT_CATEGORIES, COMPLAINT_SEVERITIES, type ComplaintCategory, type ComplaintSeverity } from '../models/index.js'

export interface TextInputContext {
  hasDescription: boolean
  hasLocation: boolean
  category: ComplaintCategory | null
  place: string | null
  district: string | null
}

export interface GeminiTextAnalysis {
  inputType: 'description' | 'location' | 'unknown'
  language: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  description: string | null
  district: string | null
  place: string | null
  location: string | null
  missingInformation: string[]
}

const TEXT_SYSTEM_PROMPT = `You are the Ente Nadu citizen-reporting assistant. You help structure a complaint a citizen is typing on Telegram.
Categories (use exactly one, or null if unclear): ${COMPLAINT_CATEGORIES.join(' | ')}
Severities (use exactly one, or null if unclear): ${COMPLAINT_SEVERITIES.join(' | ')}

For the citizen's message, classify its textType as one of:
- "description": it mainly describes the problem/issue.
- "location": it mainly tells WHERE something is (a place/area name).
- "unknown": you cannot tell.

Return JSON exactly in this shape:
{"textType":"description|location|unknown","language":"English | Malayalam | Manglish | other | null","category":"one of the categories or null","severity":"Low|Medium|High|Critical or null","description":"Short, plain, factual summary of the problem, or null","district":"Kerala district if determinable, else null","place":"Place/area name mentioned (for example 'Kunnamthanam'), else null","location":"Specific place/area/road detail mentioned (for example 'Kunnamthanam Road'), else null","missingInformation":["location","photo","nothing","more_detail"]}

Rules:
- Keep the original citizen description intact in your summary meaning; never invent facts.
- "district" and "place" and "location" must come from the citizen's own words. Never guess.
- NEVER return an authority, local body, municipality, panchayat, or official name. Authorities are decided by the government system, not by you.
- If the text is part of an ongoing conversation and only fills in missing details, still return the same JSON shape.
- Respond with JSON only, no markdown, no explanations.`

const CURRENT_GEMINI_MODELS = ['gemini-3.8-flash'] as const

const EMPTY_TEXT_ANALYSIS: GeminiTextAnalysis = {
  inputType: 'unknown',
  language: null,
  category: null,
  severity: null,
  description: null,
  district: null,
  place: null,
  location: null,
  missingInformation: [],
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(stripCodeFences(raw))
  } catch {
    return null
  }
}

function isCategory(value: unknown): value is ComplaintCategory {
  return typeof value === 'string' && (COMPLAINT_CATEGORIES as readonly string[]).includes(value)
}

function isSeverity(value: unknown): value is ComplaintSeverity {
  return typeof value === 'string' && (COMPLAINT_SEVERITIES as readonly string[]).includes(value)
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}

function normalizeTextAnalysis(value: unknown): GeminiTextAnalysis {
  if (value === null || typeof value !== 'object') {
    return EMPTY_TEXT_ANALYSIS
  }

  const data = value as Record<string, unknown>
  const inputType = data.textType === 'description' || data.textType === 'location' ? data.textType : 'unknown'

  return {
    inputType,
    language: asNullableString(data.language),
    category: isCategory(data.category) ? data.category : null,
    severity: isSeverity(data.severity) ? data.severity : null,
    description: asNullableString(data.description),
    district: asNullableString(data.district),
    place: asNullableString(data.place),
    location: asNullableString(data.location),
    missingInformation: asStringArray(data.missingInformation),
  }
}

interface GeminiJsonInput {
  systemInstruction: { parts: { text: string }[] }
  contents: { parts: { text: string }[] }[]
  generationConfig: {
    temperature: number
    responseMimeType: 'application/json'
  }
}

const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelayMs(retry: number): number {
  const base = RETRY_DELAYS_MS[retry - 1] ?? 1000
  return base + Math.floor(Math.random() * 250)
}

function isTransientStatus(status: number): boolean {
  return status === 503 || status === 429
}

async function generateJson(systemPrompt: string, text: string): Promise<unknown> {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const payload: GeminiJsonInput = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const models = [env.geminiModel, ...CURRENT_GEMINI_MODELS.filter((model) => model !== env.geminiModel)]

  let lastStatus: number | null = null

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

    let attempt = 0

    while (true) {
      attempt += 1

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.geminiApiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25_000),
        })
      } catch (error) {
        throw new Error(`Gemini API request failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      }

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }

        const resultText =
          data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? '')
            .join('') ?? ''

        return safeParseJson(resultText)
      }

      const status = response.status

      if (status === 404) {
        lastStatus = status
        break
      }

      if (isTransientStatus(status) && attempt <= MAX_RETRIES) {
        lastStatus = status
        await sleep(retryDelayMs(attempt))
        continue
      }

      throw new Error(`Gemini API error: HTTP ${status}`)
    }
  }

  throw new Error(`Gemini API error: HTTP ${lastStatus ?? 'unknown'}`)
}

export async function understandText(text: string, _context: TextInputContext): Promise<GeminiTextAnalysis> {
  if (!env.geminiApiKey) {
    return EMPTY_TEXT_ANALYSIS
  }

  const cleaned = text.trim()

  if (!cleaned) {
    return EMPTY_TEXT_ANALYSIS
  }

  try {
    const raw = await generateJson(TEXT_SYSTEM_PROMPT, cleaned)
    return normalizeTextAnalysis(raw)
  } catch (error) {
    console.warn(`[gemini] understandText failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return EMPTY_TEXT_ANALYSIS
  }
}