process.env.PORT = '5122'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production'
process.env.SEED_ADMIN_NAME = 'Ente Nadu Admin'
process.env.SEED_ADMIN_USERNAME = 'admin'
process.env.SEED_ADMIN_PASSWORD = 'AdminTest@123'
process.env.SEED_DEV_PASSWORD = 'DevTest@123'

const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('ente_nadu_phase6_test')

const { spawnSync } = await import('node:child_process')
const fs = await import('node:fs')
const os = await import('node:os')
const path = await import('node:path')
const { fileURLToPath, pathToFileURL } = await import('node:url')

const { createApp } = await import('../src/app.js')
const { Authority, Complaint, ComplaintHistory, AuditLog, Place, User } = await import('../src/models/index.js')
const { seedData } = await import('../src/seeds/seed.js')
const { seedAdmin } = await import('../src/seeds/seedAdmin.js')
const { seedAuthorityUsers } = await import('../src/seeds/seedUsers.js')
const { connectDatabase, disconnectDatabase } = await import('../src/config/db.js')
const {
  assignComplaint,
  createComplaint,
  listComplaintsByCitizen,
  rejectComplaint,
  reassignComplaint,
  verifyComplaint,
} = await import('../src/services/complaint.service.js')
const {
  registerTelegramNotifier,
  telegramNotifierActive,
} = await import('../src/services/notification.service.js')
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

interface SentMessage {
  chatId: string | number
  text: string
}

const outbox: SentMessage[] = []
let failNextSend = false

registerTelegramNotifier({
  telegram: {
    sendMessage: async (chatId, text) => {
      if (failNextSend) {
        failNextSend = false
        throw new Error('telegram unreachable')
      }
      outbox.push({ chatId, text })
      return {}
    },
  },
})

const messagesTo = (chatId: string): SentMessage[] => outbox.filter((entry) => entry.chatId === chatId)
const lastMessageTo = (chatId: string): SentMessage | undefined => messagesTo(chatId).slice(-1)[0]

await connectDatabase()
await seedData()
await seedAdmin()
await seedAuthorityUsers()

check('fake notifier is registered', telegramNotifierActive())

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
  coords: [number, number] | [number | null, number | null],
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

const app = createApp()
const server = app.listen(5122)
const base = 'http://localhost:5122/api'

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

const login = async (username: string, password: string): Promise<HttpResult> =>
  request('/auth/login', 'POST', { username, password })

const tokenAdmin = (await login('admin', 'AdminTest@123')).data?.token as string
const tokenA = (await login('kunnamthanam_gp', 'DevTest@123')).data?.token as string
const tokenB = (await login('adoor_municipality', 'DevTest@123')).data?.token as string
check('Phase 2 logins still work', Boolean(tokenAdmin && tokenA && tokenB))

console.log('\n=== Phase 6: citizen Telegram notifications ===')

const c1 = await createComplaint(
  makeComplaintInput('tg_p6_a', 'Pothole on the Kunnamthanam main road.', kunnamthanamPlace._id, [9.43, 76.66]),
)
const submittedMsg = lastMessageTo('tg_p6_a')
check('complaint creation notifies citizen (submitted)', submittedMsg !== undefined && submittedMsg.text.includes(c1.complaintId) && submittedMsg.text.includes('Submitted'))
check('notification sent to citizen chat id', submittedMsg?.chatId === 'tg_p6_a')

const v1 = await request(`/admin/complaints/${c1.complaintId}/verify`, 'PATCH', {}, tokenAdmin)
check('admin verify succeeds', v1.status === 200 && v1.data?.status === 'verified')
check('verified notification sent', (lastMessageTo('tg_p6_a')?.text ?? '').includes('Verified'))

const a1 = await request(`/admin/complaints/${c1.complaintId}/assign`, 'PATCH', { authorityId: authorityA._id.toString() }, tokenAdmin)
const assignedMsg = lastMessageTo('tg_p6_a')
check('admin assign succeeds', a1.status === 200 && a1.data?.status === 'assigned')
check('assignment notification has complaint ID + authority name + status', assignedMsg !== undefined && assignedMsg.text.includes(c1.complaintId) && assignedMsg.text.includes(`Assigned to: ${authorityA.name}`) && assignedMsg.text.includes('Assigned'))
check('assignment notification has no internal /admin/ DB identifiers', assignedMsg !== undefined && !/24-hex|[0-9a-f]{24}/i.test(assignedMsg.text.replace(c1.complaintId, '')) && !assignedMsg.text.toLowerCase().includes('admin'))

const ur = await request(`/authority/complaints/${c1.complaintId}/status`, 'PATCH', { status: 'under_review', note: 'Inspection completed' }, tokenA)
check('assigned → under_review (200)', ur.status === 200 && ur.data?.status === 'under_review')
check('under_review notification sent', (lastMessageTo('tg_p6_a')?.text ?? '').includes('Under review'))

const ip = await request(`/authority/complaints/${c1.complaintId}/status`, 'PATCH', { status: 'in_progress', note: 'Repair work started' }, tokenA)
check('under_review → in_progress (200)', ip.status === 200 && ip.data?.status === 'in_progress')
check('in_progress notification sent', (lastMessageTo('tg_p6_a')?.text ?? '').includes('In progress'))

const done1 = await request(`/authority/complaints/${c1.complaintId}/status`, 'PATCH', { status: 'completed', note: 'Work completed' }, tokenA)
check('in_progress → completed (200)', done1.status === 200 && done1.data?.status === 'completed')
check('completed notification sent', (lastMessageTo('tg_p6_a')?.text ?? '').includes('Completed'))
check('exactly 6 notifications for full lifecycle', messagesTo('tg_p6_a').length === 6, `count ${messagesTo('tg_p6_a').length}`)

const c1State = await Complaint.findOne({ complaintId: c1.complaintId }).lean()
check('history + audit exist for every transition', (await ComplaintHistory.countDocuments({ complaintId: c1State?._id })) === 6 && (await AuditLog.countDocuments({ entityType: 'Complaint', entityId: c1State?._id })) === 6)

console.log('\n=== Phase 6: rejection with reason ===')

const c2 = await createComplaint(
  makeComplaintInput('tg_p6_b', 'Garbage dumped near Adoor bus stand.', adoorPlace._id, [9.17, 76.73]),
)
const rj = await request(`/admin/complaints/${c2.complaintId}/reject`, 'PATCH', { note: 'Duplicate entry' }, tokenAdmin)
check('admin reject succeeds', rj.status === 200 && rj.data?.status === 'rejected')
const rejectedMsg = lastMessageTo('tg_p6_b')
check('rejection notification includes reason', rejectedMsg !== undefined && rejectedMsg.text.includes('Rejected') && rejectedMsg.text.includes('Reason: Duplicate entry'))
check('rejected complaint is terminal', (await request(`/authority/complaints/${c2.complaintId}/status`, 'PATCH', { status: 'under_review' }, tokenA)).status === 404)

console.log('\n=== Phase 6: reassignment notification (new authority) ===')

const c3 = await createComplaint(
  makeComplaintInput('tg_p6_c', 'Broken streetlight on Adoor main road.', adoorPlace._id, [9.17, 76.73]),
)
await verifyComplaint(c3.complaintId, adminActor)
await assignComplaint(c3.complaintId, authorityB._id, adminActor)
const assignToBMsg = lastMessageTo('tg_p6_c')
check('assigned to B notified with B name', assignToBMsg?.text.includes(`Assigned to: ${authorityB.name}`) ?? false)
await reassignComplaint(c3.complaintId, authorityA._id, adminActor)
const reassignToAMsg = lastMessageTo('tg_p6_c')
check('reassigned to A notified with A name', reassignToAMsg?.text.includes(`Assigned to: ${authorityA.name}`) ?? false)
check('reassignment notification avoids admin identifiers', (reassignToAMsg?.text.toLowerCase().includes('admin') ?? false) === false)

console.log('\n=== Phase 6: notification failure never undoes the DB ===')

failNextSend = true
const c4 = await createComplaint(
  makeComplaintInput('tg_p6_d', 'Water supply issue near Kunnamthanam.', kunnamthanamPlace._id, [9.43, 76.66]),
)
check('create survives notification failure', (await Complaint.findOne({ complaintId: c4.complaintId }).lean())?.status === 'submitted')

failNextSend = true
await verifyComplaint(c4.complaintId, adminActor)
check('verify survives notification failure (DB committed)', (await Complaint.findOne({ complaintId: c4.complaintId }).lean())?.status === 'verified')
check('history written despite notify failure', (await ComplaintHistory.countDocuments({ complaintId: c4._id })) === 2)

failNextSend = true
await assignComplaint(c4.complaintId, authorityA._id, adminActor)
check('assign survives notification failure (DB committed)', (await Complaint.findOne({ complaintId: c4.complaintId }).lean())?.status === 'assigned')

console.log('\n=== Phase 6: workflow hardening ===')

const c5 = await createComplaint(
  makeComplaintInput('tg_p6_e', 'Drain overflow in Adoor town.', adoorPlace._id, [9.17, 76.73]),
)
await verifyComplaint(c5.complaintId, adminActor)
await assignComplaint(c5.complaintId, authorityB._id, adminActor)

const jumpToComplete = await request(`/authority/complaints/${c3.complaintId}/status`, 'PATCH', { status: 'completed' }, tokenA)
check('skipped transition rejected (409)', jumpToComplete.status === 409)
const wrongStatus = await request(`/authority/complaints/${c3.complaintId}/status`, 'PATCH', { status: 'rejected' }, tokenA)
check('authority cannot reject (409)', wrongStatus.status === 409)
const bogusStatus = await request(`/authority/complaints/${c3.complaintId}/status`, 'PATCH', { status: 'bogus' }, tokenA)
check('invalid status value rejected (400)', bogusStatus.status === 400)
const completedAgain = await request(`/authority/complaints/${c1.complaintId}/status`, 'PATCH', { status: 'in_progress' }, tokenA)
check('terminal completed cannot regress (409)', completedAgain.status === 409)

const statusOther = await request(`/authority/complaints/${c5.complaintId}/status`, 'PATCH', { status: 'under_review' }, tokenA)
check('authority A cannot advance authority B complaint (404)', statusOther.status === 404)
check('B complaint unchanged after A attempt', (await Complaint.findOne({ complaintId: c5.complaintId }).lean())?.status === 'assigned')
check('no notification leaked for other-authority attempt', messagesTo('tg_p6_e').length === 3, `count ${messagesTo('tg_p6_e').length}`)

const adminOnAuthority = await request('/authority/complaints', 'GET', null, tokenAdmin)
check('admin token on authority endpoint → 403', adminOnAuthority.status === 403)
const authorityOnAdmin = await request('/admin/complaints', 'GET', null, tokenA)
check('authority token on admin endpoint → 403', authorityOnAdmin.status === 403)
check('authority cannot admin-verify (route 404)', (await request(`/authority/complaints/${c3.complaintId}/verify`, 'PATCH', {}, tokenA)).status === 404)

console.log('\n=== Phase 6: admin authority-account management ===')

const usersList = await request('/admin/authority-users', 'GET', null, tokenAdmin)
const users = (usersList.data?.users as Array<Record<string, unknown>> | null) ?? []
const kunnamthanamUser = users.find((user) => user.username === 'kunnamthanam_gp') as Record<string, unknown> | undefined
check('admin lists authority accounts', usersList.status === 200 && kunnamthanamUser !== undefined)
check('authority accounts list links correct authority', (kunnamthanamUser?.authority as { name: string } | null)?.name === 'Kunnamthanam Grama Panchayat')
check('no passwordHash in authority accounts list', !JSON.stringify(usersList.data).toLowerCase().includes('passwordhash'))

const deactivate = await request(
  `/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`,
  'PATCH',
  { isActive: false },
  tokenAdmin,
)
check('admin deactivates authority account', deactivate.status === 200 && (deactivate.data?.user as { isActive: boolean }).isActive === false)
check('deactivated account cannot log in', (await login('kunnamthanam_gp', 'DevTest@123')).status === 401)

const reactivate = await request(
  `/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`,
  'PATCH',
  { isActive: true },
  tokenAdmin,
)
check('admin reactivates authority account', reactivate.status === 200 && (reactivate.data?.user as { isActive: boolean }).isActive === true)
check('reactivated account logs in again', (await login('kunnamthanam_gp', 'DevTest@123')).status === 200)

const relink = await request(
  `/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`,
  'PATCH',
  { authorityId: authorityB._id.toString() },
  tokenAdmin,
)
check('admin relinks authority user to B', relink.status === 200 && (relink.data?.user as { authority: { code: string } }).authority.code === 'ADOR-MUN')
const relinkedLogin = await login('kunnamthanam_gp', 'DevTest@123')
check('JWT carries the new linked authorityId', (relinkedLogin.data?.user as { authorityId: string } | undefined)?.authorityId === authorityB._id.toString())
await request(`/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`, 'PATCH', { authorityId: authorityA._id.toString() }, tokenAdmin)
check('authority user relinked back', (await login('kunnamthanam_gp', 'DevTest@123')).data?.user !== null)

const badIsActive = await request(`/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`, 'PATCH', { isActive: 'yes' }, tokenAdmin)
check('non-boolean isActive rejected (400)', badIsActive.status === 400)
check('invalid authorityId rejected (400)', (await request(`/admin/authority-users/${(kunnamthanamUser?.id as string)}/access`, 'PATCH', { authorityId: 'not-an-id' }, tokenAdmin)).status === 400)
check('unknown user id → 404', (await request('/admin/authority-users/000000000000000000000000/access', 'PATCH', { isActive: true }, tokenAdmin)).status === 404)
const adminUser = await User.findOne({ username: 'admin' }).lean()
check('admin account cannot be managed via this endpoint (400)', (await request(`/admin/authority-users/${adminUser?._id.toString()}/access`, 'PATCH', { isActive: true }, tokenAdmin)).status === 400)
check('authority-users requires admin token (401)', (await request('/admin/authority-users', 'GET')).status === 401)
check('authority token cannot manage accounts (403)', (await request('/admin/authority-users', 'GET', null, tokenA)).status === 403)

console.log('\n=== Phase 6: geolocation ===')

const g1 = await createComplaint(
  makeComplaintInput('tg_p6_gps', 'Issue reported via GPS only.', null, [25.2048, 55.2708]),
)
check('GPS-only complaint keeps lat/lng', g1.latitude === 25.2048 && g1.longitude === 55.2708)
check('GPS-only complaint stays pending (no authority decided by Gemini)', g1.authorityId === null && g1.placeId === null)

let invalidCoordsRejected = false
try {
  await createComplaint(makeComplaintInput('tg_p6_bad', 'Bad coords.', null, [95, 76.66]))
} catch (error) {
  invalidCoordsRejected = (error as { statusCode?: number }).statusCode === 400
}
check('out-of-range latitude rejected (400)', invalidCoordsRejected)

let partialCoordsRejected = false
try {
  await createComplaint(makeComplaintInput('tg_p6_part', 'Half coords.', null, [9.43, null]))
} catch (error) {
  partialCoordsRejected = (error as { statusCode?: number }).statusCode === 400
}
check('half specified coordinates rejected (400)', partialCoordsRejected)

const resolvedViaDb = await createComplaint(
  makeComplaintInput('tg_p6_db', 'Issue near Kunnamthanam junction.', kunnamthanamPlace._id, [9.43, 76.66]),
)
check('placeId still routes through the DB to the local body', resolvedViaDb.authorityId?.toString() === authorityA._id.toString())

console.log('\n=== Phase 6: input validation + request hardening ===')

const bigBody = 'x'.repeat(2 * 1024 * 1024)
const oversized = await request('/auth/login', 'POST', bigBody)
check('oversized request body rejected (413)', oversized.status === 413)
const malformed = await request('/auth/login', 'POST', '{invalid json')
check('malformed JSON rejected (400)', malformed.status === 400)
check('unknown complaint id → 404', (await request(`/admin/complaints/EN-2026-99999/verify`, 'PATCH', {}, tokenAdmin)).status === 404)

const secretScan = JSON.stringify({
  usersList: usersList.data,
  adminList: (await request('/admin/complaints', 'GET', null, tokenAdmin)).data,
  authorityList: (await request('/authority/complaints', 'GET', null, tokenA)).data,
})
check('no password/secret material leaks from any API', !secretScan.toLowerCase().includes('passwordhash') && !secretScan.includes('JWT_SECRET'))

console.log('\n=== Phase 6: production configuration ===')

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envModuleUrl = pathToFileURL(path.join(backendRoot, 'src', 'config', 'env.ts')).href
const probePath = path.join(os.tmpdir(), `ente-nadu-prod-env-probe-${process.pid}.mts`)
fs.writeFileSync(
  probePath,
  `import { assertProductionEnv } from ${JSON.stringify(envModuleUrl)}\ntry { await assertProductionEnv(); console.log('NO_THROW') } catch (e) { console.log('THREW') }\n`,
  'utf8',
)

const REQUIRED_ENV_KEYS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'GEMINI_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]

function resolveTsxBinary(): string | null {
  const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  let dir = backendRoot
  while (true) {
    const candidate = path.join(dir, 'node_modules', '.bin', binName)
    if (fs.existsSync(candidate)) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

function runProdProbe(fillAll: boolean): { status: number | null; stdout: string } {
  const childEnv: Record<string, string | undefined> = { ...(process.env as Record<string, string>) }
  childEnv.NODE_ENV = 'production'
  for (const key of REQUIRED_ENV_KEYS) {
    childEnv[key] = fillAll ? 'present' : ''
  }
  const tsxBin = resolveTsxBinary()
  if (!tsxBin) {
    return { status: null, stdout: 'TSX_BINARY_NOT_FOUND' }
  }
  const child = spawnSync(`"${tsxBin}" "${probePath}"`, {
    cwd: path.dirname(probePath),
    env: childEnv,
    encoding: 'utf8',
    shell: true,
    timeout: 60_000,
  })
  return { status: child.status, stdout: child.stdout ?? '' }
}

const missingProbe = runProdProbe(false)
check('production fails fast when required env vars are missing', missingProbe.status === 0 && missingProbe.stdout.includes('THREW'), (missingProbe.stdout.match(/THREW|NO_THROW/g) ?? []).join(','))
const filledProbe = runProdProbe(true)
check('production check passes when all required env vars present', filledProbe.status === 0 && filledProbe.stdout.includes('NO_THROW'))

try {
  fs.unlinkSync(probePath)
} catch {
  // Best-effort cleanup.
}

console.log('\n=== Phase 6: regression ===')

const mine = await listComplaintsByCitizen('tg_p6_a')
check('Phase 4 citizen my-complaints still works', mine.length === 1 && mine[0].complaintId === c1.complaintId)
const allIds = (await Complaint.find().lean()).map((complaint) => complaint.complaintId)
check('complaint IDs unique', new Set(allIds).size === allIds.length)
const adminStats = await request('/admin/stats', 'GET', null, tokenAdmin)
const totals = (adminStats.data?.stats as { totals: Record<string, number> } | null)?.totals
check('Phase 5 admin stats still work', adminStats.status === 200 && totals !== null && totals.completed === 1 && totals.rejected === 1)

const envCheck = await request('/health', 'GET')
check('health endpoint works, DB connected', envCheck.status === 200 && (envCheck.data as { database?: string }).database === 'connected')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

server.close()
await disconnectDatabase()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)