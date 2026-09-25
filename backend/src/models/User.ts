import { Schema, Types, model } from 'mongoose'
import { USER_ROLES, type UserRole } from '../models/userRoles.js'

export interface User {
  name: string
  username: string
  passwordHash: string | null
  role: UserRole
  authorityId: Types.ObjectId | null
  isActive: boolean
}

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, index: true },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: USER_ROLES, required: true, default: 'authority' },
    authorityId: { type: Schema.Types.ObjectId, ref: 'Authority', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export const User = model<User>('User', userSchema)