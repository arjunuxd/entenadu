process.env.PORT = '5121'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production'
process.env.SEED_ADMIN_NAME = 'Ente Nadu Admin'
process.env.SEED_ADMIN_USERNAME = 'admin'
process.env.SEED_ADMIN_PASSWORD = 'AdminTest@123'
process.env.SEED_DEV_PASSWORD = 'DevTest@123'

const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('ente_nadu_authority_test')

const { createApp } = await import('../src/app.js')
const { Authority, Complaint, ComplaintHistory, AuditLog, Place, User } = await import('../src/models/index.js')
const { seedData } = await import('../src/seeds/seed.js')
const { seedAdmin } = await import('../src/seeds/seedAdmin.js')
const { seedAuthorityUsers } = await import('../src/seeds/seedUsers.js')
const { connectDatabase, disconnectDatabase } = await import('../src/config/db.js')
const {
  assignComplaint,
  createComplaint,
  verifyComplaint,
} = await import('../src/services/complaint.service.js')
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

const authorityA = await Authority.findOne({ code: 'KNM-GP' })
const authorityB = await Authority.findOne({ code: 'ADOR-MUN' })
if (!authorityA || !authorityB) {
  throw new Error('Required authorities missing after seed')
}
const kunnamthanamPlace = await Place.findOne({ name: 'Kunnamthanam' })
const adoorPlace = await Place.findOne({ name: 'Adoor' })
if (!kunnamthanamPlace || !adoorPlace) {
  throw new Error('Required places missing after seed')
}

const adminActor = { userId: null, role: 'admin' as const }

function makeComplaintInput(
  telegramUserId: string,
  description: string,
  placeId: CreateComplaintInput['placeId'],
  coords: [number, number],
): CreateComplaintInput {
  return {
    telegramUserId,
    originalDescription: description,
    language: 'English',
    aiDescription: 'AI structured description',
    category: 'Road Infrastructure',
    severity: 'High',
    photoUrl: null,
    district: null,
    placeId,
    latitude: coords[0],
    longitude: coords[1],
  }
}

const cA = await createComplaint(makeComplaintInput('tg_auth_a', 'Pothole on the Kunnamthanam main road.', kunnamthanamPlace._id, [9.43, 76.66]))
const cA2 = await createComplaint(makeComplaintInput('tg_auth_a2', 'Broken streetlight near Kunnamthanam.', kunnamthanamPlace._id, [9.44, 76.65]))
const cB = await createComplaint(makeComplaintInput('tg_auth_b', 'Drainage issue in Adoor town.', adoorPlace._id, [9.17, 76.73]))

await verifyComplaint(cA.complaintId, adminActor)
await assignComplaint(cA.complaintId, authorityA._id, adminActor)
await verifyComplaint(cA2.complaintId, adminActor)
await assignComplaint(cA2.complaintId, authorityA._id, adminActor)
await verifyComplaint(cB.complaintId, adminActor)
await assignComplaint(cB.complaintId, authorityB._id, adminActor)

const app = createApp()
const server = app.listen(5121)
const base = 'http://localhost:5121/api'

type Json = Record<string, unknown> | null

interface HttpResult {
  status: number
  data: Json
}

async function request(path: string, method: 'GET' | 'PATCH', body: unknown = null, token: string | null = null): Promise<HttpResult> {
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

console.log('\n=== Authority: login + scope ===')

const authLogin = await request('/auth/login', 'POST', { username: 'kunnamthanam_gp', password: 'DevTest@123' })
const admLogin = await request('/auth/login', 'POST', { username: 'admin', password: 'AdminTest@123' })
const tokenA = authLogin.data?.token as string
const tokenB = (await request('/auth/login', 'POST', { username: 'adoor_municipality', password: 'DevTest@123' })).data?.token as string
const tokenAdmin = admLogin.data?.token as string
check('authority A login returns correct authorityId', authLogin.status === 200 && (authLogin.data?.user as { authorityId: string }).authorityId === authorityA._id.toString())

const listA = await get('/authority/complaints', tokenA)
const listAIds = ((listA.data?.items as Array<{ complaintId: string }> | null) ?? []).map((item) => item.complaintId)
check('authority A sees only its own complaints', listA.status === 200 && listAIds.includes(cA.complaintId) && listAIds.includes(cA2.complaintId) && !listAIds.includes(cB.complaintId), `sees ${listAIds.length}`)
const listACodes = ((listA.data?.items as Array<{ authority: { code: string } | null }> | null) ?? []).every((item) => item.authority?.code === 'KNM-GP')
check('every listed item belongs to authority A', listACodes)

const listB = await get('/authority/complaints', tokenB)
const listBIds = ((listB.data?.items as Array<{ complaintId: string }> | null) ?? []).map((item) => item.complaintId)
check('authority B sees only B complaints (A isolated)', listBIds.includes(cB.complaintId) && !listBIds.includes(cA.complaintId))

const listFilter = await get('/authority/complaints?status=assigned', tokenA)
const filterAllAssigned = ((listFilter.data?.items as Array<{ status: string }> | null) ?? []).every((item) => item.status === 'assigned')
check('authority status filter works', listFilter.status === 200 && filterAllAssigned)

const listSearchOwn = await get(`/authority/complaints?search=${encodeURIComponent(cA.complaintId)}`, tokenA)
check('authority search matches own complaint', (listSearchOwn.data?.items as Array<{ complaintId: string }> | null)?.length === 1 && (listSearchOwn.data?.items as Array<{ complaintId: string }>)[0].complaintId === cA.complaintId)

const listSearchOther = await get(`/authority/complaints?search=${cB.complaintId}`, tokenA)
check('authority search cannot surface authority B complaint', (listSearchOther.data?.items as Array<unknown> | null)?.length === 0)

console.log('\n=== Authority: detail + isolation ===')

const detailOwn = await get(`/authority/complaints/${cA.complaintId}`, tokenA)
const detailOwnBody = detailOwn.data?.complaint as Record<string, unknown> | null
check('authority can view own complaint details', detailOwn.status === 200 && detailOwnBody?.originalDescription === 'Pothole on the Kunnamthanam main road.' && (detailOwnBody.place as { name: string } | null)?.name === 'Kunnamthanam')
check('authority detail has no audit data', (detailOwnBody?.audit as Array<unknown> | null)?.length === 0)
check('authority detail includes history + location', (detailOwnBody?.history as Array<unknown> | null)?.length >= 3 && (detailOwnBody.location as { latitude: number } | null)?.latitude === 9.43)

const detailOther = await get(`/authority/complaints/${cB.complaintId}`, tokenA)
check('authority A cannot view authority B complaint (404)', detailOther.status === 404)

const detailUnknown = await get('/authority/complaints/EN-2026-99999', tokenA)
check('unknown complaint returns 404', detailUnknown.status === 404)

console.log('\n=== Authority: status workflow ===')

const step1 = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'under_review', note: 'Inspection completed' }, tokenA)
check('assigned → under_review (200)', step1.status === 200 && step1.data?.status === 'under_review')
const cAState = await Complaint.findOne({ complaintId: cA.complaintId }).lean()
check('status persisted', cAState?.status === 'under_review')
const hist1 = await ComplaintHistory.find({ complaintId: cA._id }).sort({ createdAt: 1 }).lean()
check('history records assigned → under_review with note', hist1.some((entry) => entry.previousStatus === 'assigned' && entry.newStatus === 'under_review' && entry.note === 'Inspection completed' && entry.changedByRole === 'authority'))
const aud1 = await AuditLog.findOne({ action: 'UPDATE_COMPLAINT_STATUS', entityId: cA._id }).lean()
check('audit records authority UPDATE_COMPLAINT_STATUS', aud1 !== null && (aud1.metadata as { toStatus: string }).toStatus === 'under_review')

const jump = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'completed' }, tokenA)
check('under_review → completed directly rejected (409)', jump.status === 409)

const step2 = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'in_progress', note: 'Repair work started' }, tokenA)
check('under_review → in_progress (200)', step2.status === 200 && step2.data?.status === 'in_progress')

const step3 = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'completed', note: 'Work completed' }, tokenA)
check('in_progress → completed (200)', step3.status === 200 && step3.data?.status === 'completed')

const cACompleted = await Complaint.findOne({ complaintId: cA.complaintId }).lean()
check('completion stores completedAt', cACompleted?.completedAt instanceof Date || (cACompleted?.completedAt as unknown) !== null)
const authorityAUser = await User.findOne({ username: 'kunnamthanam_gp' }).lean()
check('completion stores completedBy (authority user)', cACompleted?.completedBy?.toString() === authorityAUser?._id.toString())
const hist2 = await ComplaintHistory.find({ complaintId: cA._id }).sort({ createdAt: 1 }).lean()
check('completion history records in_progress → completed', hist2.some((entry) => entry.previousStatus === 'in_progress' && entry.newStatus === 'completed'))
const aud2 = await AuditLog.findOne({ action: 'COMPLETE_COMPLAINT', entityId: cA._id }).lean()
check('audit records COMPLETE_COMPLAINT', aud2 !== null)

const backward1 = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'in_progress' }, tokenA)
check('completed → in_progress rejected (409)', backward1.status === 409)
const backward2 = await patch(`/authority/complaints/${cA.complaintId}/status`, { status: 'assigned' }, tokenA)
check('completed → assigned rejected (409)', backward2.status === 409)

const wrongOrder = await patch(`/authority/complaints/${cA2.complaintId}/status`, { status: 'completed' }, tokenA)
check('assigned → completed directly rejected (409)', wrongOrder.status === 409)
const wrongStatus = await patch(`/authority/complaints/${cA2.complaintId}/status`, { status: 'rejected' }, tokenA)
check('authority cannot reject (409)', wrongStatus.status === 409)
const badStatus = await patch(`/authority/complaints/${cA2.complaintId}/status`, { status: 'bogus' }, tokenA)
check('invalid status value rejected (400)', badStatus.status === 400)

const cA2Step = await patch(`/authority/complaints/${cA2.complaintId}/status`, { status: 'under_review', authorityId: authorityB._id.toString() }, tokenA)
check('client-supplied authorityId is ignored', cA2Step.status === 200 && (await Complaint.findOne({ complaintId: cA2.complaintId }).lean())?.authorityId?.toString() === authorityA._id.toString())

const statusOther = await patch(`/authority/complaints/${cB.complaintId}/status`, { status: 'under_review' }, tokenA)
check('authority A cannot change authority B complaint (404)', statusOther.status === 404)

console.log('\n=== Authority: admin actions unavailable ===')

const tryVerify = await patch(`/authority/complaints/${cA2.complaintId}/verify`, {}, tokenA)
const tryReject = await patch(`/authority/complaints/${cA2.complaintId}/reject`, {}, tokenA)
const tryAssign = await patch(`/authority/complaints/${cA2.complaintId}/assign`, { authorityId: authorityB._id.toString() }, tokenA)
const tryReassign = await patch(`/authority/complaints/${cA2.complaintId}/reassign`, { authorityId: authorityB._id.toString() }, tokenA)
check('authority cannot verify (no route, 404)', tryVerify.status === 404)
check('authority cannot reject as admin (no route, 404)', tryReject.status === 404)
check('authority cannot assign (no route, 404)', tryAssign.status === 404)
check('authority cannot reassign (no route, 404)', tryReassign.status === 404)

console.log('\n=== Authority: scoped stats ===')

const statsA = await get('/authority/stats', tokenA)
const statsABody = statsA.data?.stats as { totals: Record<string, number> } | null
check('stats total = only authority A complaints', statsABody !== null && statsABody.totals.total === 2, `total ${statsABody?.totals.total}`)
check('stats reflect completed count for A', statsABody !== null && statsABody.totals.completed === 1 && statsABody.totals.under_review === 1, JSON.stringify(statsABody?.totals))
check('stats exclude authority B complaints', statsABody !== null && statsABody.totals.total === (await Complaint.countDocuments({ authorityId: authorityA._id })))

const statsB = await get('/authority/stats', tokenB)
const statsBBody = statsB.data?.stats as { totals: Record<string, number> } | null
check('authority B stats do not include A complaints', statsBBody?.totals.total === 1)

console.log('\n=== Authority: security ===')

const noToken = await get('/authority/complaints')
check('authority endpoint without token → 401', noToken.status === 401)
const adminOnAuthority = await get('/authority/complaints', tokenAdmin)
check('admin token on authority endpoint → 403', adminOnAuthority.status === 403)
const authorityOnAdmin = await get('/admin/complaints', tokenA)
check('authority token on admin endpoint → 403', authorityOnAdmin.status === 403)

const responseText = JSON.stringify({ listA: listA.data, detailOwn: detailOwn.data, statsA: statsA.data })
check('no password/secret material leaks', !responseText.toLowerCase().includes('passwordhash') && !responseText.includes('JWT_SECRET'))

console.log('\n=== Regression ===')

const allIds = (await Complaint.find().lean()).map((complaint) => complaint.complaintId)
check('complaint IDs unique', new Set(allIds).size === allIds.length)
const citizenList = (await import('../src/services/complaint.service.js')).listComplaintsByCitizen
const mine = await citizenList('tg_auth_a')
check('Phase 4 my-complaints service still works', mine.length === 1 && mine[0].complaintId === cA.complaintId)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

server.close()
await disconnectDatabase()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)