import type { ComplaintStatus } from '../types/complaint'

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  verified: 'Verified',
  assigned: 'Assigned',
  under_review: 'Under Review',
  in_progress: 'In Progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

interface StatusBadgeProps {
  status: ComplaintStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
}