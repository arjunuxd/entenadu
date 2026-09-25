import { Schema, Types, model } from 'mongoose'
import { COMPLAINT_CATEGORIES, COMPLAINT_SEVERITIES, type ComplaintCategory, type ComplaintSeverity } from './Complaint.js'

export const SESSION_STATES = ['collecting', 'preview', 'editing'] as const
export type SessionState = (typeof SESSION_STATES)[number]

export const SESSION_EDIT_TARGETS = ['description', 'location', 'photo'] as const
export type SessionEditTarget = (typeof SESSION_EDIT_TARGETS)[number]

export const SESSION_TTL_MS = 30 * 60 * 1000

export interface ComplaintSession {
  telegramUserId: string
  language: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  originalDescription: string | null
  aiDescription: string | null
  photoUrl: string | null
  placeName: string | null
  district: string | null
  manualLocation: string | null
  latitude: number | null
  longitude: number | null
  placeId: Types.ObjectId | null
  imageObservations: string[]
  conversationState: SessionState
  editTarget: SessionEditTarget | null
  awaitingLocationClarification: boolean
  complaintId: string | null
  complaintCreated: boolean
  expiresAt: Date
}

const complaintSessionSchema = new Schema<ComplaintSession>(
  {
    telegramUserId: { type: String, required: true, trim: true, unique: true, index: true },
    language: { type: String, trim: true, default: null },
    category: { type: String, enum: COMPLAINT_CATEGORIES, default: null },
    severity: { type: String, enum: COMPLAINT_SEVERITIES, default: null },
    originalDescription: { type: String, trim: true, default: null },
    aiDescription: { type: String, trim: true, default: null },
    photoUrl: { type: String, default: null },
    placeName: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    manualLocation: { type: String, trim: true, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
    imageObservations: { type: [String], default: [] },
    conversationState: { type: String, enum: SESSION_STATES, default: 'collecting' },
    editTarget: { type: String, enum: SESSION_EDIT_TARGETS, default: null },
    awaitingLocationClarification: { type: Boolean, default: false },
    complaintId: { type: String, trim: true, default: null },
    complaintCreated: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

complaintSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const ComplaintSession = model<ComplaintSession>('ComplaintSession', complaintSessionSchema)