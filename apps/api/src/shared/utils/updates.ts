import { now } from './time'

export function updatedFields(fields: object) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined)
      result[key] = value
  }
  result.updatedAt = now()
  return result
}
