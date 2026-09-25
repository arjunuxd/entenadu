import mongoose from 'mongoose'
import { env } from './env.js'

const SERVER_SELECTION_TIMEOUT_MS = 10000

export async function connectDatabase(): Promise<void> {
  if (!env.mongoUri) {
    console.warn('MONGODB_URI is not set. Starting without a database connection.')
    return
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err instanceof Error ? err.message : err)
  })

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    })
    console.log(`MongoDB connected (database: ${mongoose.connection.name})`)
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err instanceof Error ? err.message : err)
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