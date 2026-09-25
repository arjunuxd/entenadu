import { Schema, model } from 'mongoose'
import { ACTOR_ROLES, type ActorRole } from '../models/userRoles.js'
import { COMPLAINT_STATUSES, type ComplaintStatus } from '../models/Complaint.js'

export interface ComplaintHistory {
  complaintId: Schema.Types.ObjectId
  previousStatus: ComplaintStatus | null
  newStatus: ComplaintStatus
  changedBy: Schema.Types.ObjectId | null
  changedByRole: ActorRole
  note: string | null
}

const complaintHistorySchema = new Schema<ComplaintHistory>(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    previousStatus: { type: String, enum: COMPLAINT_STATUSES, default: null },
    newStatus: { type: String, enum: COMPLAINT_STATUSES, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedByRole: { type: String, enum: ACTOR_ROLES, default: 'system' },
    note: { type: String, trim: true, default: null },
  },
  { timestamps: true },
)

export const ComplaintHistory = model<ComplaintHistory>('ComplaintHistory', complaintHistorySchema)