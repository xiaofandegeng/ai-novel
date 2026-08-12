import type { Context } from 'hono'
import { generateId } from '../utils'

export interface HTTPCommandOptions {
  commandId: string
  correlationId: string
}

export function httpCommandOptions(
  context: Context,
  commandType: string,
  ...scope: string[]
): HTTPCommandOptions {
  const idempotencyKey = context.req.header('Idempotency-Key')?.trim()
  const commandId = idempotencyKey
    ? [commandType, ...scope, idempotencyKey].map(encodeURIComponent).join(':')
    : generateId()
  return {
    commandId,
    correlationId: context.req.header('X-Correlation-ID')?.trim() || commandId,
  }
}
