import type { CharacterRole, CreateCharacterInput } from '@ai-novel/shared'

export interface CharForm {
  name: string
  role: CharacterRole | ''
  goal: string
  fear: string
  secret: string
  desire: string
  weakness: string
  personality: string
  arc: string
}

export type CharacterTextField = Exclude<keyof CharForm, 'name' | 'role'>
export type RelationshipType = 'ally' | 'enemy' | 'lover' | 'family' | 'mentor' | 'rival' | 'acquaintance'

export interface CharacterRelationSuggestion {
  targetName: string
  type: RelationshipType
  strength: number
  status: string
  description: string
}

export interface CharacterCandidateInput extends CreateCharacterInput {
  relationSuggestions?: CharacterRelationSuggestion[]
}

export interface CharacterAIProposal {
  kind: 'enrich' | 'create' | 'batch_create'
  raw: string
  summary: string
  fields: Partial<Record<CharacterTextField, string>>
  candidate?: CharacterCandidateInput
  candidates?: CharacterCandidateInput[]
}

export const characterTextFields: Array<{ key: CharacterTextField, label: string }> = [
  { key: 'personality', label: '性格概括' },
  { key: 'goal', label: '当前目标' },
  { key: 'desire', label: '核心欲望' },
  { key: 'fear', label: '核心恐惧' },
  { key: 'secret', label: '灰暗秘密' },
  { key: 'weakness', label: '性格软肋' },
  { key: 'arc', label: '成长曲线' },
]

const characterRoles: CharacterRole[] = ['protagonist', 'antagonist', 'mentor', 'ally', 'supporting', 'extra']
const relationshipTypes: RelationshipType[] = ['ally', 'enemy', 'lover', 'family', 'mentor', 'rival', 'acquaintance']

function extractJSONObject(raw: string) {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  }
  catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
      }
      catch {
        return null
      }
    }
    return null
  }
}

export function normalizeAIText(value: unknown) {
  if (typeof value !== 'string')
    return ''

  return value
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeRole(value: unknown): CharacterRole | undefined {
  if (typeof value !== 'string')
    return undefined
  if (characterRoles.includes(value as CharacterRole))
    return value as CharacterRole

  const roleMap: Record<string, CharacterRole> = {
    主角: 'protagonist',
    反派: 'antagonist',
    导师: 'mentor',
    盟友: 'ally',
    配角: 'supporting',
    重要配角: 'supporting',
    群众角色: 'extra',
    路人: 'extra',
  }
  return roleMap[value.trim()]
}

function normalizeRelationshipType(value: unknown): RelationshipType {
  if (typeof value !== 'string')
    return 'acquaintance'
  if (relationshipTypes.includes(value as RelationshipType))
    return value as RelationshipType

  const typeMap: Record<string, RelationshipType> = {
    盟友: 'ally',
    朋友: 'ally',
    敌人: 'enemy',
    仇敌: 'enemy',
    恋人: 'lover',
    家人: 'family',
    血缘: 'family',
    导师: 'mentor',
    师徒: 'mentor',
    对手: 'rival',
    竞争对手: 'rival',
    熟人: 'acquaintance',
    线索关系: 'acquaintance',
  }
  return typeMap[value.trim()] || 'acquaintance'
}

function normalizeStrength(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue))
    return 3
  return Math.min(10, Math.max(1, Math.round(numberValue)))
}

function collectFields(source: Record<string, unknown> | null | undefined) {
  const fields: Partial<Record<CharacterTextField, string>> = {}
  if (!source)
    return fields

  for (const field of characterTextFields) {
    const value = normalizeAIText(source[field.key])
    if (value)
      fields[field.key] = value
  }
  return fields
}

function collectRelationSuggestions(source: Record<string, unknown> | null | undefined) {
  const relations = Array.isArray(source?.relations)
    ? source.relations
    : Array.isArray(source?.relationshipSuggestions)
      ? source.relationshipSuggestions
      : []

  return relations
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      targetName: normalizeAIText(item.targetName || item.characterName || item.target),
      type: normalizeRelationshipType(item.type),
      strength: normalizeStrength(item.strength),
      status: normalizeAIText(item.status) || '初次产生交集，关系仍待剧情推进确认。',
      description: normalizeAIText(item.description) || '由 AI 创建角色时自动生成的初始人物关系。',
    }))
    .filter(item => item.targetName.length > 0)
}

function normalizeCandidate(source: Record<string, unknown> | null | undefined, fallbackName: string): CharacterCandidateInput {
  const fields = collectFields(source)
  const name = normalizeAIText(source?.name) || fallbackName
  const role = normalizeRole(source?.role) || 'extra'
  const relationSuggestions = collectRelationSuggestions(source)

  return {
    name,
    role,
    ...fields,
    relationSuggestions,
  }
}

export function parseCharacterAIProposal(raw: string, kind: CharacterAIProposal['kind']): CharacterAIProposal {
  const json = extractJSONObject(raw)
  const summary = normalizeAIText(json?.summary) || normalizeAIText(raw)

  if (kind === 'batch_create') {
    const sources = Array.isArray(json?.characters)
      ? json.characters
      : Array.isArray(json)
        ? json
        : []
    const candidates = sources
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item, index) => normalizeCandidate(item, `AI 小角色 ${index + 1}`))
      .filter(candidate => candidate.name.trim().length > 0)

    return { kind, raw, summary, fields: {}, candidates }
  }

  if (kind === 'create') {
    const candidateSource = (json?.character && typeof json.character === 'object'
      ? json.character
      : json) as Record<string, unknown> | null
    const candidate = normalizeCandidate(candidateSource, 'AI 推荐角色')

    return { kind, raw, summary, fields: collectFields(candidateSource), candidate }
  }

  const fieldsSource = (json?.fields && typeof json.fields === 'object'
    ? json.fields
    : json) as Record<string, unknown> | null

  return { kind, raw, summary, fields: collectFields(fieldsSource) }
}
