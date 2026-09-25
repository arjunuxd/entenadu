import type { AuthUser } from './auth.js'

export {}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser | undefined
    }
  }
}