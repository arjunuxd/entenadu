import { Schema, model } from 'mongoose'
import { normalizeName } from '../utils/normalize.js'

export interface Place {
  name: string
  normalizedName: string
  district: string
  authorityId: Schema.Types.ObjectId
  aliases: string[]
  isActive: boolean
}

const placeSchema = new Schema<Place>(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true, index: true },
    authorityId: { type: Schema.Types.ObjectId, ref: 'Authority', required: true },
    aliases: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

placeSchema.pre('validate', function normalizePlaceName(next) {
  if (this.isModified('name') || !this.normalizedName) {
    this.normalizedName = normalizeName(this.name)
  }
  if (Array.isArray(this.aliases)) {
    this.aliases = this.aliases.map((alias) => normalizeName(alias))
  }
  next()
})

placeSchema.index({ normalizedName: 1, district: 1 }, { unique: true })
placeSchema.index({ authorityId: 1 })

export const Place = model<Place>('Place', placeSchema)