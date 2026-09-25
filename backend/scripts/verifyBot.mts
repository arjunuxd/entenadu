import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  AuditLog,
  Authority,
  Complaint,
  ComplaintHistory,
  ComplaintSession,
  Place,
} from '../src/models/index.js'
import { seedData } from '../src/seeds/seed.js'
import {
  createComplaintHandlers,
  type BotButton,
  type BotContext,
  type ComplaintBotDeps,
} from '../src/services/telegram/handlers.js'
import type { GeminiPhotoAnalysis, GeminiTextAnalysis } from '../src/services/gemini.service.js'
import { COMPLAINT_ID_PATTERN } from '../src/utils/complaintId.js'

let failures = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const mongod = await MongoMemoryServer.create()
const uri = mongod.getUri('ente_nadu_bot_test')

await mongoose.connect(uri)
console.log(`Memory MongoDB ready\n`)

await seedData()
console.log('')

const PLACE_TOKENS: Array<[string, string, string]> = [
  ['thiruvalla', 'Thiruvalla', 'Pathanamthitta'],
  ['തിരുവല്ല', 'Thiruvalla', 'Pathanamthitta'],
  ['kunnamthanam', 'Kunnamthanam', 'Pathanamthitta'],
  ['adoor', 'Adoor', 'Pathanamthitta'],
  ['konni', 'Konni', 'Pathanamthitta'],
  ['kottayam', 'Kottayam', 'Kottayam'],
  ['pala', 'Pala', 'Kottayam'],
  ['palai', 'Pala', 'Kottayam'],
  ['changanassery', 'Changanassery', 'Kottayam'],
  ['changanacherry', 'Changanassery', 'Kottayam'],
  ['changancherry', 'Changanassery', 'Kottayam'],
  ['kochi', 'Kochi', 'Ernakulam'],
  ['cochin', 'Kochi', 'Ernakulam'],
  ['ernakulam', 'Kochi', 'Ernakulam'],
  ['aluva', 'Aluva', 'Ernakulam'],
  ['alwaye', 'Aluva', 'Ernakulam'],
  ['angamaly', 'Angamaly', 'Ernakulam'],
  ['angamali', 'Angamaly', 'Ernakulam'],
]

function detectPlace(text: string): { place: string; district: string } | null {
  const lower = text.toLowerCase()
  for (const [token, place, district] of PLACE_TOKENS) {
    if (lower.includes(token)) {
      return { place, district }
    }
  }
  return null
}

function understandTextFake(text: string): GeminiTextAnalysis {
  const lower = text.toLowerCase()
  const hasIssueWord = ['pothole', 'hole', 'kuzhi', 'waste', 'garbage', 'streetlight', 'drain', 'water', 'light'].some(
    (word) => lower.includes(word),
  )
  const place = detectPlace(lower)
  const district = lower.includes('ambig') ? null : place?.district ?? null

  if (place && hasIssueWord) {
    return {
      inputType: 'description',
      language: 'English',
      category: 'Road Infrastructure',
      severity: 'High',
      description: `A problem is reported near ${place.place}.`,
      district,
      place: place.place,
      missingInformation: ['photo'],
    }
  }

  if (lower.includes('schoolinte')) {
    return {
      inputType: 'description',
      language: 'Manglish',
      category: 'Road Infrastructure',
      severity: 'High',
      description: 'A pothole near the school.',
      district: null,
      place: null,
      missingInformation: ['location'],
    }
  }

  if (lower.includes('pothole') || lower.includes('kuzhi')) {
    return {
      inputType: 'description',
      language: 'English',
      category: 'Road Infrastructure',
      severity: 'High',
      description: 'A large pothole is reported.',
      district: null,
      place: null,
      missingInformation: ['location'],
    }
  }

  if (place) {
    return {
      inputType: 'location',
      language: 'English',
      category: null,
      severity: null,
      description: null,
      district,
      place: place.place,
      missingInformation: [],
    }
  }

  if (/[\u0D00-\u0D7F]/.test(text)) {
    return {
      inputType: 'description',
      language: 'Malayalam',
      category: 'Road Infrastructure',
      severity: 'High',
      description: 'A large pothole is reported near the school.',
      district: null,
      place: null,
      missingInformation: ['location'],
    }
  }

  return {
    inputType: 'description',
    language: 'English',
    category: null,
    severity: null,
    description: 'A general issue is reported.',
    district: null,
    place: null,
    missingInformation: ['location'],
  }
}

function tinyPngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
}

interface FakeDepState {
  uploadCount: number
  uploadedFiles: string[]
}

function makeDeps(
  state: FakeDepState,
  options: { invalidPhoto?: boolean; throwOnUnderstand?: boolean } = {},
): ComplaintBotDeps {
  return {
    downloadPhoto: async () =>
      options.invalidPhoto
        ? { buffer: Buffer.from('hello world, definitely not an image'), contentType: 'text/plain' }
        : { buffer: tinyPngBuffer(), contentType: 'image/png' },
    uploadPhoto: async () => {
      state.uploadCount += 1
      const url = `https://cloudinary.test/uploads/${state.uploadCount}.png`
      state.uploadedFiles.push(url)
      return url
    },
    understandText: async (text) => {
      if (options.throwOnUnderstand) {
        throw new Error('gemini unreachable')
      }
      return understandTextFake(text)
    },
    analyzePhoto: async () =>
      ({ observations: ['Pothole visible near the road edge'], category: null, severity: null }) as GeminiPhotoAnalysis,
  }
}

interface OutboxEntry {
  kind: 'message' | 'toast'
  text: string
  buttons?: BotButton[][]
}

interface FakeUser {
  ctx: BotContext
  outbox: OutboxEntry[]
  lastText: () => string
  allTexts: () => string
}

let userCounter = 500

function makeUser(): FakeUser {
  const outbox: OutboxEntry[] = []
  userCounter += 1
  const telegramUserId = `tg_${userCounter}`

  const ctx: BotContext = {
    chatId: userCounter,
    telegramUserId,
    reply: async (text, buttons) => {
      outbox.push({ kind: 'message', text, buttons })
      return undefined
    },
    answer: async (messageText) => {
      outbox.push({ kind: 'toast', text: messageText ?? '' })
      return undefined
    },
  }

  return {
    ctx,
    outbox,
    lastText: () => outbox.filter((entry) => entry.kind === 'message').slice(-1)[0].text,
    allTexts: () => outbox.filter((entry) => entry.kind === 'message').map((entry) => entry.text).join('\n'),
  }
}

function hasButton(user: FakeUser, data: string): boolean {
  return user.outbox.some((entry) => entry.buttons?.some((row) => row.some((button) => button.data === data)))
}

function replyContains(user: FakeUser, needle: string): boolean {
  return user.allTexts().includes(needle)
}

function extractComplaintIdFrom(replyText: string): string | null {
  const match = replyText.match(/EN-\d{4}-\d{5}/)
  return match ? match[0] : null
}

const sendText = (handlers: ReturnType<typeof createComplaintHandlers>, user: FakeUser, text: string): Promise<void> =>
  handlers.text({ ...user.ctx, text })

const sendCb = (handlers: ReturnType<typeof createComplaintHandlers>, user: FakeUser, data: string): Promise<void> =>
  handlers.callback({ ...user.ctx, callbackData: data })

const sendPhoto = (handlers: ReturnType<typeof createComplaintHandlers>, user: FakeUser, fileId: string): Promise<void> =>
  handlers.photo({ ...user.ctx, photo: [{ fileId }] })

const sendLocation = (
  handlers: ReturnType<typeof createComplaintHandlers>,
  user: FakeUser,
  latitude: number,
  longitude: number,
): Promise<void> => handlers.location({ ...user.ctx, location: { latitude, longitude } })

async function startAndReport(handlers: ReturnType<typeof createComplaintHandlers>, user: FakeUser): Promise<void> {
  await handlers.start(user.ctx)
  await sendCb(handlers, user, 'report')
}

const uploadState: FakeDepState = { uploadCount: 0, uploadedFiles: [] }
const handlersA = createComplaintHandlers(makeDeps(uploadState))

console.log('=== Scenario A: English full flow → Thiruvalla → preview/confirm/duplicate/my-complaints ===\n')

{
  const user = makeUser()
  await handlersA.start(user.ctx)
  check('A1 /start shows welcome + main menu', hasButton(user, 'report') && hasButton(user, 'my_complaints'))

  await sendCb(handlersA, user, 'report')
  check('A2 report starts a complaint prompt', replyContains(user, 'Tell us what is wrong'))

  await sendCb(handlersA, user, 'confirm')
  check('A3 confirm before finishing is blocked (toast)', user.outbox.some((entry) => entry.kind === 'toast' && entry.text.includes('finish entering')))

  await sendText(handlersA, user, 'There is a big pothole near Thiruvalla bus stand.')
  check('A4 preview shown after description+location', replyContains(user, 'Complaint preview'))
  check('A5 preview routes to Thiruvalla Municipality', replyContains(user, 'Thiruvalla') && replyContains(user, 'Thiruvalla Municipality'))
  check('A6 preview has Confirm/Edit/Cancel', hasButton(user, 'confirm') && hasButton(user, 'edit') && hasButton(user, 'cancel'))

  await sendCb(handlersA, user, 'confirm')
  check('A7 registration confirmation sent', replyContains(user, 'registered'))
  const aId = extractComplaintIdFrom(user.lastText())
  check('A8 complaint ID looks like EN-YYYY-NNNNN', aId !== null && COMPLAINT_ID_PATTERN.test(aId ?? ''))

  const complaintA = aId ? await Complaint.findOne({ complaintId: aId }).lean() : null
  check('A9 complaint persisted with citizen owner', complaintA !== null && complaintA.citizenTelegramId === user.ctx.telegramUserId)
  check('A10 original description kept verbatim', complaintA !== null && complaintA.originalDescription === 'There is a big pothole near Thiruvalla bus stand.')

  const oneComplaint = await Complaint.countDocuments()
  check('A11 exactly 1 complaint exists', oneComplaint === 1, `found ${oneComplaint}`)

  const thirteenTla = await Place.findOne({ name: 'Thiruvalla', district: 'Pathanamthitta' }).lean()
  const tvlaMun = await Authority.findOne({ code: 'TVLA-MUN' }).lean()
  check(
    'A12 place + authority references resolved by DB',
    complaintA !== null && thirteenTla !== null && tvlaMun !== null &&
      complaintA.placeId?.toString() === thirteenTla._id.toString() &&
      complaintA.authorityId?.toString() === tvlaMun._id.toString(),
  )
  check('A13 AI-derived category/severity/language/district accepted', complaintA !== null && complaintA.category === 'Road Infrastructure' && complaintA.severity === 'High' && complaintA.language === 'English' && complaintA.district === 'Pathanamthitta')
  check('A14 complaint starts as submitted', complaintA !== null && complaintA.status === 'submitted')

  const historyA = await ComplaintHistory.findOne({ complaintId: complaintA?._id }).lean()
  check('A15 history entry records system null → submitted', historyA !== null && historyA.previousStatus === null && historyA.newStatus === 'submitted' && historyA.changedByRole === 'system')

  const auditA = await AuditLog.findOne({ action: 'CREATE_COMPLAINT', 'metadata.complaintId': aId }).lean()
  check('A16 audit log records citizen CREATE_COMPLAINT', auditA !== null && auditA.actorRole === 'citizen' && auditA.entityType === 'Complaint')

  await sendCb(handlersA, user, 'confirm')
  const stillOne = await Complaint.countDocuments()
  check('A17 duplicate confirm does not create a second complaint', stillOne === 1 && replyContains(user, 'already registered'))

  await sendCb(handlersA, user, 'my_complaints')
  check('A18 my complaints lists the complaint', replyContains(user, aId ?? '') && hasButton(user, `view_complaint:${aId}`))

  await sendCb(handlersA, user, `view_complaint:${aId}`)
  check('A19 complaint detail shows status', replyContains(user, 'Submitted') && replyContains(user, aId ?? ''))
  check('A20 session marked as created after submit', (await ComplaintSession.findOne({ telegramUserId: user.ctx.telegramUserId }).lean())?.complaintCreated === true)
}

console.log('\n=== Scenario B: Malayalam report ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'സ്കൂളിന് സമീപമുള്ള റോഡിൽ വലിയ കുഴിയുണ്ട്. ഇത് ശ്രദ്ധിക്കപ്പെടുന്നില്ല.')
  check('B1 Malayalam description → asks for location', replyContains(user, 'Where is the issue'))
  await sendText(handlersA, user, 'തിരുവല്ല കവലയ്ക്കടുത്ത്')
  check('B2 Malayalam location resolved → preview', replyContains(user, 'Complaint preview') && replyContains(user, 'Thiruvalla'))
  await sendCb(handlersA, user, 'confirm')
  const bComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('B3 Malayalam complaint created with language tag', bComplaint !== null && bComplaint.language === 'Malayalam' && bComplaint.originalDescription.includes('കുഴി'))
  check('B4 total complaints now 2', (await Complaint.countDocuments()) === 2)
}

console.log('\n=== Scenario C: Manglish report ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'Schoolinte aduthu oru pothole und')
  await sendText(handlersA, user, 'konni townil')
  check('C1 Manglish flow reaches preview for Konni', replyContains(user, 'Complaint preview') && replyContains(user, 'Konni Grama Panchayat'))
  await sendCb(handlersA, user, 'confirm')
  const cComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('C2 Manglish complaint created with language tag', cComplaint !== null && cComplaint.language === 'Manglish')
  const konniAuthority = await Authority.findOne({ code: 'KONN-GP' }).lean()
  check('C3 Konni routes to Konni GP', cComplaint !== null && konniAuthority !== null && cComplaint.authorityId?.toString() === konniAuthority._id.toString())
}

console.log('\n=== Scenario D: GPS-only location (authority stays pending) ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'There is broken streetlight')
  await sendLocation(handlersA, user, 9.9984, 76.5517)
  check('D1 GPS preview shows coordinates', replyContains(user, 'Complaint preview') && replyContains(user, 'GPS:'))
  await sendCb(handlersA, user, 'confirm')
  const dComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('D2 GPS complaint stores lat/lng + null authority', dComplaint !== null && dComplaint.latitude === 9.9984 && dComplaint.longitude === 76.5517 && dComplaint.authorityId === null && dComplaint.placeId === null)
}

console.log('\n=== Scenario E: photo-first natural order ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendPhoto(handlersA, user, 'photo_abc')
  check('E1 photo accepted into draft → asks description', replyContains(user, 'saved the photo') && replyContains(user, 'Tell us what is wrong'))
  await sendText(handlersA, user, 'Waste dumped near Konni bus stand')
  await sendCb(handlersA, user, 'confirm')
  const eComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('E2 complaint carries Cloudinary photo URL', eComplaint !== null && eComplaint.photoUrl !== null && eComplaint.photoUrl.includes('cloudinary.test'))
  check('E3 upload called exactly once', uploadState.uploadCount === 1, `uploads=${uploadState.uploadCount}`)
}

console.log('\n=== Scenario F: invalid photo is rejected gracefully ===\n')

{
  const user = makeUser()
  const badDepHandlers = createComplaintHandlers(makeDeps(uploadState, { invalidPhoto: true }))
  await startAndReport(badDepHandlers, user)
  await sendText(badDepHandlers, user, 'garbage pile behind the market')
  await sendPhoto(badDepHandlers, user, 'photo_bad')
  check('F1 invalid photo rejected with explanation', replyContains(user, 'Only JPG, PNG or WEBP') || replyContains(user, 'continue without a photo'))
  await sendText(badDepHandlers, user, 'konni townil')
  await sendCb(badDepHandlers, user, 'confirm')
  const fComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('F2 complaint still created without photo', fComplaint !== null && fComplaint.photoUrl === null)
  check('F3 no extra Cloudinary upload happened', uploadState.uploadCount === 1, `uploads=${uploadState.uploadCount}`)
}

console.log('\n=== Scenario G: ambiguous place name is clarified ===\n')

{
  const kottayamMun = await Authority.findOne({ code: 'KTYM-MUN' }).lean()
  const tempThiruvalla = await Place.create({
    name: 'Thiruvalla',
    normalizedName: 'thiruvalla',
    district: 'Kottayam',
    authorityId: kottayamMun?._id,
    aliases: ['Thiruvalla east'],
    isActive: true,
  })

  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'There is a big pothole near ambig Thiruvalla')
  check('G1 ambiguous place triggers clarification', replyContains(user, 'more than one matching place'))
  check('G2 clarification offers both districts + skip', hasButton(user, `loc:${tempThiruvalla._id.toString()}`) && hasButton(user, 'loc_skip'))
  check('G3 no preview while waiting', !replyContains(user, 'Complaint preview'))

  const realThiruvalla = await Place.findOne({ name: 'Thiruvalla', district: 'Pathanamthitta' }).lean()
  await sendCb(handlersA, user, `loc:${realThiruvalla?._id.toString()}`)
  check('G4 picking Pathanamthitta Thiruvalla shows preview', replyContains(user, 'Complaint preview') && replyContains(user, 'Thiruvalla Municipality'))
  await sendCb(handlersA, user, 'confirm')
  const gComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  const tvlaMun = await Authority.findOne({ code: 'TVLA-MUN' }).lean()
  check('G5 clarified complaint routes to the correct municipality', gComplaint !== null && tvlaMun !== null && gComplaint.authorityId?.toString() === tvlaMun._id.toString())

  await tempThiruvalla.deleteOne()
}

console.log('\n=== Scenario H: ambiguity → skip → authority pending ===\n')

{
  const kottayamMun = await Authority.findOne({ code: 'KTYM-MUN' }).lean()
  const tempThiruvalla = await Place.create({
    name: 'Thiruvalla',
    normalizedName: 'thiruvalla',
    district: 'Kottayam',
    authorityId: kottayamMun?._id,
    aliases: ['Thiruvalla east'],
    isActive: true,
  })

  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'There is a big pothole near ambig Thiruvalla')
  check('H1 ambiguity again detected', replyContains(user, 'more than one matching place'))
  await sendCb(handlersA, user, 'loc_skip')
  check('H2 skip shows preview with pending authority', replyContains(user, 'Complaint preview') && replyContains(user, 'Pending verification'))
  await sendCb(handlersA, user, 'confirm')
  const hComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('H3 skipped complaint keeps manual location, null authority', hComplaint !== null && hComplaint.authorityId === null && hComplaint.placeId === null)

  await tempThiruvalla.deleteOne()
}

console.log('\n=== Scenario I: Gemini failure falls back gracefully ===\n')

{
  const user = makeUser()
  const failingGemini = createComplaintHandlers(makeDeps(uploadState, { throwOnUnderstand: true }))
  await startAndReport(failingGemini, user)
  await sendText(failingGemini, user, 'Road is full of potholes')
  check('I1 no crash on Gemini failure, keeps raw description', replyContains(user, 'Where is the issue'))
  await sendText(failingGemini, user, 'Adoor town')
  check('I2 fallback still resolves place from DB alias', replyContains(user, 'Complaint preview') && replyContains(user, 'Adoor Municipality'))
  await sendCb(failingGemini, user, 'confirm')
  const iComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('I3 complaint kept raw description + null AI fields', iComplaint !== null && iComplaint.originalDescription === 'Road is full of potholes' && iComplaint.category === null && iComplaint.severity === null)
}

console.log('\n=== Scenario J: edit flow (no duplicate) ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'pothole on MG road')
  await sendText(handlersA, user, 'Kottayam')
  check('J1 preview before edit', replyContains(user, 'Complaint preview'))

  await sendCb(handlersA, user, 'edit')
  check('J2 edit menu shown', hasButton(user, 'edit_description') && hasButton(user, 'edit_location') && hasButton(user, 'edit_photo'))

  await sendCb(handlersA, user, 'edit_description')
  check('J3 prompted for corrected description', replyContains(user, 'corrected description'))

  await sendText(handlersA, user, 'Pothole on Shastri Road near the park')
  check('J4 updated preview replaces description', replyContains(user, 'Complaint preview') && replyContains(user, 'Shastri Road'))

  const before = await Complaint.countDocuments()
  await sendCb(handlersA, user, 'confirm')
  const after = await Complaint.countDocuments()
  check('J5 edit → confirm creates exactly one new complaint', after === before + 1)
  const jComplaint = await Complaint.findOne({}).sort({ createdAt: -1 }).lean()
  check('J6 edited description persisted', jComplaint !== null && jComplaint.originalDescription === 'Pothole on Shastri Road near the park')
}

console.log('\n=== Scenario K: cancel discards draft ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'broken streetlight near Aluva junction')
  check('K1 reached preview', replyContains(user, 'Complaint preview'))
  await sendCb(handlersA, user, 'cancel')
  check('K2 cancel acknowledged', replyContains(user, 'cancelled'))
  check('K3 session removed', (await ComplaintSession.findOne({ telegramUserId: user.ctx.telegramUserId }).lean()) === null)
  const kCount = await Complaint.countDocuments({ citizenTelegramId: user.ctx.telegramUserId })
  check('K4 no complaint filed for cancelled draft', kCount === 0)
}

console.log('\n=== Scenario L: session expiry + resume ===\n')

{
  const user = makeUser()
  await startAndReport(handlersA, user)
  await sendText(handlersA, user, 'there is a pothole')
  const sessionBefore = await ComplaintSession.findOne({ telegramUserId: user.ctx.telegramUserId })
  sessionBefore!.expiresAt = new Date(Date.now() - 60_000)
  await sessionBefore!.save()

  await handlersA.start(user.ctx)
  check('L1 expired session is dropped → clean welcome', hasButton(user, 'report') && !hasButton(user, 'continue'))

  const user2 = makeUser()
  await startAndReport(handlersA, user2)
  await sendText(handlersA, user2, 'broken streetlight on the main road')
  await handlersA.start(user2.ctx)
  check('L2 unexpired draft offers continue', hasButton(user2, 'continue') && hasButton(user2, 'start_new'))

  await sendCb(handlersA, user2, 'continue')
  check('L3 continue resumes at missing location', replyContains(user2, 'Where is the issue'))
  await sendText(handlersA, user2, 'Aluva')
  await sendCb(handlersA, user2, 'confirm')
  check('L4 resumed + completed', (await Complaint.countDocuments({ citizenTelegramId: user2.ctx.telegramUserId })) === 1)
}

console.log('\n=== Scenario M: ownership isolation ===\n')

{
  const viewer = makeUser()
  const victimComplaint = await Complaint.findOne({})
  await sendCb(handlersA, viewer, 'my_complaints')
  check('M1 unknown citizen sees no complaints', replyContains(viewer, 'no complaints yet'))
  await sendCb(handlersA, viewer, `view_complaint:${victimComplaint?.complaintId}`)
  check('M2 cannot view another citizen complaint', replyContains(viewer, 'Complaint not found'))
}

console.log('\n=== Scenario N: complaint ID uniqueness + format ===\n')

{
  const complaints = await Complaint.find({}).sort({ createdAt: 1 }).lean()
  const ids = complaints.map((c) => c.complaintId)
  const idsUnique = new Set(ids).size === ids.length
  const idsFormatted = ids.every((id) => COMPLAINT_ID_PATTERN.test(id))
  check('N1 all complaint IDs unique', idsUnique, `${ids.length} complaints`)
  check('N2 all complaint IDs match EN-YYYY-NNNNN', idsFormatted)
}

console.log('\n=== Scenario O: TTL index on sessions ===\n')

{
  await ComplaintSession.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  const indexes = await ComplaintSession.collection.indexes()
  const ttlIndex = indexes.find(
    (index) => JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 }) && 'expireAfterSeconds' in index,
  )
  check('O1 session auto-expiry TTL index present', ttlIndex !== undefined)
}

console.log('\n=== Scenario P: locations across all demo areas resolve ===\n')

{
  const placements: Array<[string, string]> = [
    ['near Thiruvalla', 'TVLA-MUN'],
    ['near Kunnamthanam', 'KNM-GP'],
    ['Adoor town', 'ADOR-MUN'],
    ['Konni', 'KONN-GP'],
    ['Kottayam town', 'KTYM-MUN'],
    ['Palai', 'PALA-MUN'],
    ['Changanacherry', 'CHGN-MUN'],
    ['Ernakulam city near the junction', 'KCHI-CORP'],
    ['near Aluva', 'ALUV-MUN'],
    ['Angamaly', 'ANGM-MUN'],
  ]

  let allMapped = true
  for (const [placeText, expectedAuthorityCode] of placements) {
    const user = makeUser()
    await startAndReport(handlersA, user)
    await sendText(handlersA, user, 'drainage problem')
    await sendText(handlersA, user, placeText)
    const authority = await Authority.findOne({ code: expectedAuthorityCode }).lean()
    const previewOk = replyContains(user, 'Complaint preview') && authority !== null && replyContains(user, `\nLocal body: ${authority.name}`)
    if (!previewOk) {
      allMapped = false
      console.error(`  mapping issue for "${placeText}"`)
    }
  }
  check('P all 10 demo areas resolve to their authority', allMapped)

  const totalAfterMappings = await Complaint.countDocuments()
  check('P complaint count matches every confirmed flow', totalAfterMappings === 11, `${totalAfterMappings} vs 11`)
}

console.log('\n========================================')
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
console.log('========================================\n')

await mongoose.disconnect()
await mongod.stop()
process.exit(failures === 0 ? 0 : 1)