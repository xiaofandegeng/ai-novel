import type { EventRegistry } from './event-registry'
import type { EventStore, EventStoreSession } from './event-store'
import type { CommandDecision, CommandEnvelope, JsonObject } from './event-types'
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
    if (existing)
      return receiptResult<TResult>(existing)

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
    if (receipt)
      return receiptResult<TResult>(receipt)

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

    await session.transaction.insert(commandReceipts).values({
      commandId: command.commandId,
      commandType: command.commandType,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      projectId: command.projectId ?? null,
      status: 'completed',
      result: decision.result,
      finishedAt: new Date().toISOString(),
    })
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
      errorMessage: error.message,
      finishedAt: new Date().toISOString(),
    }).onConflictDoNothing()
  }
}

function receiptResult<TResult extends JsonObject>(receipt: CommandReceipt): TResult {
  if (receipt.status === 'completed' && isJsonObject(receipt.result))
    return receipt.result as TResult

  throw new DomainCommandError(
    receipt.errorCode ?? 'COMMAND_REJECTED',
    receipt.errorMessage ?? 'Command was rejected',
  )
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
