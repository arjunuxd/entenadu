import type { Request, Response } from 'express'
import { User } from '../models/index.js'
import { toSafeUser, validateCredentials, verifyLogin } from '../services/auth.service.js'
import { ApiError } from '../utils/ApiError.js'
import { signAuthToken } from '../utils/jwt.js'

export async function login(req: Request, res: Response): Promise<void> {
  const credentials = validateCredentials(req.body)

  if (!credentials.ok) {
    throw new ApiError(400, credentials.error)
  }

  const user = await verifyLogin(credentials.username, credentials.password)

  const token = signAuthToken({
    userId: user.id,
    role: user.role,
    authorityId: user.authorityId,
  })

  res.status(200).json({ success: true, token, user })
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new ApiError(401, 'Authentication required')
  }

  const user = await User.findById(req.auth.userId)

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid or expired token')
  }

  res.status(200).json({ success: true, user: toSafeUser(user) })
}

export function logout(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'Logged out. Remove the token on the client side.',
  })
}

const DEVELOPMENT_ONLY_NOTE = 'This is a development-only test endpoint.'

export function protectedTest(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    note: DEVELOPMENT_ONLY_NOTE,
    user: req.auth
      ? { id: req.auth.userId, role: req.auth.role, authorityId: req.auth.authorityId }
      : null,
  })
}

export function adminOnlyTest(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    note: DEVELOPMENT_ONLY_NOTE,
    message: 'Only admin users can reach this.',
    role: req.auth?.role,
  })
}

export function authorityOnlyTest(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    note: DEVELOPMENT_ONLY_NOTE,
    message: 'Only authority users can reach this.',
    role: req.auth?.role,
    authorityId: req.auth?.authorityId ?? null,
  })
}