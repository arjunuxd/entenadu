import type { ComplaintStatus } from '../models/Complaint.js'

export interface OutboundTelegramSender {
  sendMessage(chatId: string | number, text: string): Promise<unknown>
}

export interface TelegramBotLike {
  telegram: OutboundTelegramSender
}

let activeBot: TelegramBotLike | null = null

export function registerTelegramNotifier(bot: TelegramBotLike | null): void {
  activeBot = bot
}

export function telegramNotifierActive(): boolean {
  return activeBot !== null
}

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  verified: 'Verified',
  assigned: 'Assigned',
  under_review: 'Under review',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

export function statusLabel(status: ComplaintStatus): string {
  return STATUS_LABELS[status]
}

function buildStatusMessage(complaintId: string, status: ComplaintStatus, extraText?: string): string {
  const lines = [
    'Ente Nadu — complaint update',
    '',
    `Complaint ID: ${complaintId}`,
    `Status: ${STATUS_LABELS[status]}`,
  ]

  if (extraText) {
    lines.push(extraText)
  }

  lines.push('', 'Reply with /start to file another complaint.')
  return lines.join('\n')
}

async function sendOnce(chatId: string, text: string): Promise<boolean> {
  if (!activeBot || !chatId) {
    return false
  }

  try {
    await activeBot.telegram.sendMessage(chatId, text)
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    const maskedChat = chatId.length > 6 ? `${chatId.slice(0, 6)}…` : chatId
    console.warn(`[notify] Telegram notification failed for chat ${maskedChat}: ${detail}`)
    return false
  }
}

export interface NotificationComplaintRef {
  complaintId: string
  citizenTelegramId: string
}

export async function notifyComplaintStatus(
  complaint: NotificationComplaintRef,
  status: ComplaintStatus,
  extraText?: string,
): Promise<void> {
  if (!activeBot || !complaint.citizenTelegramId) {
    return
  }

  await sendOnce(complaint.citizenTelegramId, buildStatusMessage(complaint.complaintId, status, extraText))
}