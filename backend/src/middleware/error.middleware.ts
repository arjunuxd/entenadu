import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { ApiError } from '../utils/ApiError.js'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` })
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message })
    return
  }

  const entityTooLarge = typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.too.large'
  if (entityTooLarge) {
    res.status(413).json({ message: 'Request body too large' })
    return
  }

  const badJson = err instanceof SyntaxError && typeof err === 'object' && (err as { status?: unknown }).status === 400
  if (badJson) {
    res.status(400).json({ message: 'Invalid JSON in request body' })
    return
  }

  if (!env.isProduction) {
    console.error(err)
  }

  const message = env.isProduction ? 'Internal Server Error' : (err as Error)?.message ?? 'Unknown error'
  res.status(500).json({ message })
}