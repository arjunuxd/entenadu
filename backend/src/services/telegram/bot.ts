import { Markup, Telegraf, type Context } from 'telegraf'
import { env } from '../../config/env.js'
import { understandText } from '../gemini.service.js'
import { uploadPhoto } from '../cloudinary.service.js'
import { registerTelegramNotifier } from '../notification.service.js'
import { createComplaintHandlers, type BotContext } from './handlers.js'

export type StopTelegramBot = () => Promise<void>

export async function startTelegramBot(): Promise<StopTelegramBot | null> {
  if (!env.telegramBotToken) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram reporting bot is disabled.')
    return null
  }

  const bot = new Telegraf(env.telegramBotToken)
  registerTelegramNotifier(bot)

  const handlers = createComplaintHandlers({
    downloadPhoto: async (fileId) => {
      const link = await bot.telegram.getFileLink(fileId)
      const response = await fetch(link.href)
      if (!response.ok) {
        throw new Error(`Could not download Telegram file: HTTP ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      return {
        buffer,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },
    uploadPhoto,
    understandText,
  })

  function toBotContext(ctx: Context, callbackData?: string): BotContext {
    const message = ctx.message

    return {
      chatId: ctx.chat?.id ?? 0,
      telegramUserId: String(ctx.from?.id ?? ''),
      text: message && 'text' in message ? message.text : undefined,
      caption: message && 'caption' in message && typeof message.caption === 'string' ? message.caption : undefined,
      photo:
        message && 'photo' in message
          ? message.photo.map((photo): { fileId: string } => ({ fileId: photo.file_id }))
          : undefined,
      location: message && 'location' in message ? message.location : undefined,
      callbackData,
      reply: (text, buttons) =>
        ctx.reply(
          text,
          buttons
            ? {
                reply_markup: Markup.inlineKeyboard(
                  buttons.map((row) => row.map((button) => Markup.button.callback(button.text, button.data))),
                ).reply_markup,
              }
            : {},
        ),
      answer: (messageText) =>
        ctx.answerCbQuery(typeof messageText === 'string' ? messageText : undefined),
    }
  }

  function safely(ctx: Context, callbackData: string | undefined, run: (botCtx: BotContext) => Promise<void>): void {
    const botCtx = callbackData !== undefined ? { ...toBotContext(ctx), callbackData } : toBotContext(ctx)
    run(botCtx).catch((error: unknown) => {
      console.error(`[telegram] handler error: ${error instanceof Error ? error.message : 'unknown error'}`)
      void botCtx
        .reply('Something went wrong. Please try again or type /start.')
        .catch(() => undefined)
    })
  }

  bot.start((ctx) => safely(ctx, undefined, (botCtx) => handlers.start(botCtx)))

  bot.on('message', (ctx) => {
    safely(ctx, undefined, (botCtx) => {
      if (botCtx.photo && botCtx.photo.length > 0) {
        return handlers.photo(botCtx)
      }
      if (botCtx.location) {
        return handlers.location(botCtx)
      }
      return handlers.text(botCtx)
    })
  })

  bot.on('callback_query', (ctx) => {
    const callbackData = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined
    safely(ctx, callbackData, (botCtx) => handlers.callback(botCtx))
  })

  void bot
    .launch({ dropPendingUpdates: true })
    .then(() => {
      console.log('Telegram reporting bot started (long polling).')
    })
    .catch((error: unknown) => {
      console.error(`Telegram bot failed to start: ${error instanceof Error ? error.message : 'unknown error'}`)
    })

  return async () => {
    bot.stop('SIGINT')
  }
}