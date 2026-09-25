process.env.PORT = '5120'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production'
process.env.SEED_ADMIN_NAME = 'Ente Nadu Admin'
process.env.SEED_ADMIN_USERNAME = 'admin'
process.env.SEED_ADMIN_PASSWORD = 'AdminTest@123'
process.env.SEED_DEV_PASSWORD = 'DevTest@123'

const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('ente_nadu_admin_test')

const mongoose = (await import('mongoose')).default
const { createApp } = await import('../src/app.js')
const { Authority, Complaint, ComplaintHistory, AuditLog, Place } = await import('../src/models/index.js')
const { seedData } = await import('../src/seeds/seed.js')
const { seedAdmin } = await import('../src/seeds/seedAdmin.js')
const { seedAuthorityUsers } = await import('../src/seeds/seedUsers.js')
const { connectDatabase, disconnectDatabase } = await import('../src/config/db.js')
const { createComplaint } = await import('../src/services/complaint.service.js')
import type { CreateComplaintInput } from '../src/services/complaint.service.js'

let failures = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

await connectDatabase()
await seedData()
await seedAdmin()
await seedAuthorityUsers()

const kunnamthanam = await Authority.findOne({ code: 'KNM-GP' })
const adoor = await Authority.findOne({ code: 'ADOR-MUN' })
if (!kunnamthanam || !adoor) {
  throw new Error('Required authorities missing after seed')
}
const adoorPlace = await Place.findOne({ name: 'Adoor', district: 'Pathanamthitta' })
if (!adoorPlace) {
  throw new Error('Adoor place missing after seed')
}

await Authority.create({
  name: 'Deactivated Panchayat',
  type: 'Grama Panchayat',
  district: 'Pathanamthitta',
  code: 'INAC-GP',
  isActive: false,
})

const app = createApp()
const server = app.listen(5120)
const base = 'http://localhost:5120/api'

type Json = Record<string, unknown> | null

interface HttpResult {
  status: number
  data: Json
}

async function request(path: string, method: 'GET' | 'POST' | 'PATCH', body: unknown = null, token: string | null = null): Promise<HttpResult> {
  const headers: Record<string, string> = {}
  if (body !== null) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(base + path, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  })

  let data: Json = null
  try {
    data = (await response.json()) as Json
  } catch {
    // Non-JSON response.
  }

  return { status: response.status, data }
}

const patch = (path: string, body: unknown, token: string) => request(path, 'PATCH', body, token)
const get = (path: string, token?: string | null) => request(path, 'GET', null, token ?? null)

function makeComplaintInput(telegramUserId: string, description: string): CreateComplaintInput {
  return {
    telegramUserId,
    originalDescription: description,
    language: 'English',
    aiDescription: 'AI structured description of the issue',
    category: 'Road Infrastructure',
    severity: 'High',
    photoUrl: 'https://cloudinary.test/photos/demo.png',
    district: 'Pathanamthitta',
    placeId: adoorPlace._id,
    latitude: 9.166,
    longitude: 76.734,
  }
}

const c1 = await createComplaint(makeComplaintInput('tg_admin_1', 'Large pothole near the Adoor bus stand.'))
const c2 = await createComplaint(makeComplaintInput('tg_admin_2', 'Streetlight out on the main road.'))
const c3 = await createComplaint(makeComplaintInput('tg_admin_3', 'Drainage blocked near the market.'))

const adminLogin = await request('/auth/login', 'POST', { username: 'admin', password: 'AdminTest@123' })
const adminToken = adminLogin.data?.token as string
check('admin can log in', adminLogin.status === 200 && typeof adminToken === 'string')

const authorityLogin = await request('/auth/login', 'POST', { username: 'kunnamthanam_gp', password: 'DevTest@123' })
const authorityToken = authorityLogin.data?.token as string
check('authority user can log in (for security tests)', authorityLogin.status === 200)

console.log('\n=== Admin: complaint list ===')

const listAll = await get('/admin/complaints', adminToken)
const itemIds = ((listAll.data?.items as Array<{ complaintId: string }> | null) ?? []).map((item) => item.complaintId)
check('admin list returns 200', listAll.status === 200)
check('admin list contains Telegram-created complaints', itemIds.includes(c1.complaintId) && itemIds.includes(c2.complaintId) && itemIds.includes(c3.complaintId), `listed ${itemIds.length}`)
check('list item exposes display fields, not internal refs', (() => {
  const item = (listAll.data?.items as Array<Record<string, unknown>> | null)?.[0]
  return item !== undefined && typeof item.originalDescription === 'string' && item.photoUrl === 'https://cloudinary.test/photos/demo.png' && 'authority' in item && 'place' in item && !('placeId' in item)
})())

const listStatus = await get('/admin/complaints?status=submitted', adminToken)
const submittedOnly = ((listStatus.data?.items as Array<{ status: string }> | null) ?? []).every((item) => item.status === 'submitted')
check('status filter works', listStatus.status === 200 && submittedOnly && (listStatus.data?.items as Array<unknown>).length === 3)

const listCategory = await get('/admin/complaints?category=Road%20Infrastructure', adminToken)
check('category filter works', listCategory.status === 200 && (listCategory.data?.items as Array<unknown>).length === 3)

const listAuthorityFilter = await get(`/admin/complaints?authority=${String(adoor._id)}`, adminToken)
const authorityFiltered = ((listAuthorityFilter.data?.items as Array<{ complaintId: string; authority: { code: string } | null }> | null) ?? []).every((item) => item.authority?.code === 'ADOR-MUN')
check('authority filter works (auto-routed place authority)', listAuthorityFilter.status === 200 && authorityFiltered && (listAuthorityFilter.data?.items as Array<unknown>).length === 3, `${(listAuthorityFilter.data?.items as Array<unknown>).length} items`)

const listSearch = await get('/admin/complaints?search=streetlight', adminToken)
check('text search works', listSearch.status === 200 && (listSearch.data?.items as Array<{ complaintId: string }>).length === 1 && (listSearch.data?.items as Array<{ complaintId: string }>)[0].complaintId === c2.complaintId)

const listBadStatus = await get('/admin/complaints?status=bogus', adminToken)
check('invalid filter status rejected (400)', listBadStatus.status === 400)

const listBadPage = await get('/admin/complaints?page=0', adminToken)
check('invalid page rejected (400)', listBadPage.status === 400)

console.log('\n=== Admin: complaint detail ===')

const detail1 = await get(`/admin/complaints/${c1.complaintId}`, adminToken)
const detailBody = detail1.data?.complaint as Record<string, unknown> | null
check('detail returns 200 with full fields', detail1.status === 200 && detailBody !== null && detailBody.originalDescription === 'Large pothole near the Adoor bus stand.' && detailBody.language === 'English' && detailBody.aiDescription !== null && detailBody.completedAt === null)
check('detail includes place + authority + location', detailBody !== null && (detailBody.place as { name: string } | null)?.name === 'Adoor' && (detailBody.authority as { code: string } | null)?.code === 'ADOR-MUN' && (detailBody.location as { latitude: number } | null)?.latitude === 9.166)
check('detail includes history (null → submitted)', (detailBody?.history as Array<{ newStatus: string; previousStatus: string | null }> | null)?.[0]?.newStatus === 'submitted' && (detailBody?.history as Array<{ newStatus: string }>).length === 1)
check('detail includes audit trail', (detailBody?.audit as Array<{ action: string }> | null)?.[0]?.action === 'CREATE_COMPLAINT')

const detailRejected = await get('/admin/complaints/does-not-exist', adminToken)
check('bad complaint id format rejected (400)', detailRejected.status === 400)

const detailUnknown = await get('/admin/complaints/EN-2026-99999', adminToken)
check('unknown complaint id returns 404', detailUnknown.status === 404)

console.log('\n=== Admin: verify ===')

const patchVerify = await patch(`/admin/complaints/${c1.complaintId}/verify`, {}, adminToken)
check('verify submitted → verified (200)', patchVerify.status === 200 && patchVerify.data?.status === 'verified')
const c1AfterVerify = await Complaint.findOne({ complaintId: c1.complaintId }).lean()
check('complaint persisted as verified', c1AfterVerify?.status === 'verified')

const verifyAgain = await patch(`/admin/complaints/${c1.complaintId}/verify`, {}, adminToken)
check('double verify rejected (409)', verifyAgain.status === 409)

const rejectVerified = await patch(`/admin/complaints/${c1.complaintId}/reject`, {}, adminToken)
check('reject on verified rejected (409)', rejectVerified.status === 409)

const info1 = await ComplaintHistory.find({ complaintId: c1._id }).sort({ createdAt: 1 }).lean()
check('verify records history (submitted → verified)', info1.some((entry) => entry.previousStatus === 'submitted' && entry.newStatus === 'verified' && entry.changedByRole === 'admin'))
const audit1 = await AuditLog.find({ entityId: c1._id }).lean()
check('verify records VERIFY_COMPLAINT audit', audit1.some((entry) => entry.action === 'VERIFY_COMPLAINT'))

console.log('\n=== Admin: reject ===')

const patchReject = await patch(`/admin/complaints/${c2.complaintId}/reject`, { note: 'Duplicate report' }, adminToken)
check('reject submitted → rejected (200)', patchReject.status === 200 && patchReject.data?.status === 'rejected')
const c2AfterReject = await Complaint.findOne({ complaintId: c2.complaintId })
check('reject history note kept', (await ComplaintHistory.find({ complaintId: c2._id }).sort({ createdAt: 1 }).lean()).some((entry) => entry.newStatus === 'rejected' && entry.note === 'Duplicate report'))
const rejectAgain = await patch(`/admin/complaints/${c2.complaintId}/reject`, {}, adminToken)
check('double reject rejected (409)', rejectAgain.status === 409)
const rejectWithLongNote = await patch(`/admin/complaints/${c2.complaintId}/reject`, { note: 'x'.repeat(600) }, adminToken)
check('note too long rejected (400)', rejectWithLongNote.status === 400)

console.log('\n=== Admin: assign ===')

const assignVerified = await patch(`/admin/complaints/${c1.complaintId}/assign`, { authorityId: String(adoor._id) }, adminToken)
check('assign verified → assigned (200)', assignVerified.status === 200 && assignVerified.data?.status === 'assigned')
const c1AfterAssign = await Complaint.findOne({ complaintId: c1.complaintId }).lean()
check('authority persisted on complaint', c1AfterAssign?.authorityId?.toString() === adoor._id.toString())

const assignSubmitted = await patch(`/admin/complaints/${c3.complaintId}/assign`, { authorityId: String(adoor._id) }, adminToken)
check('assign submitted complaint rejected (409)', assignSubmitted.status === 409)

const verifyC3 = await patch(`/admin/complaints/${c3.complaintId}/verify`, {}, adminToken)
check('verify c3 for assign tests', verifyC3.status === 200)

const assignInactive = await patch(`/admin/complaints/${c3.complaintId}/assign`, { authorityId: (await Authority.findOne({ code: 'INAC-GP' }))!._id.toString() }, adminToken)
check('assign to inactive authority rejected (400)', assignInactive.status === 400 && (assignInactive.data?.message as string).includes('not active'))

const assignMissing = await patch(`/admin/complaints/${c3.complaintId}/assign`, { authorityId: new mongoose.Types.ObjectId().toString() }, adminToken)
const assignNonexistent = assignMissing.status === 400
check('assign to nonexistent authority rejected (400)', assignNonexistent, `status ${assignMissing.status}`)

const assignBadId = await patch(`/admin/complaints/${c3.complaintId}/assign`, { authorityId: 'not-an-object-id' }, adminToken)
check('assign with invalid authority id rejected (400)', assignBadId.status === 400)

const assignC3 = await patch(`/admin/complaints/${c3.complaintId}/assign`, { authorityId: String(kunnamthanam._id) }, adminToken)
check('assign c3 to kunnamthanam (200)', assignC3.status === 200 && assignC3.data?.status === 'assigned')

console.log('\n=== Admin: reassign ===')

const patchReassign = await patch(`/admin/complaints/${c1.complaintId}/reassign`, { authorityId: String(kunnamthanam._id) }, adminToken)
check('reassign assigned complaint (200)', patchReassign.status === 200 && patchReassign.data?.status === 'assigned')
const c1AfterReassign = await Complaint.findOne({ complaintId: c1.complaintId }).lean()
check('authority switched on complaint', c1AfterReassign?.authorityId?.toString() === kunnamthanam._id.toString())
const reassignAudit = await AuditLog.findOne({ action: 'REASSIGN_COMPLAINT', entityId: c1._id }).lean()
check('reassign audit keeps previous authority traceable', reassignAudit !== null && (reassignAudit.metadata as { fromAuthorityId: string }).fromAuthorityId === adoor._id.toString())
const reassignHistory = await ComplaintHistory.findOne({ complaintId: c1._id, newStatus: 'assigned', changedByRole: 'admin' }).sort({ createdAt: -1 }).lean()
check('reassign history notes previous authority', (reassignHistory?.note ?? '').includes('Adoor Municipality'))

const reassignSame = await patch(`/admin/complaints/${c1.complaintId}/reassign`, { authorityId: String(kunnamthanam._id) }, adminToken)
check('reassign to same authority rejected (400)', reassignSame.status === 400)

const reassignRejected = await patch(`/admin/complaints/${c2.complaintId}/reassign`, { authorityId: String(kunnamthanam._id) }, adminToken)
check('reassign rejected complaint rejected (409)', reassignRejected.status === 409)

const unassigned = await createComplaint({
  ...makeComplaintInput('tg_admin_4', 'Water leak near the junction.'),
  placeId: null,
  district: 'Pathanamthitta',
})
await Complaint.updateOne({ _id: unassigned._id }, { status: 'verified' })
const reassignUnassigned = await patch(`/admin/complaints/${unassigned.complaintId}/reassign`, { authorityId: String(adoor._id) }, adminToken)
check('reassign unassigned complaint rejected (400)', reassignUnassigned.status === 400 && (reassignUnassigned.data?.message as string).includes('not assigned'))

console.log('\n=== Admin: authorities + stats ===')

const authoritiesList = await get('/admin/authorities', adminToken)
const authorities = (authoritiesList.data?.authorities as Array<{ code: string; isActive: boolean }> | null) ?? []
check('authorities endpoint lists all authorities', authoritiesList.status === 200 && authorities.length === 11, `${authorities.length} authorities`)
check('authority view includes active state', authorities.some((authority) => authority.code === 'INAC-GP' && authority.isActive === false) && authorities.some((authority) => authority.code === 'KNM-GP' && authority.isActive === true))

const statsBefore = await get('/admin/stats', adminToken)
const statsBeforeBody = statsBefore.data?.stats as { totals: Record<string, number> } | null
check('stats total matches complaint count', statsBeforeBody !== null && statsBeforeBody.totals.total === (await Complaint.countDocuments()), `${statsBeforeBody?.totals.total} vs DB`)

const extra = await createComplaint(makeComplaintInput('tg_admin_5', 'Another parked vehicle issue.'))
const statsAfter = await get('/admin/stats', adminToken)
const statsAfterBody = statsAfter.data?.stats as { totals: Record<string, number> } | null
check('stats are database-backed (reflect new complaint)', statsAfterBody !== null && statsAfterBody.totals.total === (await Complaint.countDocuments()) && statsAfterBody.totals.submitted === statsBeforeBody!.totals.submitted + 1)
check('stats recent list present', Array.isArray(statsAfterBody?.recent) && (statsAfterBody?.recent as Array<unknown>).length > 0)
await Complaint.deleteOne({ _id: extra._id })

console.log('\n=== Admin: security ===')

const noToken = await get('/admin/complaints')
check('admin endpoint without token → 401', noToken.status === 401)

const authorityOnAdmin = await get('/admin/complaints', authorityToken)
check('authority token on admin endpoint → 403', authorityOnAdmin.status === 403)

const adminOnAuthority = await get('/authority/complaints', adminToken)
check('admin token on authority endpoint → 403', adminOnAuthority.status === 403)

const listBodyText = JSON.stringify(listAll.data)
check('no password/secret material leaks from admin list', !listBodyText.toLowerCase().includes('passwordhash') && !listBodyText.includes('JWT_SECRET'))

console.log('\n=== Regression: Phase 4 citizen service ===')

const citizenList = (await import('../src/services/complaint.service.js')).listComplaintsByCitizen
const mine = await citizenList('tg_admin_1')
check('Phase 4 my-complaints service still works', mine.length >= 1 && mine[0].complaintId === c1.complaintId)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

server.close()
await disconnectDatabase()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)