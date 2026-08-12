import type { JsonObject } from '../eventing'
import type { ContentEncryptionRecordExecutor } from '../eventing/content-encryption-records'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { db, sql } from '../db'
import { domainEventRegistry } from '../eventing-runtime'
import { readContentEncryptionRecords } from '../eventing/content-encryption-records'
import {
  DELETE_PROJECT_COMMAND,
  PROJECT_DELETED,
} from '../modules/project/project.eventing'

const CONTENT_AAD_FORMAT = 'eventing-content-aad-v1'
const RECEIPT_RESULT_FORMAT = 'command-receipt-result-v1'
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const ENCRYPTION_KEY_VERSION = 1

export type EncryptionVerificationRecordType = 'event' | 'snapshot' | 'receipt' | 'project-key'

export type EncryptionVerificationCategory
  = | 'delete-receipt-plaintext-invalid'
    | 'deleted-project-key-active'
    | 'deleted-project-key-missing'
    | 'event-classification-missing'
    | 'event-envelope-invalid'
    | 'event-project-scope-missing'
    | 'key-tombstone-without-delete'
    | 'known-plaintext-found'
    | 'project-key-envelope-invalid'
    | 'project-key-metadata-invalid'
    | 'project-key-state-invalid'
    | 'protected-record-key-missing'
    | 'receipt-envelope-invalid'
    | 'receipt-protection-invalid'
    | 'receipt-wrapper-invalid'
    | 'snapshot-envelope-invalid'

export interface EncryptionVerificationFinding {
  category: EncryptionVerificationCategory
  recordId: string
  recordType: EncryptionVerificationRecordType
}

export interface EncryptionVerificationReport {
  ok: boolean
  scopeProjectId?: string
  checkedRecords: {
    protectedEvents: number
    projectSnapshots: number
    completedProjectReceipts: number
    projectKeys: number
  }
  tombstonedProjects: number
  findings: EncryptionVerificationFinding[]
}

export async function verifyContentEncryption(
  projectId?: string,
  knownPlaintexts: readonly string[] = [],
  executor: ContentEncryptionRecordExecutor = db,
): Promise<EncryptionVerificationReport> {
  const { events, snapshots, receipts, keys } = await readContentEncryptionRecords(
    executor,
    projectId,
  )
  const findings: EncryptionVerificationFinding[] = []
  const deletedProjectIds = new Set(
    events.flatMap(event => (
      event.eventType === PROJECT_DELETED && event.projectId ? [event.projectId] : []
    )),
  )
  const keyStates = new Map<string, 'active' | 'invalid' | 'tombstone'>()
  const probes = knownPlaintexts.filter(value => value.length > 0)
  let protectedEvents = 0

  for (const key of keys) {
    const metadataValid = key.algorithm === ENCRYPTION_ALGORITHM
      && key.keyVersion === ENCRYPTION_KEY_VERSION
    if (!metadataValid) {
      addFinding(findings, 'project-key', key.projectId, 'project-key-metadata-invalid')
    }

    if (key.wrappedKey !== null && key.destroyedAt === null) {
      keyStates.set(key.projectId, metadataValid ? 'active' : 'invalid')
      if (!isEncryptedEnvelope(key.wrappedKey, false)) {
        keyStates.set(key.projectId, 'invalid')
        addFinding(findings, 'project-key', key.projectId, 'project-key-envelope-invalid')
      }
    }
    else if (key.wrappedKey === null && key.destroyedAt !== null) {
      keyStates.set(key.projectId, metadataValid ? 'tombstone' : 'invalid')
      if (!deletedProjectIds.has(key.projectId)) {
        addFinding(findings, 'project-key', key.projectId, 'key-tombstone-without-delete')
      }
    }
    else {
      keyStates.set(key.projectId, 'invalid')
      addFinding(findings, 'project-key', key.projectId, 'project-key-state-invalid')
    }
  }

  for (const deletedProjectId of deletedProjectIds) {
    const state = keyStates.get(deletedProjectId)
    if (!state) {
      addFinding(findings, 'project-key', deletedProjectId, 'deleted-project-key-missing')
    }
    else if (state === 'active') {
      addFinding(findings, 'project-key', deletedProjectId, 'deleted-project-key-active')
    }
  }

  for (const event of events) {
    if (containsKnownPlaintext(event.payload, probes)) {
      addFinding(findings, 'event', event.eventId, 'known-plaintext-found')
    }
    if (!domainEventRegistry.has(event.eventType)) {
      addFinding(findings, 'event', event.eventId, 'event-classification-missing')
      continue
    }
    if (domainEventRegistry.protectionFor(event.eventType) !== 'project-content')
      continue

    protectedEvents += 1
    if (!event.projectId) {
      addFinding(findings, 'event', event.eventId, 'event-project-scope-missing')
    }
    else if (!keyStates.has(event.projectId)) {
      addFinding(findings, 'event', event.eventId, 'protected-record-key-missing')
    }
    if (!isEncryptedEnvelope(event.payload, true))
      addFinding(findings, 'event', event.eventId, 'event-envelope-invalid')
  }

  for (const snapshot of snapshots) {
    const recordId = `${snapshot.aggregateType}/${snapshot.aggregateId}`
    if (containsKnownPlaintext(snapshot.state, probes)) {
      addFinding(findings, 'snapshot', recordId, 'known-plaintext-found')
    }
    if (!keyStates.has(snapshot.projectId)) {
      addFinding(findings, 'snapshot', recordId, 'protected-record-key-missing')
    }
    if (!isEncryptedEnvelope(snapshot.state, true))
      addFinding(findings, 'snapshot', recordId, 'snapshot-envelope-invalid')
  }

  for (const receipt of receipts) {
    if (containsKnownPlaintext(receipt.result, probes)) {
      addFinding(findings, 'receipt', receipt.commandId, 'known-plaintext-found')
    }
    if (!isJsonObject(receipt.result) || receipt.result.format !== RECEIPT_RESULT_FORMAT) {
      addFinding(findings, 'receipt', receipt.commandId, 'receipt-wrapper-invalid')
      continue
    }

    if (receipt.result.receiptProtection === 'project-content') {
      if (!hasExactKeys(receipt.result, ['format', 'protected', 'receiptProtection'])) {
        addFinding(findings, 'receipt', receipt.commandId, 'receipt-wrapper-invalid')
        continue
      }
      if (!keyStates.has(receipt.projectId)) {
        addFinding(findings, 'receipt', receipt.commandId, 'protected-record-key-missing')
      }
      if (!isEncryptedEnvelope(receipt.result.protected, true)) {
        addFinding(findings, 'receipt', receipt.commandId, 'receipt-envelope-invalid')
      }
      continue
    }

    if (receipt.result.receiptProtection !== 'none'
      || !hasExactKeys(receipt.result, ['format', 'plaintext', 'receiptProtection'])) {
      addFinding(findings, 'receipt', receipt.commandId, 'receipt-wrapper-invalid')
      continue
    }
    if (receipt.commandType !== DELETE_PROJECT_COMMAND) {
      addFinding(findings, 'receipt', receipt.commandId, 'receipt-protection-invalid')
      continue
    }
    if (!isMinimalDeleteReceipt(receipt.result.plaintext, receipt.projectId)) {
      addFinding(findings, 'receipt', receipt.commandId, 'delete-receipt-plaintext-invalid')
    }
  }

  findings.sort((left, right) => (
    left.recordType.localeCompare(right.recordType)
    || left.recordId.localeCompare(right.recordId)
    || left.category.localeCompare(right.category)
  ))
  return {
    ok: findings.length === 0,
    ...(projectId ? { scopeProjectId: projectId } : {}),
    checkedRecords: {
      protectedEvents,
      projectSnapshots: snapshots.length,
      completedProjectReceipts: receipts.length,
      projectKeys: keys.length,
    },
    tombstonedProjects: [...keyStates.values()].filter(state => state === 'tombstone').length,
    findings,
  }
}

function isEncryptedEnvelope(value: unknown, requiresAadFormat: boolean): boolean {
  if (!isJsonObject(value))
    return false
  const expectedKeys = requiresAadFormat
    ? ['aadFormat', 'algorithm', 'authTag', 'ciphertext', 'encrypted', 'iv', 'keyVersion']
    : ['algorithm', 'authTag', 'ciphertext', 'encrypted', 'iv', 'keyVersion']
  return hasExactKeys(value, expectedKeys)
    && value.encrypted === true
    && value.algorithm === ENCRYPTION_ALGORITHM
    && value.keyVersion === ENCRYPTION_KEY_VERSION
    && (!requiresAadFormat || value.aadFormat === CONTENT_AAD_FORMAT)
    && isCanonicalBase64(value.iv, 12)
    && isCanonicalBase64(value.authTag, 16)
    && isCanonicalBase64(value.ciphertext)
}

function isCanonicalBase64(value: unknown, byteLength?: number): boolean {
  if (typeof value !== 'string' || value.length === 0 || !/^[a-z\d+/]+={0,2}$/i.test(value))
    return false
  const decoded = Buffer.from(value, 'base64')
  return decoded.toString('base64') === value
    && (byteLength === undefined || decoded.length === byteLength)
}

function isMinimalDeleteReceipt(value: unknown, projectId: string): boolean {
  return isJsonObject(value)
    && hasExactKeys(value, ['deleted', 'deletedAt', 'id'])
    && value.deleted === true
    && value.id === projectId
    && typeof value.deletedAt === 'string'
    && !Number.isNaN(Date.parse(value.deletedAt))
}

function containsKnownPlaintext(value: unknown, knownPlaintexts: readonly string[]): boolean {
  if (knownPlaintexts.length === 0)
    return false
  const serialized = JSON.stringify(value)
  return knownPlaintexts.some(plaintext => serialized.includes(plaintext))
}

function addFinding(
  findings: EncryptionVerificationFinding[],
  recordType: EncryptionVerificationRecordType,
  recordId: string,
  category: EncryptionVerificationCategory,
): void {
  if (findings.some(finding => (
    finding.recordType === recordType
    && finding.recordId === recordId
    && finding.category === category
  ))) {
    return
  }
  findings.push({ recordType, recordId, category })
}

function hasExactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProjectArgument(args: readonly string[]): string | undefined {
  if (args.length === 0)
    return undefined
  if (args.length === 2 && args[0] === '--project' && args[1])
    return args[1]
  throw new Error('Usage: db:verify-encryption [--project <project-id>]')
}

async function runEncryptionVerificationCli(): Promise<void> {
  const report = await verifyContentEncryption(parseProjectArgument(process.argv.slice(2)))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok)
    process.exitCode = 1
  await sql.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEncryptionVerificationCli().catch(async () => {
    console.error('Content encryption verification failed')
    await sql.end()
    process.exitCode = 1
  })
}
