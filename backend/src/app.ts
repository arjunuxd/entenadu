import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import routes from './routes/index.js'

export function createApp(): express.Express {
  const app = express()

  app.use(cors({ origin: env.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', routes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}