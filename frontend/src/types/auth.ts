export type UserRole = 'admin' | 'authority'

export interface SafeUser {
  id: string
  name: string
  username: string
  role: UserRole
  authorityId: string | null
}

export interface LoginResponse {
  success: boolean
  token: string
  user: SafeUser
}

export interface MeResponse {
  success: boolean
  user: SafeUser
}