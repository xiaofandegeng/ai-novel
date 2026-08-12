import type { EventRegistry } from './event-registry'
import type { EventStore, EventStoreSession } from './event-store'
import type {
  CommandDecision,
  CommandEnvelope,
  CommandReceiptProtection,
  CommandReceiptRecord,
  JsonObject,
} from './event-types'
import type { ProjectionRegistry } from './projection-runner'
import { AsyncLocalStorage } from 'node:async_hooks'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { commandReceipts } from '../db/schema'
import { DomainCommandError, UnknownCommandTypeError } from './errors'

export interface CommandHandlerContext {
  session: EventStoreSession
}

export type CommandHandler<
  TPayload extends JsonObject = JsonObject,
  TResult extends JsonObject = JsonObject,
> = (
  command: CommandEnvelope<TPayload>,
  context: CommandHandlerContext,
) => Promise<CommandDecision<TResult>>

type RegisteredCommandHandler = CommandHandler<JsonObject, JsonObject>
type CommandReceipt = typeof commandReceipts.$inferSelect

const RECEIPT_RESULT_FORMAT = 'command-receipt-result-v1' as const
const GENERIC_REJECTION_MESSAGE = 'Command was rejected'

export class CommandBus {
  private readonly handlers = new Map<string, RegisteredCommandHandler>()
  private readonly sessionStorage = new AsyncLocalStorage<EventStoreSession>()

  constructor(
    private readonly store: EventStore,
    private readonly projections: ProjectionRegistry,
    private readonly events?: EventRegistry,
  ) {}

  register<TPayload extends JsonObject, TResult extends JsonObject>(
    commandType: string,
    handler: CommandHandler<TPayload, TResult>,
  ): void {
    if (this.handlers.has(commandType))
      throw new Error(`Command type already registered: ${commandType}`)

    this.handlers.set(commandType, async (command, context) => {
      return handler(command as CommandEnvelope<TPayload>, context)
    })
  }

  async dispatch<TResult extends JsonObject = JsonObject>(command: CommandEnvelope): Promise<TResult> {
    const handler = this.handlers.get(command.commandType)
    if (!handler)
      throw new UnknownCommandTypeError(command.commandType)

    const activeSession = this.sessionStorage.getStore()
    if (activeSession)
      return this.dispatchInSession<TResult>(command, handler, activeSession)

    const existing = await this.readReceipt(command.commandId)
    if (existing) {
      return receiptResult<TResult>(
        existing,
        receipt => this.store.unprotectReceiptResult(receipt),
        projectId => this.store.isProjectDeleted(projectId),
      )
    }

    try {
      return await this.store.withTransaction(async (session) => {
        return this.sessionStorage.run(
          session,
          () => this.dispatchInSession<TResult>(command, handler, session),
        )
      })
    }
    catch (error: unknown) {
      if (error instanceof DomainCommandError)
        await this.storeFailure(command, error)
      throw error
    }
  }

  async runAtomically<TResult>(
    work: (transaction: EventStoreSession['transaction']) => Promise<TResult>,
  ): Promise<TResult> {
    const activeSession = this.sessionStorage.getStore()
    if (activeSession)
      return work(activeSession.transaction)
    return this.store.withTransaction(session => this.sessionStorage.run(
      session,
      () => work(session.transaction),
    ))
  }

  private async dispatchInSession<TResult extends JsonObject>(
    command: CommandEnvelope,
    handler: RegisteredCommandHandler,
    session: EventStoreSession,
  ): Promise<TResult> {
    const [receipt] = await session.transaction.select()
      .from(commandReceipts)
      .where(eq(commandReceipts.commandId, command.commandId))
      .limit(1)
    if (receipt) {
      return receiptResult<TResult>(
        receipt,
        stored => session.unprotectReceiptResult(stored),
        projectId => session.isProjectDeleted(projectId),
      )
    }

    if (command.projectId && await session.isProjectDeleted(command.projectId)) {
      throw new DomainCommandError(
        'PROJECT_NOT_FOUND',
        'Project not found',
      )
    }

    const decision = await handler(command, { session })
    assertProjectScope(command, decision)
    const streams = this.events
      ? decision.streams.map(append => ({
          ...append,
          events: append.events.map(event => this.events!.normalizePending(event)),
        }))
      : decision.streams

    const events = await session.appendBatch({
      commandId: command.commandId,
      correlationId: command.correlationId,
      ...(command.causationId ? { causationId: command.causationId } : {}),
      streams,
    })
    await this.projections.projectSync(session.transaction, events)
    await session.enqueueOutbox(decision.outbox ?? [])

    const receiptProtection = resolveReceiptProtection(command, decision)
    const storedResult = receiptProtection === 'project-content'
      ? protectedReceiptResult(
          await session.protectReceiptResult(command, decision.result),
        )
      : plaintextReceiptResult(decision.result)

    await session.transaction.insert(commandReceipts).values({
      commandId: command.commandId,
      commandType: command.commandType,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      projectId: command.projectId ?? null,
      status: 'completed',
      result: storedResult,
      finishedAt: new Date().toISOString(),
    })
    await session.finalizeContentProtection(events)
    return decision.result as TResult
  }

  private async readReceipt(commandId: string): Promise<CommandReceipt | undefined> {
    const [receipt] = await db.select()
      .from(commandReceipts)
      .where(eq(commandReceipts.commandId, commandId))
      .limit(1)
    return receipt
  }

  private async storeFailure(command: CommandEnvelope, error: DomainCommandError): Promise<void> {
    await db.insert(commandReceipts).values({
      commandId: command.commandId,
      commandType: command.commandType,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      projectId: command.projectId ?? null,
      status: 'failed',
      errorCode: error.code,
      errorMessage: GENERIC_REJECTION_MESSAGE,
      finishedAt: new Date().toISOString(),
    }).onConflictDoNothing()
  }
}

async function receiptResult<TResult extends JsonObject>(
  receipt: CommandReceipt,
  unprotect: (receipt: CommandReceiptRecord) => Promise<JsonObject>,
  isProjectDeleted: (projectId: string) => Promise<boolean>,
): Promise<TResult> {
  if (receipt.status !== 'completed') {
    throw new DomainCommandError(
      receipt.errorCode ?? 'COMMAND_REJECTED',
      receipt.errorMessage ?? GENERIC_REJECTION_MESSAGE,
    )
  }

  const stored = readStoredReceiptResult(receipt.result)
  if (stored.receiptProtection === 'none')
    return stored.plaintext as TResult

  if (!receipt.projectId)
    throw new Error('Invalid command receipt result format')
  if (await isProjectDeleted(receipt.projectId)) {
    throw new DomainCommandError(
      'PROJECT_NOT_FOUND',
      'Project not found',
    )
  }

  return await unprotect({
    ...receipt,
    result: stored.protected,
  }) as TResult
}

function assertProjectScope(command: CommandEnvelope, decision: CommandDecision<JsonObject>): void {
  if (!command.projectId)
    return

  const mismatched = decision.streams.find(append => append.stream.projectId !== command.projectId)
  if (!mismatched)
    return

  throw new DomainCommandError(
    'PROJECT_SCOPE_MISMATCH',
    `Command project ${command.projectId} cannot write stream ${mismatched.stream.aggregateType}/${mismatched.stream.aggregateId}`,
    {
      commandProjectId: command.projectId,
      streamProjectId: mismatched.stream.projectId ?? null,
    },
  )
}

function isJsonObject(value: JsonObject | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveReceiptProtection(
  command: CommandEnvelope,
  decision: CommandDecision<JsonObject>,
): CommandReceiptProtection {
  const protection = decision.receiptProtection
    ?? (command.projectId ? 'project-content' : 'none')
  if (protection === 'project-content' && !command.projectId) {
    throw new DomainCommandError(
      'PROJECT_SCOPE_REQUIRED',
      'Protected command receipt requires a project id',
    )
  }
  return protection
}

function plaintextReceiptResult(result: JsonObject): JsonObject {
  return {
    format: RECEIPT_RESULT_FORMAT,
    receiptProtection: 'none',
    plaintext: result,
  }
}

function protectedReceiptResult(result: JsonObject): JsonObject {
  return {
    format: RECEIPT_RESULT_FORMAT,
    receiptProtection: 'project-content',
    protected: result,
  }
}

type StoredReceiptResult
  = | { receiptProtection: 'none', plaintext: JsonObject }
    | { receiptProtection: 'project-content', protected: JsonObject }

function readStoredReceiptResult(result: JsonObject | null): StoredReceiptResult {
  if (!isJsonObject(result) || result.format !== RECEIPT_RESULT_FORMAT)
    throw new Error('Invalid command receipt result format')

  if (result.receiptProtection === 'none') {
    if (!hasExactKeys(result, ['format', 'plaintext', 'receiptProtection'])
      || !isJsonObjectValue(result.plaintext)) {
      throw new Error('Invalid command receipt result format')
    }
    return { receiptProtection: 'none', plaintext: result.plaintext }
  }

  if (result.receiptProtection === 'project-content') {
    if (!hasExactKeys(result, ['format', 'protected', 'receiptProtection'])
      || !isJsonObjectValue(result.protected)) {
      throw new Error('Invalid command receipt result format')
    }
    return { receiptProtection: 'project-content', protected: result.protected }
  }

  throw new Error('Invalid command receipt result format')
}

function hasExactKeys(result: JsonObject, expected: string[]): boolean {
  const actual = Object.keys(result).sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isJsonObjectValue(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
