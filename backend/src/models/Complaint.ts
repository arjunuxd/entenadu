import { Schema, Types, model } from 'mongoose'

export const COMPLAINT_CATEGORIES = [
  'Road Infrastructure',
  'Streetlight',
  'Waste Management',
  'Drainage',
  'Water Supply',
  'Public Infrastructure',
  'Traffic',
  'Other',
] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

export const COMPLAINT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number]

export const COMPLAINT_STATUSES = [
  'submitted',
  'verified',
  'assigned',
  'under_review',
  'in_progress',
  'completed',
  'rejected',
] as const
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

export interface Complaint {
  complaintId: string
  citizenTelegramId: string
  originalDescription: string
  language: string | null
  aiDescription: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  photoUrl: string | null
  district: string | null
  placeId: Types.ObjectId | null
  latitude: number | null
  longitude: number | null
  authorityId: Types.ObjectId | null
  status: ComplaintStatus
  completedAt: Date | null
  completedBy: Types.ObjectId | null
}

const complaintSchema = new Schema<Complaint>(
  {
    complaintId: { type: String, required: true, unique: true, trim: true, index: true },
    citizenTelegramId: { type: String, required: true, trim: true, index: true },
    originalDescription: { type: String, required: true, trim: true },
    language: { type: String, trim: true, default: null },
    aiDescription: { type: String, trim: true, default: null },
    category: { type: String, enum: COMPLAINT_CATEGORIES, default: null },
    severity: { type: String, enum: COMPLAINT_SEVERITIES, default: null },
    photoUrl: { type: String, default: null },
    district: { type: String, trim: true, default: null },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    authorityId: { type: Schema.Types.ObjectId, ref: 'Authority', default: null, index: true },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'submitted', index: true },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

complaintSchema.index({ createdAt: -1 })

export const Complaint = model<Complaint>('Complaint', complaintSchema)