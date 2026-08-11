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
