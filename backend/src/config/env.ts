import dotenv from 'dotenv'

dotenv.config()

const NODE_ENV_VALUES = ['development', 'production', 'test'] as const
type NodeEnv = (typeof NODE_ENV_VALUES)[number]

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} in environment: expected a positive integer, got "${value}"`)
  }

  return parsed
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined || value.trim() === '') {
    return 'development'
  }

  if (NODE_ENV_VALUES.includes(value as NodeEnv)) {
    return value as NodeEnv
  }

  throw new Error(`Invalid NODE_ENV: expected one of ${NODE_ENV_VALUES.join(', ')}, got "${value}"`)
}

const nodeEnv = parseNodeEnv(process.env.NODE_ENV)

const jwtSecret = process.env.JWT_SECRET?.trim() ?? ''
const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || '1d'

export const env = {
  port: parsePositiveInteger(process.env.PORT, 5000, 'PORT'),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI?.trim() ?? '',
  jwtSecret,
  jwtExpiresIn,
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME?.trim() || 'Ente Nadu Admin',
    username: process.env.SEED_ADMIN_USERNAME?.trim() ?? '',
    password: process.env.SEED_ADMIN_PASSWORD ?? '',
  },
  seedDevPassword: process.env.SEED_DEV_PASSWORD ?? 'EnteNaduDev@2026',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() ?? '',
  },
}

const PRODUCTION_REQUIRED_ENV: Array<{ key: string; value: string }> = [
  { key: 'MONGODB_URI', value: env.mongoUri },
  { key: 'JWT_SECRET', value: env.jwtSecret },
  { key: 'TELEGRAM_BOT_TOKEN', value: env.telegramBotToken },
  { key: 'GEMINI_API_KEY', value: env.geminiApiKey },
  { key: 'CLOUDINARY_CLOUD_NAME', value: env.cloudinary.cloudName },
  { key: 'CLOUDINARY_API_KEY', value: env.cloudinary.apiKey },
  { key: 'CLOUDINARY_API_SECRET', value: env.cloudinary.apiSecret },
]

export function assertProductionEnv(): void {
  if (!env.isProduction) {
    return
  }

  const missing = PRODUCTION_REQUIRED_ENV.filter((item) => item.value === '').map((item) => item.key)
  if (missing.length > 0) {
    throw new Error(`Production requires the following environment variables: ${missing.join(', ')}`)
  }
}