import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import {
  assignComplaint,
  getAdminStats,
  getComplaintDetailAdmin,
  listAuthoritiesForAdmin,
  listAuthorityUsersForAdmin,
  listComplaintsAdmin,
  reassignComplaint,
  rejectComplaint,
  updateAuthorityUserAccess,
  verifyComplaint,
  type ComplaintActor,
} from '../services/complaint.service.js'
import { ApiError } from '../utils/ApiError.js'
import {
  getObjectId,
  parseOptionalCategory,
  parseOptionalNote,
  parseOptionalObjectId,
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

function actorFromRequest(req: Request): ComplaintActor {
  if (!req.auth) {
    throw new ApiError(401, 'Authentication required')
  }
  return { userId: req.auth.userId, role: req.auth.role }
}

export async function listComplaints(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>)

  const result = await listComplaintsAdmin(
    {
      status: parseOptionalStatus(single(req.query.status)),
      district: single(req.query.district)?.trim() || undefined,
      authorityId: parseOptionalObjectId(single(req.query.authority), 'authority filter'),
      category: parseOptionalCategory(single(req.query.category)),
      severity: parseOptionalSeverity(single(req.query.severity)),
      search: single(req.query.search)?.trim() || undefined,
    },
    pagination,
  )

  res.status(200).json({ success: true, items: result.items, pagination: result.pagination })
}

export async function getComplaint(req: Request, res: Response): Promise<void> {
  const complaintId = validateComplaintId(req.params.complaintId)
  const complaint = await getComplaintDetailAdmin(complaintId)

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found')
  }

  res.status(200).json({ success: true, complaint })
}

export async function verify(req: Request, res: Response): Promise<void> {
  const complaintId = validateComplaintId(req.params.complaintId)
  const note = parseOptionalNote((req.body as { note?: unknown }).note)

  const complaint = await verifyComplaint(complaintId, actorFromRequest(req), note)

  res.status(200).json({ success: true, complaintId: complaint.complaintId, status: complaint.status })
}

export async function reject(req: Request, res: Response): Promise<void> {
  const complaintId = validateComplaintId(req.params.complaintId)
  const note = parseOptionalNote((req.body as { note?: unknown }).note)

  const complaint = await rejectComplaint(complaintId, actorFromRequest(req), note)

  res.status(200).json({ success: true, complaintId: complaint.complaintId, status: complaint.status })
}

export async function assign(req: Request, res: Response): Promise<void> {
  const complaintId = validateComplaintId(req.params.complaintId)
  const authorityId = getObjectId((req.body as { authorityId?: unknown }).authorityId, 'authority id')

  const complaint = await assignComplaint(complaintId, authorityId, actorFromRequest(req))

  res.status(200).json({ success: true, complaintId: complaint.complaintId, status: complaint.status })
}

export async function reassign(req: Request, res: Response): Promise<void> {
  const complaintId = validateComplaintId(req.params.complaintId)
  const authorityId = getObjectId((req.body as { authorityId?: unknown }).authorityId, 'authority id')

  const complaint = await reassignComplaint(complaintId, authorityId, actorFromRequest(req))

  res.status(200).json({ success: true, complaintId: complaint.complaintId, status: complaint.status })
}

export async function listAuthorities(req: Request, res: Response): Promise<void> {
  const authorities = await listAuthoritiesForAdmin()
  res.status(200).json({ success: true, authorities })
}

export async function listAuthorityUsers(req: Request, res: Response): Promise<void> {
  const users = await listAuthorityUsersForAdmin()
  res.status(200).json({ success: true, users })
}

export async function updateAuthorityUser(req: Request, res: Response): Promise<void> {
  const userId = single(req.params.userId) ?? ''
  const body = req.body as { isActive?: unknown; authorityId?: unknown }

  const update: { isActive?: boolean; authorityId?: Types.ObjectId } = {}

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      throw new ApiError(400, 'isActive must be a boolean')
    }
    update.isActive = body.isActive
  }

  if (body.authorityId !== undefined) {
    update.authorityId = getObjectId(body.authorityId, 'authority id')
  }

  if (update.isActive === undefined && update.authorityId === undefined) {
    throw new ApiError(400, 'Nothing to update. Provide isActive and/or authorityId')
  }

  const user = await updateAuthorityUserAccess(userId, update)
  res.status(200).json({ success: true, user })
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const stats = await getAdminStats()
  res.status(200).json({ success: true, stats })
}