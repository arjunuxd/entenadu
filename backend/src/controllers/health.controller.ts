import type { Request, Response } from 'express'
import { isDatabaseConnected } from '../config/db.js'

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'Ente Nadu API',
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
  })
}