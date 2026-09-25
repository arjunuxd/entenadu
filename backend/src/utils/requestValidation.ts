import { Types } from 'mongoose'
import { COMPLAINT_ID_PATTERN } from './complaintId.js'
import { ApiError } from './ApiError.js'
import { COMPLAINT_CATEGORIES, COMPLAINT_SEVERITIES, COMPLAINT_STATUSES, type ComplaintCategory, type ComplaintSeverity, type ComplaintStatus } from '../models/Complaint.js'

export function validateComplaintId(value: unknown): string {
  if (typeof value !== 'string' || !COMPLAINT_ID_PATTERN.test(value)) {
    throw new ApiError(400, 'Invalid complaint id. Expected format EN-YYYY-NNNNN.')
  }
  return value
}

export function getObjectId(value: unknown, label: string): Types.ObjectId {
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`)
  }
  return new Types.ObjectId(value)
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseOptionalStatus(value: unknown): ComplaintStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value !== 'string' || !COMPLAINT_STATUSES.includes(value as ComplaintStatus)) {
    throw new ApiError(400, 'Invalid status filter')
  }
  return value as ComplaintStatus
}

export function parseOptionalCategory(value: unknown): ComplaintCategory | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value !== 'string' || !COMPLAINT_CATEGORIES.includes(value as ComplaintCategory)) {
    throw new ApiError(400, 'Invalid category filter')
  }
  return value as ComplaintCategory
}

export function parseOptionalSeverity(value: unknown): ComplaintSeverity | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value !== 'string' || !COMPLAINT_SEVERITIES.includes(value as ComplaintSeverity)) {
    throw new ApiError(400, 'Invalid severity filter')
  }
  return value as ComplaintSeverity
}

export function parseOptionalObjectId(value: unknown, label: string): Types.ObjectId | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`)
  }
  return new Types.ObjectId(value)
}

export interface Pagination {
  page: number
  limit: number
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const rawPage = query.page
  const rawLimit = query.limit

  let page = 1
  if (rawPage !== undefined && rawPage !== '') {
    page = Number.parseFloat(String(rawPage))
    if (!Number.isInteger(page) || page < 1) {
      throw new ApiError(400, 'Invalid page value')
    }
  }

  let limit = 20
  if (rawLimit !== undefined && rawLimit !== '') {
    limit = Number.parseFloat(String(rawLimit))
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ApiError(400, 'Invalid limit value (1-100)')
    }
  }

  return { page, limit }
}

export function parseOptionalNote(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Invalid note')
  }
  const trimmed = value.trim()
  if (trimmed.length > 500) {
    throw new ApiError(400, 'Note must be 500 characters or fewer')
  }
  return trimmed.length > 0 ? trimmed : undefined
}