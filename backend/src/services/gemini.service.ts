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
  missingInformation: string[]
}

export interface GeminiPhotoAnalysis {
  observations: string[]
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
}

export interface PhotoInput {
  mimeType: string
  dataBase64: string
}

const TEXT_SYSTEM_PROMPT = `You are the Ente Nadu citizen-reporting assistant. You help structure a complaint a citizen is typing on Telegram.
Categories (use exactly one, or null if unclear): ${COMPLAINT_CATEGORIES.join(' | ')}
Severities (use exactly one, or null if unclear): ${COMPLAINT_SEVERITIES.join(' | ')}

For the citizen's message, classify its textType as one of:
- "description": it mainly describes the problem/issue.
- "location": it mainly tells WHERE something is (a place/area name).
- "unknown": you cannot tell.

Return JSON exactly in this shape:
{"textType":"description|location|unknown","language":"English | Malayalam | Manglish | other | null","category":"one of the categories or null","severity":"Low|Medium|High|Critical or null","description":"Short, plain, factual summary of the problem, or null","district":"Kerala district if determinable, else null","place":"Place/area name mentioned, else null","missingInformation":["location","photo","nothing","more_detail"]}

Rules:
- Keep the original citizen description intact in your summary meaning; never invent facts.
- If the text is part of an ongoing conversation and only fills in missing details, still return the same JSON shape.
- Respond with JSON only, no markdown, no explanations.`

const PHOTO_SYSTEM_PROMPT = `You are the Ente Nadu citizen-reporting assistant analyzing a photo attached to a complaint on Telegram.
Categories (use exactly one, or null if unclear): ${COMPLAINT_CATEGORIES.join(' | ')}
Severities (use exactly one, or null if unclear): ${COMPLAINT_SEVERITIES.join(' | ')}

Return JSON exactly in this shape:
{"observations":["short factual observation about what the photo shows"],"category":"one of the categories or null","severity":"Low|Medium|High|Critical or null"}
Respond with JSON only. If nothing can be determined, return {"observations":[],"category":null,"severity":null}.`

const EMPTY_TEXT_ANALYSIS: GeminiTextAnalysis = {
  inputType: 'unknown',
  language: null,
  category: null,
  severity: null,
  description: null,
  district: null,
  place: null,
  missingInformation: [],
}

const EMPTY_PHOTO_ANALYSIS: GeminiPhotoAnalysis = {
  observations: [],
  category: null,
  severity: null,
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
    missingInformation: asStringArray(data.missingInformation),
  }
}

function normalizePhotoAnalysis(value: unknown): GeminiPhotoAnalysis {
  if (value === null || typeof value !== 'object') {
    return EMPTY_PHOTO_ANALYSIS
  }

  const data = value as Record<string, unknown>

  return {
    observations: asStringArray(data.observations),
    category: isCategory(data.category) ? data.category : null,
    severity: isSeverity(data.severity) ? data.severity : null,
  }
}

interface GeminiMultipartPart {
  text: string
  inlineData?: never
}

interface GeminiImagePart {
  text?: never
  inlineData: { mimeType: string; data: string }
}

interface GeminiJsonInput {
  systemInstruction: { parts: { text: string }[] }
  contents: { parts: (GeminiMultipartPart | GeminiImagePart)[] }[]
  generationConfig: {
    temperature: number
    responseMimeType: 'application/json'
  }
}

async function generateJson(systemPrompt: string, userParts: (GeminiMultipartPart | GeminiImagePart)[]): Promise<unknown> {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`

  const payload: GeminiJsonInput = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: userParts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('') ?? ''

  return safeParseJson(text)
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
    const raw = await generateJson(TEXT_SYSTEM_PROMPT, [{ text: cleaned }])
    return normalizeTextAnalysis(raw)
  } catch (error) {
    console.warn(`[gemini] understandText failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return EMPTY_TEXT_ANALYSIS
  }
}

export async function analyzePhoto(image: PhotoInput): Promise<GeminiPhotoAnalysis> {
  if (!env.geminiApiKey) {
    return EMPTY_PHOTO_ANALYSIS
  }

  try {
    const raw = await generateJson(PHOTO_SYSTEM_PROMPT, [
      {
        text: 'Analyze the following photo attached by a citizen:',
      },
      {
        inlineData: { mimeType: image.mimeType, data: image.dataBase64 },
      },
    ])
    return normalizePhotoAnalysis(raw)
  } catch (error) {
    console.warn(`[gemini] analyzePhoto failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return EMPTY_PHOTO_ANALYSIS
  }
}