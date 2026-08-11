export function generateId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

export function timestampMs(value: string | Date): number {
  if (value instanceof Date)
    return value.getTime()

  const normalized = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).getTime()
}

export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error ? error.message : fallback
}

export function success<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message && { message }) }
}

export function fail(error: string) {
  return { success: false as const, error }
}

export function updatedFields(fields: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined)
      result[key] = value
  }
  result.updatedAt = now()
  return result
}
