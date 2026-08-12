import type { JsonObject } from './event-types'
import { DomainCommandError } from './errors'

interface StringOptions {
  allowEmpty?: boolean
  trim?: boolean
}

interface IntegerOptions {
  maximum?: number
  minimum?: number
}

export interface PayloadCodec {
  object: (value: unknown) => JsonObject
  string: (record: JsonObject, key: string, options?: StringOptions) => string
  nullableString: (record: JsonObject, key: string, options?: StringOptions) => string | null
  nextNullableString: (record: JsonObject, key: string, fallback: string | null, options?: StringOptions) => string | null
  number: (record: JsonObject, key: string) => number
  nullableNumber: (record: JsonObject, key: string) => number | null
  integer: (record: JsonObject, key: string, options?: IntegerOptions) => number
  nullableInteger: (record: JsonObject, key: string, options?: IntegerOptions) => number | null
  boolean: (record: JsonObject, key: string) => boolean
  nextBoolean: (record: JsonObject, key: string, fallback: boolean) => boolean
  enum: <TValue extends string>(record: JsonObject, key: string, values: readonly TValue[]) => TValue
  nullableEnum: <TValue extends string>(record: JsonObject, key: string, values: readonly TValue[]) => TValue | null
  stringArray: (record: JsonObject, key: string) => string[]
  objectArray: (record: JsonObject, key: string) => JsonObject[]
}

export function createPayloadCodec(errorCode: string, subject: string): PayloadCodec {
  const invalid = (message: string): never => {
    throw new DomainCommandError(errorCode, message)
  }

  const object = (value: unknown): JsonObject => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return invalid(`${subject} must be an object`)
    return value as JsonObject
  }

  const string = (record: JsonObject, key: string, options: StringOptions = {}): string => {
    const value = record[key]
    if (typeof value !== 'string')
      return invalid(`${key} must be a string`)
    const normalized = options.trim === false ? value : value.trim()
    if (!options.allowEmpty && !normalized)
      return invalid(`${key} must be a non-empty string`)
    return normalized
  }

  const nullableString = (
    record: JsonObject,
    key: string,
    options: StringOptions = { allowEmpty: true, trim: false },
  ): string | null => {
    const value = record[key]
    if (value === undefined || value === null)
      return null
    return string(record, key, { allowEmpty: true, trim: false, ...options })
  }

  const number = (record: JsonObject, key: string): number => {
    const value = record[key]
    if (typeof value !== 'number' || !Number.isFinite(value))
      return invalid(`${key} must be a finite number`)
    return value
  }

  const nullableNumber = (record: JsonObject, key: string): number | null => {
    if (record[key] === undefined || record[key] === null)
      return null
    return number(record, key)
  }

  const integer = (record: JsonObject, key: string, options: IntegerOptions = {}): number => {
    const value = record[key]
    if (!Number.isInteger(value))
      return invalid(`${key} must be an integer`)
    const normalized = value as number
    if (options.minimum !== undefined && normalized < options.minimum)
      return invalid(`${key} must be an integer >= ${options.minimum}`)
    if (options.maximum !== undefined && normalized > options.maximum)
      return invalid(`${key} must be an integer <= ${options.maximum}`)
    return normalized
  }

  const nullableInteger = (record: JsonObject, key: string, options: IntegerOptions = {}): number | null => {
    if (record[key] === undefined || record[key] === null)
      return null
    return integer(record, key, options)
  }

  const boolean = (record: JsonObject, key: string): boolean => {
    const value = record[key]
    if (typeof value !== 'boolean')
      return invalid(`${key} must be a boolean`)
    return value
  }

  const enumValue = <TValue extends string>(
    record: JsonObject,
    key: string,
    values: readonly TValue[],
  ): TValue => {
    const value = record[key]
    if (typeof value !== 'string' || !values.includes(value as TValue))
      return invalid(`${key} must be one of: ${values.join(', ')}`)
    return value as TValue
  }

  return {
    object,
    string,
    nullableString,
    nextNullableString: (record, key, fallback, options) => (
      key in record ? nullableString(record, key, options) : fallback
    ),
    number,
    nullableNumber,
    integer,
    nullableInteger,
    boolean,
    nextBoolean: (record, key, fallback) => key in record ? boolean(record, key) : fallback,
    enum: enumValue,
    nullableEnum: (record, key, values) => (
      record[key] === undefined || record[key] === null ? null : enumValue(record, key, values)
    ),
    stringArray: (record, key) => {
      const value = record[key]
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim()))
        return invalid(`${key} must be an array of non-empty strings`)
      return value.map(item => String(item).trim())
    },
    objectArray: (record, key) => {
      const value = record[key]
      if (!Array.isArray(value))
        return invalid(`${key} must be an array`)
      return value.map(object)
    },
  }
}
