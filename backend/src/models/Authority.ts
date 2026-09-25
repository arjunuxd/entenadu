import { Schema, model } from 'mongoose'

export const AUTHORITY_TYPES = ['Municipality', 'Grama Panchayat', 'Municipal Corporation'] as const
export type AuthorityType = (typeof AUTHORITY_TYPES)[number]

export interface Authority {
  name: string
  type: AuthorityType
  district: string
  code: string
  isActive: boolean
}

const authoritySchema = new Schema<Authority>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: AUTHORITY_TYPES, required: true },
    district: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export const Authority = model<Authority>('Authority', authoritySchema)