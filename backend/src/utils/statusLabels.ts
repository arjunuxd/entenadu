import type { ComplaintStatus } from '../models/Complaint.js'

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  verified: 'Verified',
  assigned: 'Assigned',
  under_review: 'Under review',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}