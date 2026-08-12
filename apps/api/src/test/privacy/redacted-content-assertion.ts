export type ProtectedRecordType = 'event' | 'receipt' | 'snapshot'

export interface ProtectedRecordProbe {
  recordType: ProtectedRecordType
  recordId: string
  value: unknown
}

interface RedactedPlaintextFinding {
  category: 'known-plaintext-found'
  recordId: string
  recordType: ProtectedRecordType
}

export function assertNoKnownPlaintext(
  records: readonly ProtectedRecordProbe[],
  knownPlaintexts: readonly string[],
): void {
  const probes = knownPlaintexts.filter(probe => probe.length > 0)
  const findings = records.flatMap(record => (
    containsKnownPlaintext(record.value, probes)
      ? [{
          category: 'known-plaintext-found' as const,
          recordId: record.recordId,
          recordType: record.recordType,
        }]
      : []
  ))
  if (findings.length === 0)
    return
  throw new Error(`Protected content scan failed: ${formatFindings(findings)}`)
}

function containsKnownPlaintext(value: unknown, knownPlaintexts: readonly string[]): boolean {
  const pending = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === 'string') {
      if (knownPlaintexts.some(plaintext => current.includes(plaintext)))
        return true
      continue
    }
    if (Array.isArray(current)) {
      pending.push(...current)
      continue
    }
    if (typeof current === 'object' && current !== null)
      pending.push(...Object.values(current))
  }
  return false
}

function formatFindings(findings: readonly RedactedPlaintextFinding[]): string {
  return findings
    .map(finding => `${finding.recordType}/${finding.recordId}/${finding.category}`)
    .join(', ')
}
