import { Types, type HydratedDocument } from 'mongoose'
import type {
  ComplaintSession as ComplaintSessionModel,
  SessionEditTarget,
} from '../../models/index.js'
import { ComplaintSession, SESSION_TTL_MS } from '../../models/index.js'
import { createComplaint, getComplaintByCitizen, listComplaintsByCitizen } from '../complaint.service.js'
import { getPlaceView, resolvePlace } from '../place.service.js'
import { validatePhoto } from '../../utils/photoValidation.js'
import { COMPLAINT_STATUS_LABELS } from '../../utils/statusLabels.js'
import type { GeminiTextAnalysis, TextInputContext } from '../gemini.service.js'

export interface BotButton {
  text: string
  data: string
}

export interface BotContext {
  chatId: number
  telegramUserId: string
  text?: string
  caption?: string
  photo?: { fileId: string }[]
  location?: { latitude: number; longitude: number }
  callbackData?: string
  reply(text: string, buttons?: BotButton[][]): Promise<unknown>
  answer(message?: string): Promise<unknown>
}

export interface PhotoDownloadResult {
  buffer: Buffer
  contentType: string
}

export interface ComplaintBotDeps {
  downloadPhoto(fileId: string): Promise<PhotoDownloadResult>
  uploadPhoto(buffer: Buffer, contentType: string): Promise<string>
  understandText(text: string, context: TextInputContext): Promise<GeminiTextAnalysis>
}

export interface ComplaintHandlers {
  start(ctx: BotContext): Promise<void>
  text(ctx: BotContext): Promise<void>
  photo(ctx: BotContext): Promise<void>
  location(ctx: BotContext): Promise<void>
  callback(ctx: BotContext): Promise<void>
}

type SessionDoc = HydratedDocument<ComplaintSessionModel>

const WELCOME_TEXT = `Welcome to Ente Nadu!

Report issues like potholes, broken streetlights, waste, drainage or water-supply problems, and we will route your complaint to the right local body.

You can describe the issue, attach a photo, or share your live location - in any order.`

const REPORT_PROMPT_TEXT = `Tell us what is wrong. For example: "There is a big pothole near the school gate".

You can also send a photo, your live location, or the name of the area. Missing details can be added later.`

const LOCATION_PROMPT_TEXT = `Where is the issue located? Send the name of the place or area, or share your live location.`

function mainMenuButtons(): BotButton[][] {
  return [
    [{ text: 'Report an issue', data: 'report' }],
    [{ text: 'My Complaints', data: 'my_complaints' }],
  ]
}

function afterSubmitButtons(): BotButton[][] {
  return [
    [{ text: 'Report another issue', data: 'report' }],
    [{ text: 'My Complaints', data: 'my_complaints' }],
  ]
}

function hasLocation(session: SessionDoc): boolean {
  return Boolean(session.placeId) || session.latitude !== null || Boolean(session.manualLocation)
}

function buildTextInputContext(session: SessionDoc): TextInputContext {
  return {
    hasDescription: Boolean(session.originalDescription),
    hasLocation: hasLocation(session),
    category: session.category,
    place: session.placeName,
    district: session.district,
  }
}

async function getActiveSession(telegramUserId: string): Promise<SessionDoc | null> {
  const session = await ComplaintSession.findOne({ telegramUserId })

  if (!session) {
    return null
  }

  if (Date.now() > session.expiresAt.getTime()) {
    await session.deleteOne()
    return null
  }

  return session
}

async function createSession(telegramUserId: string): Promise<SessionDoc> {
  return ComplaintSession.create({
    telegramUserId,
    conversationState: 'collecting',
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
}

export function createComplaintHandlers(deps: ComplaintBotDeps): ComplaintHandlers {
  async function start(ctx: BotContext): Promise<void> {
    const session = await getActiveSession(ctx.telegramUserId)

    if (session && !session.complaintCreated && (session.originalDescription || hasLocation(session) || session.photoUrl)) {
      await ctx.reply(
        'You have an unfinished complaint. Continue where you left off, or start a fresh report.',
        [
          [{ text: 'Continue', data: 'continue' }],
          [{ text: 'Start New', data: 'start_new' }],
        ],
      )
      return
    }

    await ctx.reply(WELCOME_TEXT, mainMenuButtons())
  }

  async function showPreview(session: SessionDoc, ctx: BotContext): Promise<void> {
    const placeView = session.placeId ? await getPlaceView(session.placeId.toString()) : null

    const locationLabel = placeView
      ? `${placeView.name}${placeView.district ? ` (${placeView.district})` : ''}`
      : session.latitude !== null && session.longitude !== null
        ? `GPS: ${session.latitude.toFixed(5)}, ${session.longitude.toFixed(5)}`
        : (session.manualLocation ?? 'Not specified')

    const authorityLabel = placeView?.authorityName ?? 'Pending verification by the local body'

    const photoLines = session.photoUrl
      ? 'Attached'
      : 'Not attached'

    const observationLine =
      session.imageObservations.length > 0 ? `Photo notes: ${session.imageObservations[0]}` : null

    const lines = [
      'Complaint preview',
      `Description: ${session.originalDescription ?? ''}`,
      `Category: ${session.category ?? 'Not specified'}`,
      `Severity: ${session.severity ?? 'Not specified'}`,
      `Location: ${locationLabel}`,
      `Local body: ${authorityLabel}`,
      `Photo: ${photoLines}`,
    ]

    if (observationLine) {
      lines.push(observationLine)
    }

    lines.push('', 'Confirm to submit, or choose Edit to change something.')

    session.conversationState = 'preview'
    session.editTarget = null
    await session.save()

    await ctx.reply(lines.join('\n'), [
      [{ text: 'Confirm', data: 'confirm' }],
      [
        { text: 'Edit', data: 'edit' },
        { text: 'Cancel', data: 'cancel' },
      ],
    ])
  }

  async function applyDescription(
    session: SessionDoc,
    text: string,
    analysis: GeminiTextAnalysis | null,
  ): Promise<void> {
    session.originalDescription = text.trim()

    if (analysis?.description) {
      session.aiDescription = analysis.description
    }
    if (analysis?.category) {
      session.category = analysis.category
    }
    if (analysis?.severity) {
      session.severity = analysis.severity
    }
    if (analysis?.language) {
      session.language = analysis.language
    }
  }

  async function applyLocationText(
    session: SessionDoc,
    text: string,
    analysis: GeminiTextAnalysis | null,
    ctx: BotContext,
  ): Promise<void> {
    session.manualLocation = text.trim()
    session.placeName = analysis?.place ?? text.trim()

    if (analysis?.district) {
      session.district = analysis.district
    }

    const result = await resolvePlace(session.placeName, session.district)

    if (result.status === 'found') {
      session.placeId = new Types.ObjectId(result.place.id)
      session.district = result.place.district
      session.awaitingLocationClarification = false
      return
    }

    if (result.status === 'ambiguous') {
      session.awaitingLocationClarification = true
      const rows: BotButton[][] = result.matches.map((match) => [
        { text: `${match.name} - ${match.district}`, data: `loc:${match.id}` },
      ])
      rows.push([{ text: 'It is none of these', data: 'loc_skip' }])
      await ctx.reply(
        'I found more than one matching place. Which one did you mean? (Or send more detail like a nearby landmark.)',
        rows,
      )
      return
    }

    session.awaitingLocationClarification = false
    session.placeId = null
  }

  async function advance(session: SessionDoc, ctx: BotContext): Promise<void> {
    if (session.awaitingLocationClarification) {
      return
    }

    if (!session.originalDescription) {
      await ctx.reply(REPORT_PROMPT_TEXT)
      return
    }

    if (!hasLocation(session)) {
      await ctx.reply(LOCATION_PROMPT_TEXT)
      return
    }

    await showPreview(session, ctx)
  }

  async function text(ctx: BotContext): Promise<void> {
    const textInput = ctx.text?.trim()
    const caption = ctx.caption?.trim()

    if (caption) {
      await text({ ...ctx, text: caption, caption: undefined, photo: undefined })
      return
    }

    if (!textInput) {
      await ctx.reply('I could not read that message. Please type your complaint or send a photo or location.')
      return
    }

    if (textInput.startsWith('/')) {
      await start(ctx)
      return
    }

    let session = await getActiveSession(ctx.telegramUserId)

    if (!session) {
      session = await createSession(ctx.telegramUserId)
    } else {
      session.expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    }

    if (session.complaintCreated) {
      await session.save()
      await ctx.reply(
        `Your complaint ${session.complaintId ?? ''} is already registered.`,
        mainMenuButtons(),
      )
      return
    }

    session.awaitingLocationClarification = false

    if (session.conversationState === 'editing' && session.editTarget === 'location') {
      await applyLocationText(session, textInput, null, ctx)
      session.conversationState = 'collecting'
      await session.save()
      await advance(session, ctx)
      return
    }

    if (session.conversationState === 'editing' && session.editTarget === 'description') {
      await applyDescription(session, textInput, null)
      session.conversationState = 'collecting'
      await session.save()
      await advance(session, ctx)
      return
    }

    let analysis: GeminiTextAnalysis | null
    try {
      analysis = await deps.understandText(textInput, buildTextInputContext(session))
    } catch (error) {
      console.warn(`[bot] understanding failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      analysis = null
    }

    if (analysis !== null && analysis.inputType === 'location') {
      await applyLocationText(session, textInput, analysis, ctx)
    } else if (analysis === null || analysis.inputType === 'unknown') {
      if (!session.originalDescription) {
        await applyDescription(session, textInput, null)
      } else if (!hasLocation(session)) {
        await applyLocationText(session, textInput, null, ctx)
      } else {
        await applyDescription(session, textInput, null)
      }
    } else {
      await applyDescription(session, textInput, analysis)

      if (analysis.place && !hasLocation(session)) {
        await applyLocationText(session, analysis.location ?? analysis.place, analysis, ctx)
      }
    }

    await session.save()
    await advance(session, ctx)
  }

  async function photo(ctx: BotContext): Promise<void> {
    if (!ctx.photo || ctx.photo.length === 0) {
      return
    }

    let session = await getActiveSession(ctx.telegramUserId)

    if (!session) {
      session = await createSession(ctx.telegramUserId)
    } else {
      session.expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    }

    const largest = ctx.photo[ctx.photo.length - 1]

    try {
      const { buffer, contentType } = await deps.downloadPhoto(largest.fileId)
      const validation = validatePhoto(buffer)

      if (!validation.ok) {
        const reason =
          validation.reason === 'too_large'
            ? 'The photo is too large (limit 10 MB).'
            : validation.reason === 'unsupported_type'
              ? 'Only JPG, PNG or WEBP photos are supported.'
              : 'The photo appears to be empty.'
        await ctx.reply(`${reason} You can continue without a photo.`)
      } else {
        const photoUrl = await deps.uploadPhoto(buffer, validation.mimeType).catch((error: unknown) => {
          console.warn(`[bot] photo upload skipped: ${error instanceof Error ? error.message : 'unknown error'}`)
          return null
        })

        session.photoUrl = photoUrl

        if (photoUrl) {
          await ctx.reply('Thanks! I have saved the photo.')
        }
      }
    } catch (error) {
      console.warn(`[bot] photo handling failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      await ctx.reply('I could not process that photo. You can continue without it.')
      session.photoUrl = null
    }

    await session.save()

    if (ctx.caption?.trim()) {
      await text({ ...ctx, text: ctx.caption, caption: undefined, photo: undefined })
      return
    }

    await advance(session, ctx)
  }

  async function location(ctx: BotContext): Promise<void> {
    if (!ctx.location) {
      return
    }

    let session = await getActiveSession(ctx.telegramUserId)

    if (!session) {
      session = await createSession(ctx.telegramUserId)
    } else {
      session.expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    }

    session.latitude = ctx.location.latitude
    session.longitude = ctx.location.longitude
    session.awaitingLocationClarification = false

    await session.save()
    await ctx.reply('Thanks! I have your location.')
    await advance(session, ctx)
  }

  async function confirmComplaint(ctx: BotContext): Promise<void> {
    const session = await getActiveSession(ctx.telegramUserId)

    if (!session) {
      await ctx.reply('There is no active complaint to confirm.')
      return
    }

    if (session.complaintCreated) {
      if (session.complaintId) {
        const existing = await getComplaintByCitizen(session.complaintId, ctx.telegramUserId)
        if (existing) {
          await ctx.reply(
            `This complaint was already registered as ${existing.complaintId}. You will not be charged a duplicate.`,
            mainMenuButtons(),
          )
          return
        }
      }
      await ctx.reply('There is no active complaint to confirm.')
      return
    }

    if (session.conversationState !== 'preview') {
      await ctx.answer('Please finish entering the complaint details first.')
      return
    }

    const complaint = await createComplaint({
      telegramUserId: ctx.telegramUserId,
      originalDescription: session.originalDescription ?? '',
      language: session.language,
      aiDescription: session.aiDescription,
      category: session.category,
      severity: session.severity,
      photoUrl: session.photoUrl,
      district: session.district,
      locationLabel: session.manualLocation,
      placeId: session.placeId,
      latitude: session.latitude,
      longitude: session.longitude,
    })

    session.complaintId = complaint.complaintId
    session.complaintCreated = true
    session.conversationState = 'collecting'
    session.editTarget = null
    await session.save()

    await ctx.reply(
      `Your complaint has been registered!\n\nComplaint ID: ${complaint.complaintId}\nStatus: Submitted\n\nLocal officials will now review it.`,
      afterSubmitButtons(),
    )
  }

  async function showMyComplaints(ctx: BotContext): Promise<void> {
    const complaints = await listComplaintsByCitizen(ctx.telegramUserId, 5)

    if (complaints.length === 0) {
      await ctx.reply('You have no complaints yet.', [[{ text: 'Report an issue', data: 'report' }]])
      return
    }

    const buttons: BotButton[][] = complaints.map((complaint) => [
      {
        text: `${complaint.complaintId} | ${COMPLAINT_STATUS_LABELS[complaint.status] ?? complaint.status}`,
        data: `view_complaint:${complaint.complaintId}`,
      },
    ])

    buttons.push([{ text: 'Report an issue', data: 'report' }])
    buttons.push([{ text: 'Main menu', data: 'main_menu' }])

    await ctx.reply('Your complaints (most recent first). Tap one to see details.', buttons)
  }

  async function callback(ctx: BotContext): Promise<void> {
    const data = ctx.callbackData ?? ''

    if (data === 'report' || data === 'start_new') {
      const existing = await ComplaintSession.findOne({ telegramUserId: ctx.telegramUserId })
      if (existing) {
        await existing.deleteOne()
      }
      await ComplaintSession.create({
        telegramUserId: ctx.telegramUserId,
        conversationState: 'collecting',
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      })
      await ctx.reply(REPORT_PROMPT_TEXT)
      return
    }

    if (data === 'continue') {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is nothing to continue. Start a fresh report.', mainMenuButtons())
        return
      }
      session.expiresAt = new Date(Date.now() + SESSION_TTL_MS)
      session.awaitingLocationClarification = false
      await session.save()
      await advance(session, ctx)
      return
    }

    if (data === 'my_complaints') {
      await showMyComplaints(ctx)
      return
    }

    if (data === 'main_menu') {
      await ctx.reply(WELCOME_TEXT, mainMenuButtons())
      return
    }

    if (data === 'confirm') {
      await confirmComplaint(ctx)
      return
    }

    if (data === 'cancel') {
      const session = await ComplaintSession.findOne({ telegramUserId: ctx.telegramUserId })
      if (session) {
        await session.deleteOne()
      }
      await ctx.reply('Complaint draft cancelled. No complaint was filed.', mainMenuButtons())
      return
    }

    if (data === 'edit') {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is no active complaint to edit.', mainMenuButtons())
        return
      }
      session.conversationState = 'editing'
      session.editTarget = null
      await session.save()
      await ctx.reply('What would you like to change?', [
        [{ text: 'Edit description', data: 'edit_description' }],
        [{ text: 'Edit location', data: 'edit_location' }],
        [{ text: 'Edit photo', data: 'edit_photo' }],
        [{ text: 'Back to preview', data: 'edit_back' }],
      ])
      return
    }

    if (data === 'edit_description' || data === 'edit_location' || data === 'edit_photo') {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is no active complaint to edit.', mainMenuButtons())
        return
      }

      const target: SessionEditTarget =
        data === 'edit_description' ? 'description' : data === 'edit_location' ? 'location' : 'photo'

      session.conversationState = 'editing'
      session.editTarget = target
      await session.save()

      const prompt =
        data === 'edit_description'
          ? 'Send the corrected description.'
          : data === 'edit_location'
            ? 'Send the corrected location (place name, area, or live location).'
            : 'Send a new photo.'

      await ctx.reply(prompt, [[{ text: 'Cancel edit', data: 'edit_back' }]])
      return
    }

    if (data === 'edit_back') {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is no active complaint.', mainMenuButtons())
        return
      }
      await showPreview(session, ctx)
      return
    }

    if (data.startsWith('loc:')) {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is no active complaint. Start a fresh report.', mainMenuButtons())
        return
      }

      const placeId = data.slice(4)
      const placeView = await getPlaceView(placeId)

      if (!placeView) {
        await ctx.reply('That place is no longer available. Please type the area name again.')
        return
      }

      session.placeId = new Types.ObjectId(placeView.id)
      session.district = placeView.district
      session.awaitingLocationClarification = false
      await session.save()
      await advance(session, ctx)
      return
    }

    if (data === 'loc_skip') {
      const session = await getActiveSession(ctx.telegramUserId)
      if (!session) {
        await ctx.reply('There is no active complaint. Start a fresh report.', mainMenuButtons())
        return
      }
      session.awaitingLocationClarification = false
      session.placeId = null
      await session.save()
      await advance(session, ctx)
      return
    }

    if (data.startsWith('view_complaint:')) {
      const complaintId = data.slice('view_complaint:'.length)
      const complaint = await getComplaintByCitizen(complaintId, ctx.telegramUserId)

      if (!complaint) {
        await ctx.reply('Complaint not found.')
        return
      }

      const c = complaint as unknown as { createdAt?: Date }
      const place = complaint.placeId as unknown as { name?: string; district?: string } | null

      const lines = [
        `Complaint ${complaint.complaintId}`,
        `Status: ${COMPLAINT_STATUS_LABELS[complaint.status] ?? complaint.status}`,
        `Category: ${complaint.category ?? 'Not specified'}`,
        `Severity: ${complaint.severity ?? 'Not specified'}`,
        `Place: ${place?.name ?? 'Not specified'}${place?.district ? ` (${place.district})` : ''}`,
        `Description: ${complaint.originalDescription}`,
        `Submitted: ${c.createdAt ? new Date(c.createdAt).toLocaleString() : 'Unknown'}`,
      ]

      await ctx.reply(lines.join('\n'), [
        [{ text: 'Back to my complaints', data: 'my_complaints' }],
        [{ text: 'Main menu', data: 'main_menu' }],
      ])
      return
    }

    await ctx.answer('Unknown option.')
  }

  return { start, text, photo, location, callback }
}