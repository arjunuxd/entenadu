import bcrypt from 'bcryptjs'
import { HydratedDocument } from 'mongoose'
import type { User as UserDoc } from '../models/User.js'
import { User } from '../models/index.js'
import type { SafeUser } from '../types/auth.js'
import { ApiError } from '../utils/ApiError.js'

const INVALID_CREDENTIALS = 'Invalid username or password'
const BCRYPT_ROUNDS = 10

export interface CredentialsInput {
  username?: unknown
  password?: unknown
}

type ValidationResult =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string }

const MAX_USERNAME_LENGTH = 50
const MIN_PASSWORD_LENGTH = 4
const MAX_PASSWORD_LENGTH = 128

export function validateCredentials(body: unknown): ValidationResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const { username, password } = body as CredentialsInput

  if (typeof username !== 'string' || username.trim().length === 0) {
    return { ok: false, error: 'Username is required' }
  }

  const trimmedUsername = username.trim()

  if (trimmedUsername.length > MAX_USERNAME_LENGTH) {
    return { ok: false, error: 'Username is too long' }
  }

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Password is required' }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'Password is too short' }
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: 'Password is too long' }
  }

  return { ok: true, username: trimmedUsername, password }
}

export function toSafeUser(user: HydratedDocument<UserDoc>): SafeUser {
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username,
    role: user.role,
    authorityId: user.authorityId ? user.authorityId.toString() : null,
  }
}

export async function verifyLogin(username: string, password: string): Promise<SafeUser> {
  const user = await User.findOne({ username })

  if (!user) {
    throw new ApiError(401, INVALID_CREDENTIALS)
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash ?? '')

  if (!user.isActive || !passwordMatches) {
    throw new ApiError(401, INVALID_CREDENTIALS)
  }

  return toSafeUser(user)
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}