import type { UserRole } from '../models/userRoles.js'

export interface AuthUser {
  userId: string
  role: UserRole
  authorityId: string | null
}

export interface SafeUser {
  id: string
  name: string
  username: string
  role: UserRole
  authorityId: string | null
}