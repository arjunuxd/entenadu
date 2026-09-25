process.env.PORT = '5110'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production'
process.env.SEED_ADMIN_NAME = 'Ente Nadu Admin'
process.env.SEED_ADMIN_USERNAME = 'admin'
process.env.SEED_ADMIN_PASSWORD = 'AdminTest@123'
process.env.SEED_DEV_PASSWORD = 'DevTest@123'

const { MongoMemoryServer } = await import('mongodb-memory-server')

const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('ente_nadu_auth_test')

const jwt = (await import('jsonwebtoken')).default
const { createApp } = await import('../src/app.js')
const { seedData } = await import('../src/seeds/seed.js')
const { seedAdmin } = await import('../src/seeds/seedAdmin.js')
const { seedAuthorityUsers } = await import('../src/seeds/seedUsers.js')
const { connectDatabase, disconnectDatabase } = await import('../src/config/db.js')
const { User, Authority } = await import('../src/models/index.js')
const { hashPassword } = await import('../src/services/auth.service.js')

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

const kunnamthanamAuthority = await Authority.findOne({ code: 'KNM-GP' })
if (!kunnamthanamAuthority) {
  throw new Error('Kunnamthanam authority not found after base seed')
}

const adminHash = await hashPassword('A separate direct hash for verification')
await User.create({ name: 'Inactive User', username: 'inactive_user', passwordHash: adminHash, role: 'authority', authorityId: null, isActive: false })

await seedAdmin()
await seedAuthorityUsers()

const app = createApp()
const server = app.listen(5110)
const base = 'http://localhost:5110/api'

type Json = Record<string, unknown> | null

interface HttpResult {
  status: number
  data: Json
}

async function request(path: string, method: 'GET' | 'POST', body: unknown = null, token: string | null = null): Promise<HttpResult> {
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

const post = (path: string, body: unknown, token?: string | null) => request(path, 'POST', body, token ?? null)
const get = (path: string, token?: string | null) => request(path, 'GET', null, token ?? null)

console.log('\n=== Authentication ===')

const adminLogin = await post('/auth/login', { username: 'admin', password: 'AdminTest@123' })
check('admin login returns 200', adminLogin.status === 200, `status ${adminLogin.status}`)
check('admin login returns a JWT', typeof adminLogin.data?.token === 'string' && adminLogin.data.token.length > 0)
check('admin user object correct', adminLogin.data?.user && (adminLogin.data.user as { role: string }).role === 'admin' && (adminLogin.data.user as { authorityId: unknown }).authorityId === null)
const adminBody = JSON.stringify(adminLogin.data)
check('no password fields returned', !adminBody.includes('passwordHash') && !adminBody.includes('"password"'), 'passwordHash/password absent')

const authorityLogin = await post('/auth/login', { username: 'kunnamthanam_gp', password: 'DevTest@123' })
check('authority login returns 200', authorityLogin.status === 200, `status ${authorityLogin.status}`)
check('authority role + correct authorityId', authorityLogin.data?.user && (authorityLogin.data.user as { role: string }).role === 'authority' && (authorityLogin.data.user as { authorityId: string }).authorityId === kunnamthanamAuthority._id.toString())

const badPassword = await post('/auth/login', { username: 'admin', password: 'WrongPass@999' })
check('wrong password rejected (401, generic)', badPassword.status === 401 && badPassword.data?.message === 'Invalid username or password')

const unknownUser = await post('/auth/login', { username: 'does_not_exist', password: 'Whatever@123' })
check('unknown username rejected (401, generic)', unknownUser.status === 401 && unknownUser.data?.message === 'Invalid username or password')

const malformed = await post('/auth/login', { username: 'admin' })
check('malformed body rejected (400)', malformed.status === 400)

const inactive = await post('/auth/login', { username: 'inactive_user', password: 'A separate direct hash for verification' })
check('inactive account rejected (401, generic)', inactive.status === 401 && inactive.data?.message === 'Invalid username or password')

console.log('\n=== JWT ===')

const adminToken = adminLogin.data?.token as string
const authorityToken = authorityLogin.data?.token as string

const decoded = jwt.decode(adminToken) as Record<string, unknown>
check(
  'JWT contains only necessary claims',
  JSON.stringify(Object.keys(decoded).sort()) === JSON.stringify(['authorityId', 'exp', 'iat', 'role', 'userId']),
  `keys: ${Object.keys(decoded).sort().join(',')}`,
)
check('JWT role/userId match', decoded.role === 'admin' && decoded.userId === (adminLogin.data?.user as { id: string }).id)

const missingToken = await get('/auth/me')
check('missing token rejected (401)', missingToken.status === 401)

const invalidToken = await get('/auth/me', 'garbage.token.value')
check('invalid token rejected (401)', invalidToken.status === 401)

const expiredToken = jwt.sign(
  { userId: (adminLogin.data?.user as { id: string }).id, role: 'admin', authorityId: null, exp: Math.floor(Date.now() / 1000) - 100 },
  process.env.JWT_SECRET!,
)
const expired = await get('/auth/me', expiredToken)
check('expired token rejected (401)', expired.status === 401)

const wrongSecretToken = jwt.sign(
  { userId: (adminLogin.data?.user as { id: string }).id, role: 'admin', authorityId: null },
  'completely-different-secret',
  { expiresIn: '1h' },
)
const wrongSecret = await get('/auth/me', wrongSecretToken)
check('wrong-secret token rejected (401)', wrongSecret.status === 401)

const me = await get('/auth/me', adminToken)
check('/api/auth/me works with valid JWT', me.status === 200 && me.data?.user && (me.data.user as { username: string }).username === 'admin')

const meAuthority = await get('/auth/me', authorityToken)
check('/api/auth/me returns authorityId for authority', meAuthority.data?.user && (meAuthority.data.user as { authorityId: string }).authorityId === kunnamthanamAuthority._id.toString())

console.log('\n=== Authorization ===')

const ptAdmin = await get('/auth/protected-test', adminToken)
const ptAuthority = await get('/auth/protected-test', authorityToken)
check('protected-test reachable by admin + authority', ptAdmin.status === 200 && ptAuthority.status === 200)

const atAdmin = await get('/auth/admin-test', adminToken)
const atAuthority = await get('/auth/admin-test', authorityToken)
check('admin can access admin-only endpoint', atAdmin.status === 200)
check('authority blocked from admin-only endpoint (403)', atAuthority.status === 403)

const autAuthority = await get('/auth/authority-test', authorityToken)
const autAdmin = await get('/auth/authority-test', adminToken)
check('authority can access authority-only endpoint', autAuthority.status === 200 && autAuthority.data?.authorityId === kunnamthanamAuthority._id.toString())
check('admin is not treated as an authority (403)', autAdmin.status === 403)

console.log('\n=== Security ===')

const adminDoc = await User.findOne({ username: 'admin' })
check('stored password is a bcrypt hash', adminDoc !== null && typeof adminDoc.passwordHash === 'string' && adminDoc.passwordHash.startsWith('$2') && adminDoc.passwordHash !== 'AdminTest@123')

const logout = await post('/auth/logout', {})
check('logout returns success', logout.status === 200 && logout.data?.success === true)

console.log('\n=== Seed idempotency ===')

const usersBefore = await User.countDocuments()
await seedAdmin()
await seedAuthorityUsers()
const usersAfter = await User.countDocuments()
check('seed:admin + seed:users do not create duplicates', usersAfter === usersBefore, `users ${usersBefore} → ${usersAfter}`)

console.log('\n=== Regression ===')

const health = await get('/health')
check('health endpoint works, DB connected', health.status === 200 && health.data?.status === 'ok' && health.data?.database === 'connected')

const totalAuthorities = await Authority.countDocuments()
const totalUsers = await User.countDocuments()
check('Phase 2 models still work (authorities intact)', totalAuthorities === 10, `authorities: ${totalAuthorities}, users: ${totalUsers}`)

console.log('\n=== Rate limiting ===')

let sawRateLimited = false
for (let i = 0; i < 21 && !sawRateLimited; i += 1) {
  const attempt = await post('/auth/login', { username: 'admin', password: 'WrongPass@999' })
  if (attempt.status === 429) sawRateLimited = true
}
check('login rate limiter blocks repeated failures (429)', sawRateLimited)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

server.close()
await disconnectDatabase()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)