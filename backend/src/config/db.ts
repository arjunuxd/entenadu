import dns from 'node:dns'
import mongoose from 'mongoose'
import { env } from './env.js'

const SERVER_SELECTION_TIMEOUT_MS = 15000
const MAX_CONNECT_ATTEMPTS = 3
const PUBLIC_DNS_SERVERS = ['8.8.8.8', '1.1.1.1']

export async function connectDatabase(): Promise<void> {
  if (!env.mongoUri) {
    console.warn('MONGODB_URI is not set. Starting without a database connection.')
    return
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err instanceof Error ? err.message : err)
  })

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      })
      console.log(`MongoDB connected (database: ${mongoose.connection.name})`)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`MongoDB connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${message}`)
      if (attempt === 1) {
        dns.setServers(PUBLIC_DNS_SERVERS)
        console.log('Switching Node DNS to public resolvers and retrying...')
      }
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    console.log('MongoDB disconnected')
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1
}