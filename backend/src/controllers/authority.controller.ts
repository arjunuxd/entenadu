import type { Request, Response } from 'express'
import { COMPLAINT_STATUSES, type ComplaintStatus } from '../models/Complaint.js'
import {
  getAuthorityStats,
  getComplaintDetailAuthority,
  listComplaintsByAuthority,
  updateComplaintStatusByAuthority,
  type ComplaintActor,
} from '../services/complaint.service.js'
import { ApiError } from '../utils/ApiError.js'
import {
  parseOptionalCategory,
  parseOptionalNote,
  parseOptionalSeverity,
  parseOptionalStatus,
  parsePagination,
  validateComplaintId,
} from '../utils/requestValidation.js'

function single(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return String((value as unknown[])[0] ?? '')
  }
  if (value === undefined || value === null) {
    return undefined
  }
  return String(value)
}

function authorityContext(req: Request): { authorityId: string; actor: ComplaintActor } {
  if (!req.auth) {
    throw new ApiError(401, 'Authentication required')
  }
  if (!req.auth.authorityId) {
    throw new ApiError(403, 'Authority account has no authority assigned')
  }
  return { authorityId: req.auth.authorityId, actor: { userId: req.auth.userId, role: req.auth.role } }
}

export async function listComplaints(req: Request, res: Response): Promise<void> {
  const { authorityId } = authorityContext(req)
  const pagination = parsePagination(req.query as Record<string, unknown>)

  const result = await listComplaintsByAuthority(
    authorityId,
    {
      status: parseOptionalStatus(single(req.query.status)),
      category: parseOptionalCategory(single(req.query.category)),
      severity: parseOptionalSeverity(single(req.query.severity)),
      search: single(req.query.search)?.trim() || undefined,
    },
    pagination,
  )

  res.status(200).json({ success: true, items: result.items, pagination: result.pagination })
}

export async function getComplaint(req: Request, res: Response): Promise<void> {
  const { authorityId } = authorityContext(req)
  const complaintId = validateComplaintId(req.params.complaintId)

  const complaint = await getComplaintDetailAuthority(complaintId, authorityId)

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found')
  }

  res.status(200).json({ success: true, complaint })
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { authorityId, actor } = authorityContext(req)
  const complaintId = validateComplaintId(req.params.complaintId)

  const requestedStatus = (req.body as { status?: unknown }).status
  if (typeof requestedStatus !== 'string' || !COMPLAINT_STATUSES.includes(requestedStatus as ComplaintStatus)) {
    throw new ApiError(400, 'Invalid status')
  }

  const note = parseOptionalNote((req.body as { note?: unknown }).note)

  const complaint = await updateComplaintStatusByAuthority(
    complaintId,
    authorityId,
    requestedStatus as ComplaintStatus,
    actor,
    note,
  )

  res.status(200).json({ success: true, complaintId: complaint.complaintId, status: complaint.status })
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const { authorityId } = authorityContext(req)
  const stats = await getAuthorityStats(authorityId)
  res.status(200).json({ success: true, stats })
}