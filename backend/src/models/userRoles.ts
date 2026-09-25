export const USER_ROLES = ['admin', 'authority'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ACTOR_ROLES = ['admin', 'authority', 'citizen', 'system'] as const
export type ActorRole = (typeof ACTOR_ROLES)[number]