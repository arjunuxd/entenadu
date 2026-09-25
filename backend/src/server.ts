import { createApp } from './app.js'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { assertProductionEnv, env } from './config/env.js'
import { startTelegramBot, type StopTelegramBot } from './services/telegram/bot.js'

const app = createApp()

let stopTelegramBot: StopTelegramBot | null = null

async function start(): Promise<void> {
  assertProductionEnv()
  await connectDatabase()

  if (!env.jwtSecret) {
    console.warn('JWT_SECRET is not set. Authentication endpoints will fail until it is configured in backend/.env.')
  }

  stopTelegramBot = await startTelegramBot()

  app.listen(env.port, () => {
    console.log(`Ente Nadu API listening on http://localhost:${env.port} (${env.nodeEnv})`)
  })
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down gracefully...`)
  if (stopTelegramBot) {
    try {
      await stopTelegramBot()
    } catch (error) {
      console.warn(`Telegram bot stop failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }
  await disconnectDatabase()
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

void start()