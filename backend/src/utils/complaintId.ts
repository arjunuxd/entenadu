export const COMPLAINT_ID_PATTERN = /^EN-\d{4}-\d{5}$/

export const COMPLAINT_SEQ_KEY = 'complaint_seq'

export function formatComplaintId(seq: number, year: number = new Date().getFullYear()): string {
  return `EN-${year}-${String(seq).padStart(5, '0')}`
}