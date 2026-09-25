import type { NextFunction, Request, Response } from 'express'
import { User, type UserRole } from '../models/index.js'
import type { AuthUser } from '../types/auth.js'
import { ApiError } from '../utils/ApiError.js'
import { verifyAuthToken } from '../utils/jwt.js'

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authentication required')
  }

  const token = header.slice('Bearer '.length).trim()

  let payload: AuthUser
  try {
    payload = verifyAuthToken(token)
  } catch {
    throw new ApiError(401, 'Invalid or expired token')
  }

  const user = await User.findById(payload.userId)

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid or expired token')
  }

  req.auth = {
    userId: user._id.toString(),
    role: user.role,
    authorityId: user.authorityId ? user.authorityId.toString() : null,
  }

  next()
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new ApiError(401, 'Authentication required')
    }

    if (!roles.includes(req.auth.role)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions')
    }

    next()
  }
}