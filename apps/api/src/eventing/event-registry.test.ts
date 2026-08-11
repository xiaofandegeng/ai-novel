import { describe, expect, it } from 'vitest'
import { EventRegistry } from './event-registry'
import {
  DuplicateEventTypeError,
  InvalidEventPayloadError,
  MissingEventUpcasterError,
  UnknownEventTypeError,
  UnsupportedEventVersionError,
} from './errors'

describe('eventRegistry', () => {
  it('decodes a registered event at its current schema version', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestCreated',
      currentSchemaVersion: 1,
      validate: (payload) => {
        if (!isRecord(payload) || typeof payload.value !== 'string')
          throw new Error('value must be a string')
        return { value: payload.value }
      },
      upcasters: {},
    })

    expect(registry.decode('KernelTestCreated', 1, { value: 'ok' })).toEqual({ value: 'ok' })
  })

  it('applies every upcaster before validating the current payload', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestRenamed',
      currentSchemaVersion: 3,
      validate: (payload) => {
        if (!isRecord(payload) || typeof payload.title !== 'string')
          throw new Error('title must be a string')
        return { title: payload.title }
      },
      upcasters: {
        1: (payload) => {
          if (!isRecord(payload))
            throw new Error('legacy payload must be an object')
          return { name: payload.value }
        },
        2: (payload) => {
          if (!isRecord(payload))
            throw new Error('legacy payload must be an object')
          return { title: payload.name }
        },
      },
    })

    expect(registry.decode('KernelTestRenamed', 1, { value: '新标题' })).toEqual({ title: '新标题' })
  })

  it('rejects an unregistered event type', () => {
    expect(() => new EventRegistry().decode('Missing', 1, {})).toThrow(UnknownEventTypeError)
  })

  it('rejects duplicate event definitions', () => {
    const registry = new EventRegistry()
    const definition = {
      eventType: 'KernelTestCreated',
      currentSchemaVersion: 1,
      validate: () => ({}),
      upcasters: {},
    }
    registry.register(definition)

    expect(() => registry.register(definition)).toThrow(DuplicateEventTypeError)
  })

  it('rejects a historical event when an intermediate upcaster is missing', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestRenamed',
      currentSchemaVersion: 3,
      validate: () => ({}),
      upcasters: { 1: payload => payload },
    })

    expect(() => registry.decode('KernelTestRenamed', 1, {})).toThrow(MissingEventUpcasterError)
  })

  it('rejects an event from a future schema version', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestCreated',
      currentSchemaVersion: 1,
      validate: () => ({}),
      upcasters: {},
    })

    expect(() => registry.decode('KernelTestCreated', 2, {})).toThrow(UnsupportedEventVersionError)
  })

  it('wraps payload validation failures in an eventing error', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestCreated',
      currentSchemaVersion: 1,
      validate: () => {
        throw new Error('invalid value')
      },
      upcasters: {},
    })

    expect(() => registry.decode('KernelTestCreated', 1, {})).toThrow(InvalidEventPayloadError)
  })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
