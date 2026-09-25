import type { HydratedDocument } from 'mongoose'
import { Types } from 'mongoose'
import type {
  Complaint as ComplaintDoc,
  ComplaintCategory,
  ComplaintSeverity,
  ComplaintStatus,
} from '../models/Complaint.js'
import {
  AuditLog,
  Authority,
  Complaint,
  ComplaintHistory,
  Counter,
  User,
  type ActorRole,
} from '../models/index.js'
import { COMPLAINT_SEQ_KEY, formatComplaintId } from '../utils/complaintId.js'
import { ApiError } from '../utils/ApiError.js'
import { notifyComplaintStatus } from './notification.service.js'
import { escapeRegExp } from '../utils/requestValidation.js'
import { getActiveAuthorityId } from './place.service.js'

type HydratedComplaint = HydratedDocument<ComplaintDoc>

function isValidCoordinate(latitude: number | null, longitude: number | null): boolean {
  if (latitude === null && longitude === null) {
    return true
  }
  if (latitude === null || longitude === null) {
    return false
  }
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

export interface CreateComplaintInput {
  telegramUserId: string
  originalDescription: string
  language: string | null
  aiDescription: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  photoUrl: string | null
  district: string | null
  locationLabel: string | null
  placeId: Types.ObjectId | null
  latitude: number | null
  longitude: number | null
}

async function nextComplaintSeq(): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    COMPLAINT_SEQ_KEY,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return counter?.seq ?? 1
}

export async function createComplaint(input: CreateComplaintInput): Promise<ComplaintDoc> {
  const seq = await nextComplaintSeq()
  const complaintId = formatComplaintId(seq)

  if (!isValidCoordinate(input.latitude, input.longitude)) {
    throw new ApiError(400, 'Invalid location coordinates')
  }

  const authorityId = input.placeId ? await getActiveAuthorityId(input.placeId.toString()) : null

  const complaint = await Complaint.create({
    complaintId,
    citizenTelegramId: input.telegramUserId,
    originalDescription: input.originalDescription,
    language: input.language,
    aiDescription: input.aiDescription,
    category: input.category,
    severity: input.severity,
    photoUrl: input.photoUrl,
    district: input.district,
    locationLabel: input.locationLabel,
    placeId: input.placeId,
    latitude: input.latitude,
    longitude: input.longitude,
    authorityId,
    status: 'submitted',
  })

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus: null,
    newStatus: 'submitted',
    changedBy: null,
    changedByRole: 'system',
    note: 'Complaint registered by the citizen through the Telegram bot',
  })

  await AuditLog.create({
    actorId: null,
    actorRole: 'citizen',
    action: 'CREATE_COMPLAINT',
    entityType: 'Complaint',
    entityId: complaint._id,
    metadata: {
      complaintId,
      citizenTelegramId: input.telegramUserId,
    },
  })

  await notifyComplaintStatus(complaint, 'submitted')

  return complaint
}

export async function listComplaintsByCitizen(telegramUserId: string, limit = 5): Promise<ComplaintDoc[]> {
  return Complaint.find({ citizenTelegramId: telegramUserId }).sort({ createdAt: -1 }).limit(limit).lean()
}

export async function getComplaintByCitizen(complaintId: string, telegramUserId: string): Promise<ComplaintDoc | null> {
  const complaint = await Complaint.findOne({ complaintId, citizenTelegramId: telegramUserId }).populate('placeId', 'name district').lean()

  return complaint ?? null
}

export interface ComplaintActor {
  userId: string | null
  role: ActorRole
}

export interface ComplaintPlaceView {
  id: string
  name: string
  district: string
}

export interface ComplaintAuthorityView {
  id: string
  name: string
  code: string
  district: string
}

export interface ComplaintActorView {
  id: string
  name: string
}

export interface ComplaintView {
  complaintId: string
  originalDescription: string
  aiDescription: string | null
  language: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  photoUrl: string | null
  district: string | null
  locationLabel: string | null
  place: ComplaintPlaceView | null
  location: { latitude: number; longitude: number } | null
  authority: ComplaintAuthorityView | null
  status: ComplaintStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
  completedBy: ComplaintActorView | null
}

export interface ComplaintHistoryView {
  previousStatus: ComplaintStatus | null
  newStatus: ComplaintStatus
  changedByRole: ActorRole
  changedBy: ComplaintActorView | null
  note: string | null
  createdAt: string
}

export interface ComplaintAuditView {
  action: string
  actorRole: ActorRole
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface ComplaintDetailView extends ComplaintView {
  history: ComplaintHistoryView[]
  audit: ComplaintAuditView[]
}

export interface AuthorityView {
  id: string
  name: string
  type: string
  district: string
  code: string
  isActive: boolean
  createdAt: string
}

export interface PagedResult<T> {
  items: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface ComplaintListFilters {
  status?: ComplaintStatus
  district?: string
  authorityId?: Types.ObjectId
  category?: ComplaintCategory
  severity?: ComplaintSeverity
  search?: string
}

interface ComplaintRow {
  _id: unknown
  complaintId: string
  originalDescription: string
  aiDescription: string | null
  language: string | null
  category: ComplaintCategory | null
  severity: ComplaintSeverity | null
  photoUrl: string | null
  district: string | null
  locationLabel: string | null
  placeId: { _id: unknown; name: string; district: string } | null
  latitude: number | null
  longitude: number | null
  authorityId: { _id: unknown; name: string; code: string; district: string } | null
  status: ComplaintStatus
  createdAt: Date | string
  updatedAt: Date | string
  completedAt: Date | string | null
  completedBy: { _id: unknown; name: string } | null
}

interface HistoryRow {
  previousStatus: ComplaintStatus | null
  newStatus: ComplaintStatus
  changedByRole: ActorRole
  changedBy: { _id: unknown; name: string } | null
  note: string | null
  createdAt: Date | string
}

interface AuditRow {
  action: string
  actorRole: ActorRole
  metadata: Record<string, unknown> | null
  createdAt: Date | string
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return new Date(value).toISOString()
}

function buildComplaintView(row: ComplaintRow): ComplaintView {
  const location =
    row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined
      ? { latitude: row.latitude, longitude: row.longitude }
      : null

  return {
    complaintId: row.complaintId,
    originalDescription: row.originalDescription,
    aiDescription: row.aiDescription,
    language: row.language,
    category: row.category,
    severity: row.severity,
    photoUrl: row.photoUrl,
    district: row.district,
    locationLabel: row.locationLabel ?? null,
    place: row.placeId ? { id: String(row.placeId._id), name: row.placeId.name, district: row.placeId.district } : null,
    location,
    authority: row.authorityId
      ? {
          id: String(row.authorityId._id),
          name: row.authorityId.name,
          code: row.authorityId.code,
          district: row.authorityId.district,
        }
      : null,
    status: row.status,
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
    completedAt: toIso(row.completedAt),
    completedBy: row.completedBy ? { id: String(row.completedBy._id), name: row.completedBy.name } : null,
  }
}

function buildHistory(row: HistoryRow): ComplaintHistoryView {
  return {
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    changedByRole: row.changedByRole,
    changedBy: row.changedBy ? { id: String(row.changedBy._id), name: row.changedBy.name } : null,
    note: row.note,
    createdAt: toIso(row.createdAt) ?? '',
  }
}

function buildAudit(row: AuditRow): ComplaintAuditView {
  return {
    action: row.action,
    actorRole: row.actorRole,
    metadata: row.metadata,
    createdAt: toIso(row.createdAt) ?? '',
  }
}

const COMPLAINT_BASE_QUERY_FIELDS = 'name district'
const AUTHORITY_BASE_QUERY_FIELDS = 'name code district'

async function fetchComplaintRow(complaintId: string): Promise<ComplaintRow | null> {
  const row = await Complaint.findOne({ complaintId })
    .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
    .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
    .populate('completedBy', 'name')
    .lean()
  return (row as unknown as ComplaintRow | null) ?? null
}

export async function listComplaintsAdmin(
  filters: ComplaintListFilters,
  pagination: { page: number; limit: number },
): Promise<PagedResult<ComplaintView>> {
  const query: Record<string, unknown> = {}

  if (filters.status) {
    query.status = filters.status
  }
  if (filters.district) {
    query.district = { $regex: `^${escapeRegExp(filters.district)}$`, $options: 'i' }
  }
  if (filters.authorityId) {
    query.authorityId = filters.authorityId
  }
  if (filters.category) {
    query.category = filters.category
  }
  if (filters.severity) {
    query.severity = filters.severity
  }
  if (filters.search) {
    const regex = new RegExp(escapeRegExp(filters.search), 'i')
    query.$or = [{ complaintId: regex }, { originalDescription: regex }, { aiDescription: regex }]
  }

  const [total, rows] = await Promise.all([
    Complaint.countDocuments(query),
    Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
      .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
      .populate('completedBy', 'name')
      .lean(),
  ])

  const items = (rows as unknown as ComplaintRow[]).map((row) => buildComplaintView(row))
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit)

  return { items, pagination: { page: pagination.page, limit: pagination.limit, total, totalPages } }
}

export async function listComplaintsByAuthority(
  authorityId: string,
  filters: ComplaintListFilters,
  pagination: { page: number; limit: number },
): Promise<PagedResult<ComplaintView>> {
  const query: Record<string, unknown> = { authorityId }

  if (filters.status) {
    query.status = filters.status
  }
  if (filters.category) {
    query.category = filters.category
  }
  if (filters.severity) {
    query.severity = filters.severity
  }
  if (filters.search) {
    query.complaintId = new RegExp(escapeRegExp(filters.search), 'i')
  }

  const [total, rows] = await Promise.all([
    Complaint.countDocuments(query),
    Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
      .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
      .populate('completedBy', 'name')
      .lean(),
  ])

  const items = (rows as unknown as ComplaintRow[]).map((row) => buildComplaintView(row))
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit)

  return { items, pagination: { page: pagination.page, limit: pagination.limit, total, totalPages } }
}

export async function getComplaintDetailAdmin(complaintId: string): Promise<ComplaintDetailView | null> {
  const row = await fetchComplaintRow(complaintId)

  if (!row) {
    return null
  }

  const [historyRows, auditRows] = await Promise.all([
    ComplaintHistory.find({ complaintId: row._id })
      .populate('changedBy', 'name')
      .sort({ createdAt: 1 })
      .lean(),
    AuditLog.find({ entityType: 'Complaint', entityId: row._id }).sort({ createdAt: 1 }).lean(),
  ])

  return {
    ...buildComplaintView(row),
    history: (historyRows as unknown as HistoryRow[]).map((entry) => buildHistory(entry)),
    audit: (auditRows as unknown as AuditRow[]).map((entry) => buildAudit(entry)),
  }
}

export async function getComplaintDetailAuthority(
  complaintId: string,
  authorityId: string,
): Promise<ComplaintDetailView | null> {
  const row = (await Complaint.findOne({ complaintId, authorityId })
    .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
    .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
    .populate('completedBy', 'name')
    .lean()) as unknown as ComplaintRow | null

  if (!row) {
    return null
  }

  const historyRows = (await ComplaintHistory.find({ complaintId: row._id })
    .populate('changedBy', 'name')
    .sort({ createdAt: 1 })
    .lean()) as unknown as HistoryRow[]

  return {
    ...buildComplaintView(row),
    history: historyRows.map((entry) => buildHistory(entry)),
    audit: [],
  }
}

const ADMIN_VERIFY_REJECT_STATUSES = new Set<ComplaintStatus>(['submitted'])
const REASSIGNABLE_STATUSES = new Set<ComplaintStatus>(['assigned', 'under_review', 'in_progress'])

const AUTHORITY_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus> = {
  assigned: 'under_review',
  under_review: 'in_progress',
  in_progress: 'completed',
  submitted: 'verified',
  verified: 'assigned',
  completed: 'completed',
  rejected: 'rejected',
}

function assertAuthorityTransition(current: ComplaintStatus, requested: ComplaintStatus): void {
  const allowed = AUTHORITY_TRANSITIONS[current]

  if (!allowed || allowed === current) {
    throw new ApiError(409, `Status transition from "${current}" is not allowed`)
  }

  if (requested !== allowed) {
    throw new ApiError(409, `Status transition from "${current}" to "${requested}" is not allowed`)
  }
}

async function fetchComplaintForWrite(complaintId: string): Promise<HydratedComplaint> {
  const complaint = await Complaint.findOne({ complaintId })

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found')
  }

  return complaint
}

async function assertActiveAuthority(authorityId: Types.ObjectId): Promise<{ _id: Types.ObjectId; name: string }> {
  const authority = await Authority.findById(authorityId).select('name isActive').lean()

  if (!authority) {
    throw new ApiError(400, 'Authority not found')
  }

  if (!authority.isActive) {
    throw new ApiError(400, 'Authority is not active')
  }

  return { _id: authority._id, name: authority.name }
}

async function recordAudit(
  actor: ComplaintActor,
  action: string,
  entityId: Types.ObjectId,
  metadata: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    actorId: actor.userId ? new Types.ObjectId(actor.userId) : null,
    actorRole: actor.role,
    action,
    entityType: 'Complaint',
    entityId,
    metadata: { ...metadata },
  })
}

export async function verifyComplaint(complaintId: string, actor: ComplaintActor, note?: string): Promise<ComplaintDoc> {
  const complaint = await fetchComplaintForWrite(complaintId)

  if (!ADMIN_VERIFY_REJECT_STATUSES.has(complaint.status)) {
    throw new ApiError(409, `Only "submitted" complaints can be verified (current: ${complaint.status})`)
  }

  const previousStatus = complaint.status
  complaint.status = 'verified'
  await complaint.save()

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus,
    newStatus: 'verified',
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : null,
    changedByRole: actor.role,
    note: note ?? 'Complaint verified by administrator',
  })

  await recordAudit(actor, 'VERIFY_COMPLAINT', complaint._id, { fromStatus: previousStatus, toStatus: 'verified' })

  await notifyComplaintStatus(complaint, 'verified')

  return complaint
}

export async function rejectComplaint(complaintId: string, actor: ComplaintActor, note?: string): Promise<ComplaintDoc> {
  const complaint = await fetchComplaintForWrite(complaintId)

  if (!ADMIN_VERIFY_REJECT_STATUSES.has(complaint.status)) {
    throw new ApiError(409, `Only "submitted" complaints can be rejected (current: ${complaint.status})`)
  }

  const previousStatus = complaint.status
  complaint.status = 'rejected'
  await complaint.save()

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus,
    newStatus: 'rejected',
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : null,
    changedByRole: actor.role,
    note: note ?? 'Complaint rejected by administrator',
  })

  await recordAudit(actor, 'REJECT_COMPLAINT', complaint._id, {
    fromStatus: previousStatus,
    toStatus: 'rejected',
    note,
  })

  await notifyComplaintStatus(complaint, 'rejected', note ? `Reason: ${note}` : undefined)

  return complaint
}

export async function assignComplaint(
  complaintId: string,
  authorityId: Types.ObjectId,
  actor: ComplaintActor,
): Promise<ComplaintDoc> {
  const complaint = await fetchComplaintForWrite(complaintId)

  if (complaint.status !== 'verified') {
    throw new ApiError(409, `Only "verified" complaints can be assigned (current: ${complaint.status})`)
  }

  const authority = await assertActiveAuthority(authorityId)
  const previousAuthorityId = complaint.authorityId ? complaint.authorityId.toString() : null

  complaint.authorityId = authority._id
  complaint.status = 'assigned'
  await complaint.save()

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus: 'verified',
    newStatus: 'assigned',
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : null,
    changedByRole: actor.role,
    note: `Assigned to ${authority.name}`,
  })

  await recordAudit(actor, 'ASSIGN_COMPLAINT', complaint._id, {
    fromAuthorityId: previousAuthorityId,
    toAuthorityId: authority._id.toString(),
    toAuthorityName: authority.name,
  })

  await notifyComplaintStatus(complaint, 'assigned', `Assigned to: ${authority.name}`)

  return complaint
}

export async function reassignComplaint(
  complaintId: string,
  authorityId: Types.ObjectId,
  actor: ComplaintActor,
): Promise<ComplaintDoc> {
  const complaint = await fetchComplaintForWrite(complaintId)

  if (!complaint.authorityId) {
    throw new ApiError(400, 'Complaint is not assigned to any authority')
  }

  if (complaint.authorityId.toString() === authorityId.toString()) {
    throw new ApiError(400, 'Complaint is already assigned to this authority')
  }

  if (!REASSIGNABLE_STATUSES.has(complaint.status)) {
    throw new ApiError(409, `Complaint cannot be reassigned from status "${complaint.status}"`)
  }

  const authority = await assertActiveAuthority(authorityId)
  const previousAuthority = await Authority.findById(complaint.authorityId).select('name').lean()
  const previousAuthorityId = complaint.authorityId.toString()
  const previousStatus = complaint.status

  complaint.authorityId = authority._id
  complaint.status = 'assigned'
  await complaint.save()

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus,
    newStatus: 'assigned',
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : null,
    changedByRole: actor.role,
    note: `Reassigned from ${previousAuthority?.name ?? 'unknown authority'} to ${authority.name}`,
  })

  await recordAudit(actor, 'REASSIGN_COMPLAINT', complaint._id, {
    fromAuthorityId: previousAuthorityId,
    fromAuthorityName: previousAuthority?.name ?? null,
    toAuthorityId: authority._id.toString(),
    toAuthorityName: authority.name,
  })

  await notifyComplaintStatus(complaint, 'assigned', `Assigned to: ${authority.name}`)

  return complaint
}

export async function updateComplaintStatusByAuthority(
  complaintId: string,
  authorityId: string,
  requestedStatus: ComplaintStatus,
  actor: ComplaintActor,
  note?: string,
): Promise<ComplaintDoc> {
  const complaint = await Complaint.findOne({ complaintId, authorityId })

  if (!complaint) {
    throw new ApiError(404, 'Complaint not found')
  }

  assertAuthorityTransition(complaint.status, requestedStatus)

  const previousStatus = complaint.status
  complaint.status = requestedStatus

  if (requestedStatus === 'completed') {
    complaint.completedAt = new Date()
    complaint.completedBy = actor.userId ? new Types.ObjectId(actor.userId) : null
  }

  await complaint.save()

  await ComplaintHistory.create({
    complaintId: complaint._id,
    previousStatus,
    newStatus: requestedStatus,
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : null,
    changedByRole: actor.role,
    note: note ?? null,
  })

  await recordAudit(
    actor,
    requestedStatus === 'completed' ? 'COMPLETE_COMPLAINT' : 'UPDATE_COMPLAINT_STATUS',
    complaint._id,
    { fromStatus: previousStatus, toStatus: requestedStatus, note },
  )

  await notifyComplaintStatus(complaint, requestedStatus)

  return complaint
}

export async function listAuthoritiesForAdmin(): Promise<AuthorityView[]> {
  const rows = (await Authority.find().sort({ district: 1, name: 1 }).lean()) as unknown as Array<{
    _id: unknown
    name: string
    type: string
    district: string
    code: string
    isActive: boolean
    createdAt: Date | string
  }>

  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    type: row.type,
    district: row.district,
    code: row.code,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt) ?? '',
  }))
}

export interface AuthorityUserView {
  id: string
  name: string
  username: string
  role: string
  isActive: boolean
  authority: { id: string | null; name: string | null; code: string | null }
}

export async function listAuthorityUsersForAdmin(): Promise<AuthorityUserView[]> {
  const rows = (await User.find({ role: 'authority' })
    .populate('authorityId', 'name code district')
    .sort({ name: 1 })
    .lean()) as unknown as Array<{
    _id: unknown
    name: string
    username: string
    role: string
    isActive: boolean
    authorityId: { _id: unknown; name: string; code: string } | null
  }>

  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: row.isActive,
    authority: row.authorityId
      ? { id: String(row.authorityId._id), name: row.authorityId.name, code: row.authorityId.code }
      : { id: null, name: null, code: null },
  }))
}

export interface AuthorityUserAccessUpdate {
  isActive?: boolean
  authorityId?: Types.ObjectId
}

export async function updateAuthorityUserAccess(
  userId: string,
  update: AuthorityUserAccessUpdate,
): Promise<AuthorityUserView> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, 'Invalid user id')
  }

  const user = await User.findById(userId)

  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  if (user.role !== 'authority') {
    throw new ApiError(400, 'Only authority accounts can be managed here')
  }

  if (update.authorityId) {
    const authority = await Authority.findById(update.authorityId).select('isActive').lean()
    if (!authority) {
      throw new ApiError(400, 'Authority not found')
    }
    if (!authority.isActive) {
      throw new ApiError(400, 'Authority is not active')
    }
    user.authorityId = update.authorityId
  }

  if (update.isActive !== undefined) {
    user.isActive = update.isActive
  }

  await user.save()

  let authorityView: AuthorityUserView['authority'] = { id: null, name: null, code: null }
  if (user.authorityId) {
    const authority = await Authority.findById(user.authorityId).select('name code').lean()
    if (authority) {
      authorityView = { id: user.authorityId.toString(), name: authority.name, code: authority.code }
    }
  }

  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    authority: authorityView,
  }
}

async function buildStatusTotalsByMatch(match: Record<string, unknown>): Promise<Partial<Record<ComplaintStatus, number>>> {
  const rows = await Complaint.aggregate<{ _id: ComplaintStatus; count: number }>([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])

  const totals: Partial<Record<ComplaintStatus, number>> = {}
  for (const row of rows) {
    totals[row._id] = row.count
  }
  return totals
}

export interface AdminStats {
  totals: Record<ComplaintStatus, number> & { total: number }
  recent: ComplaintView[]
}

export async function getAdminStats(): Promise<AdminStats> {
  const [grouped, total, rows] = await Promise.all([
    buildStatusTotalsByMatch({}),
    Complaint.countDocuments(),
    Complaint.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
      .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
      .populate('completedBy', 'name')
      .lean(),
  ])

  const totals = {
    submitted: grouped.submitted ?? 0,
    verified: grouped.verified ?? 0,
    assigned: grouped.assigned ?? 0,
    under_review: grouped.under_review ?? 0,
    in_progress: grouped.in_progress ?? 0,
    completed: grouped.completed ?? 0,
    rejected: grouped.rejected ?? 0,
    total,
  }

  return { totals, recent: (rows as unknown as ComplaintRow[]).map((row) => buildComplaintView(row)) }
}

export interface AuthorityStats {
  totals: Record<ComplaintStatus, number> & { total: number }
  recent: ComplaintView[]
}

export async function getAuthorityStats(authorityId: string): Promise<AuthorityStats> {
  const authorityObjectId = new Types.ObjectId(authorityId)
  const match = { authorityId: authorityObjectId }

  const [grouped, total, rows] = await Promise.all([
    buildStatusTotalsByMatch(match),
    Complaint.countDocuments(match),
    Complaint.find(match)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('placeId', COMPLAINT_BASE_QUERY_FIELDS)
      .populate('authorityId', AUTHORITY_BASE_QUERY_FIELDS)
      .populate('completedBy', 'name')
      .lean(),
  ])

  const totals = {
    submitted: grouped.submitted ?? 0,
    verified: grouped.verified ?? 0,
    assigned: grouped.assigned ?? 0,
    under_review: grouped.under_review ?? 0,
    in_progress: grouped.in_progress ?? 0,
    completed: grouped.completed ?? 0,
    rejected: grouped.rejected ?? 0,
    total,
  }

  return { totals, recent: (rows as unknown as ComplaintRow[]).map((row) => buildComplaintView(row)) }
}