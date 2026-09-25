export type ComplaintStatus =
  | 'submitted'
  | 'verified'
  | 'assigned'
  | 'under_review'
  | 'in_progress'
  | 'completed'
  | 'rejected'

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'submitted',
  'verified',
  'assigned',
  'under_review',
  'in_progress',
  'completed',
  'rejected',
]

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

export const COMPLAINT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const

export interface ComplaintPlace {
  id: string
  name: string
  district: string
}

export interface ComplaintAuthority {
  id: string
  name: string
  code: string
  district: string
}

export interface ComplaintActor {
  id: string
  name: string
}

export interface ComplaintLocation {
  latitude: number
  longitude: number
}

export interface ComplaintView {
  complaintId: string
  originalDescription: string
  aiDescription: string | null
  language: string | null
  category: string | null
  severity: string | null
  photoUrl: string | null
  district: string | null
  place: ComplaintPlace | null
  location: ComplaintLocation | null
  authority: ComplaintAuthority | null
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
  completedBy: ComplaintActor | null
}

export interface ComplaintHistoryEntry {
  previousStatus: ComplaintStatus | null
  newStatus: ComplaintStatus
  changedByRole: string
  changedBy: ComplaintActor | null
  note: string | null
  createdAt: string
}

export interface ComplaintAuditEntry {
  action: string
  actorRole: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface ComplaintDetail extends ComplaintView {
  history: ComplaintHistoryEntry[]
  audit: ComplaintAuditEntry[]
}

export interface AuthoritySummary {
  id: string
  name: string
  type: string
  district: string
  code: string
  isActive: boolean
  createdAt: string
}

export interface AuthorityUserView {
  id: string
  name: string
  username: string
  role: string
  isActive: boolean
  authority: { id: string | null; name: string | null; code: string | null }
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PagedComplaints {
  items: ComplaintView[]
  pagination: Pagination
}

export type StatusTotals = Record<ComplaintStatus, number> & { total: number }

export interface AdminStats {
  totals: StatusTotals
  recent: ComplaintView[]
}

export interface AuthorityStats {
  totals: StatusTotals
  recent: ComplaintView[]
}