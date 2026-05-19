import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterPostprocessSuggestions, chapters, characterRelationships, characters } from '../db/schema'
import { normalizeCharacterPair } from './character-utils.service'
import { createSuggestion } from './postprocess-suggestion.service'

interface AutoLinkResult {
  suggestionsCreated: number
  message: string
}

interface RelationshipDraft {
  type: string
  strength: number
  status: string
  description: string
}

type CharacterRow = typeof characters.$inferSelect

function inferRelationshipDraft(source: CharacterRow, target: CharacterRow): RelationshipDraft {
  const sourceRole = source.role || 'supporting'
  const targetRole = target.role || 'supporting'

  if (
    (sourceRole === 'protagonist' && targetRole === 'antagonist')
    || (sourceRole === 'antagonist' && targetRole === 'protagonist')
  ) {
    return {
      type: 'enemy',
      strength: 7,
      status: '核心对立关系，具体冲突需要在后续章节中确认。',
      description: `${source.name} 与 ${target.name} 的身份定位天然形成对立，应进入矛盾矩阵或后续章节验证。`,
    }
  }

  if (sourceRole === 'ally' || targetRole === 'ally') {
    return {
      type: 'ally',
      strength: 5,
      status: '潜在协作关系，等待剧情确认具体互动。',
      description: `${source.name} 与 ${target.name} 可作为同阵营或阶段性协作关系处理。`,
    }
  }

  if (sourceRole === 'mentor' || targetRole === 'mentor') {
    return {
      type: 'mentor',
      strength: 5,
      status: '潜在引导关系，等待剧情确认影响方向。',
      description: `${source.name} 与 ${target.name} 之间可能存在指导、规训或价值观影响。`,
    }
  }

  if (sourceRole === 'extra' || targetRole === 'extra') {
    return {
      type: 'acquaintance',
      strength: 2,
      status: '功能性登场关系，避免小角色游离于主线之外。',
      description: `${source.name} 与 ${target.name} 的初始关系由系统补齐，用于确保新角色能挂接到现有人物网。`,
    }
  }

  return {
    type: 'acquaintance',
    strength: 3,
    status: '新建立的潜在关系，等待剧情确认。',
    description: `${source.name} 与 ${target.name} 尚未形成明确关系，但应在后续章节中确认其互动位置。`,
  }
}

function rankTargets(newCharacter: CharacterRow, candidates: CharacterRow[]) {
  const rolePriority: Record<string, number> = {
    protagonist: 0,
    antagonist: 1,
    ally: 2,
    mentor: 3,
    supporting: 4,
    extra: 5,
  }

  return [...candidates].sort((a, b) => {
    const aRole = a.role || 'supporting'
    const bRole = b.role || 'supporting'

    if (newCharacter.role === 'antagonist') {
      if (aRole === 'protagonist' && bRole !== 'protagonist')
        return -1
      if (bRole === 'protagonist' && aRole !== 'protagonist')
        return 1
    }

    return (rolePriority[aRole] ?? 9) - (rolePriority[bRole] ?? 9)
  })
}

function hasPendingRelationshipSuggestion(payloads: Array<Record<string, unknown>>, leftId: string, rightId: string) {
  return payloads.some((payload) => {
    const aId = typeof payload.characterAId === 'string' ? payload.characterAId : ''
    const bId = typeof payload.characterBId === 'string' ? payload.characterBId : ''
    return (aId === leftId && bId === rightId) || (aId === rightId && bId === leftId)
  })
}

async function getPendingRelationshipPayloads(projectId: string) {
  const rows = await db.select().from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.suggestionType, 'relationship_update'),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ))

  return rows.flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>
      return [payload]
    }
    catch {
      return []
    }
  })
}

export async function autoLinkCharacterToGraph(projectId: string, characterId: string): Promise<AutoLinkResult> {
  const [newCharacter] = await db.select().from(characters).where(and(
    eq(characters.projectId, projectId),
    eq(characters.id, characterId),
  ))

  if (!newCharacter)
    return { suggestionsCreated: 0, message: '角色不存在，无法自动关联关系网' }

  const [anchorChapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.projectId, projectId))
    .orderBy(desc(chapters.updatedAt))
    .limit(1)

  if (!anchorChapter)
    return { suggestionsCreated: 0, message: '请先创建至少一个章节，系统才能生成待处理关系建议' }

  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const candidates = allCharacters.filter(c => c.id !== characterId)
  if (candidates.length === 0)
    return { suggestionsCreated: 0, message: '角色数量不足，暂不需要自动关联' }

  const existingRelationships = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const existingPairs = new Set(existingRelationships.map((rel) => {
    const [left, right] = normalizeCharacterPair(rel.characterAId, rel.characterBId)
    return `${left}:${right}`
  }))
  const pendingPayloads = await getPendingRelationshipPayloads(projectId)

  let suggestionsCreated = 0
  const maxSuggestions = newCharacter.role === 'extra' ? 1 : 3
  const targets = rankTargets(newCharacter, candidates)

  for (const target of targets) {
    if (suggestionsCreated >= maxSuggestions)
      break

    const [left, right] = normalizeCharacterPair(newCharacter.id, target.id)
    if (existingPairs.has(`${left}:${right}`))
      continue
    if (hasPendingRelationshipSuggestion(pendingPayloads, newCharacter.id, target.id))
      continue

    const draft = inferRelationshipDraft(newCharacter, target)
    await createSuggestion(projectId, anchorChapter.id, null, 'relationship_update', {
      characterAId: newCharacter.id,
      characterBId: target.id,
      characterAName: newCharacter.name,
      characterBName: target.name,
      type: draft.type,
      strength: draft.strength,
      status: draft.status,
      description: draft.description,
      sourceType: 'auto_inferred',
      inferenceRule: 'new_character_auto_link',
      reason: '系统在新增角色后自动补齐人物关系候选，避免角色游离于关系网之外。',
    }, newCharacter.role === 'extra' ? 55 : 65, `新增角色：${newCharacter.name} 与 ${target.name} 的初始关系候选`)
    suggestionsCreated += 1
  }

  return {
    suggestionsCreated,
    message: suggestionsCreated > 0
      ? `已生成 ${suggestionsCreated} 条待处理人物关系建议`
      : '没有发现需要新增的人物关系建议',
  }
}
