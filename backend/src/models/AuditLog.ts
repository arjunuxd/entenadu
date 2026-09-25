import { Schema, model } from 'mongoose'
import { ACTOR_ROLES, type ActorRole } from '../models/userRoles.js'

export interface AuditLog {
  actorId: Schema.Types.ObjectId | null
  actorRole: ActorRole
  action: string
  entityType: string | null
  entityId: Schema.Types.ObjectId | null
  metadata: Record<string, unknown>
}

const auditLogSchema = new Schema<AuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorRole: { type: String, enum: ACTOR_ROLES, default: 'system' },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, trim: true, default: null },
    entityId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

auditLogSchema.index({ entityType: 1, entityId: 1 })

export const AuditLog = model<AuditLog>('AuditLog', auditLogSchema)