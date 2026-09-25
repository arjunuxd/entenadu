import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { AuthUser } from '../types/auth.js'
import { ApiError } from './ApiError.js'

export function signAuthToken(authUser: AuthUser): string {
  if (!env.jwtSecret) {
    throw new ApiError(500, 'JWT_SECRET is not configured. Add it to backend/.env')
  }

  return jwt.sign(authUser, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAuthToken(token: string): AuthUser {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET is not configured')
  }

  return jwt.verify(token, env.jwtSecret) as AuthUser
}