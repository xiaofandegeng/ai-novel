const VECTOR_SIZE = 128

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function tokenizeForEmbedding(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  const tokens = normalized.split(/\s+/).filter(Boolean)
  const chineseChars = [...text.matchAll(/\p{Script=Han}/gu)].map(match => match[0])
  const chineseBigrams: string[] = []
  for (let i = 0; i < chineseChars.length - 1; i++)
    chineseBigrams.push(`${chineseChars[i]}${chineseChars[i + 1]}`)

  return [...tokens, ...chineseBigrams].filter(token => token.length >= 2)
}

export function createLocalEmbedding(text: string): number[] {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0)
  const tokens = tokenizeForEmbedding(text)

  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % VECTOR_SIZE
    const sign = hash & 1 ? 1 : -1
    vector[index] += sign
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0)
    return vector

  return vector.map(value => Number((value / magnitude).toFixed(6)))
}

export function serializeEmbedding(vector: number[]): string {
  return JSON.stringify(vector)
}

export function parseEmbedding(value: string | null): number[] | null {
  if (!value)
    return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed))
      return null
    const vector = parsed.map(Number)
    return vector.length === VECTOR_SIZE && vector.every(Number.isFinite) ? vector : null
  }
  catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    return 0
  let dot = 0
  let left = 0
  let right = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    left += a[i] * a[i]
    right += b[i] * b[i]
  }
  if (left === 0 || right === 0)
    return 0
  return dot / (Math.sqrt(left) * Math.sqrt(right))
}

export function buildEmbeddingText(input: {
  title?: string | null
  summary?: string | null
  techniques?: string | null
  tags?: string | null
}) {
  return [
    input.title,
    input.summary,
    input.techniques,
    input.tags,
  ].filter(Boolean).join('\n')
}
