export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}