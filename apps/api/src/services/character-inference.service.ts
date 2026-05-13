import { eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, characterRelationships, characters } from '../db/schema'
import { callAIJSON } from './ai.service'
import { createSuggestion } from './postprocess-suggestion.service'

export async function inferRelationshipsFromBios(projectId: string) {
  // 1. 获取所有角色
  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
  if (allCharacters.length < 2) {
    return { suggestionsCreated: 0, message: '角色数量不足，无法推导关系网' }
  }

  // 2. 获取现有关系，用于去重
  const existingRels = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))

  // 3. 构建 AI 提示词
  const characterBios = allCharacters.map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    personality: c.personality,
    goal: c.goal,
    secret: c.secret,
    desire: c.desire,
    weakness: c.weakness,
  }))

  // 4. 获取一个有效的 chapterId 用于存放建议（因为 suggestion 表目前强制要求 chapterId）
  const [latestChapter] = await db.select().from(chapters).where(eq(chapters.projectId, projectId)).limit(1)
  if (!latestChapter) {
    return { suggestionsCreated: 0, message: '请先创建至少一个章节，以便存放推导出的建议' }
  }
  const chapterId = latestChapter.id

  const prompt = `你是一位专业的剧作分析师。请根据以下角色资料，分析他们之间潜在的人物关系网。
请识别出那些逻辑上必然存在、或者根据背景设定暗示的关系（如：宿敌、亲友、上下级、暗恋等）。

【角色资料】
${JSON.stringify(characterBios, null, 2)}

【输出要求】
1. 只输出那些在资料中有明确根据或强烈暗示的关系。
2. 返回严格的 JSON 格式列表。
3. 如果 A 与 B 之间有相互的影响（例如 A 崇拜 B，而 B 利用 A），请分别作为两条关系输出。
4. type 字段请直接使用中文。

【返回格式】
{
  "suggestions": [
    {
      "characterAId": "ID1",
      "characterAName": "名字1",
      "characterBId": "ID2",
      "characterBName": "名字2",
      "type": "关系类型(如: 宿敌, 盟友, 亲人, 导师, 恋人, 竞争对手, 受害者, 操纵者等)",
      "strength": 1-10 (数字),
      "status": "当前状态简述",
      "description": "详细的关系描述和推导理由"
    }
  ]
}

注意：
1. 只返回你认为高度确信的关系。
2. 即使已经存在 A->B 的关系，如果存在反向的 B->A 关系且意义不同，也可以输出。`

  const aiResult = await callAIJSON<{
    suggestions: Array<{
      characterAId: string
      characterAName: string
      characterBId: string
      characterBName: string
      type: string
      strength: number
      status: string
      description: string
    }>
  }>([{ role: 'user', content: prompt }], { temperature: 30 })

  let suggestionsCreated = 0
  const suggestions = aiResult.suggestions || []

  for (const s of suggestions) {
    // 基础校验
    if (!s.characterAId || !s.characterBId || s.characterAId === s.characterBId)
      continue

    // 检查是否已存在（仅完全相同的 A->B 去重）
    if (existingRels.some(r => r.characterAId === s.characterAId && r.characterBId === s.characterBId))
      continue

    // 创建建议
    await createSuggestion(projectId, chapterId, null, 'relationship_update', {
      characterAId: s.characterAId,
      characterBId: s.characterBId,
      characterAName: s.characterAName,
      characterBName: s.characterBName,
      type: s.type,
      strength: s.strength,
      status: s.status,
      description: s.description,
      sourceType: 'auto_inferred',
      inferenceRule: 'bio_analysis',
      reason: '系统通过角色档案分析自动推导',
    }, 60, `档案分析：${s.characterAName} 与 ${s.characterBName} 的潜在关系`)

    suggestionsCreated++
  }

  return { suggestionsCreated, message: `推导完成，生成了 ${suggestionsCreated} 条关系建议` }
}
