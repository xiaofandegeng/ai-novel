import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  referenceTrainingSets,
  workStyleReports,
  writingPersonas,
} from '../db/schema'
import { fail, generateId, now } from '../utils'
import { callAIJSON } from './ai.service'

// ─── Writing Persona (Phase 5) ───

export async function listPersonas() {
  return db.select().from(writingPersonas)
}

export async function getPersona(personaId: string) {
  const [row] = await db.select().from(writingPersonas).where(eq(writingPersonas.id, personaId))
  return row || null
}

export async function createPersona(input: { name: string, description?: string, genre?: string }) {
  const row = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || null,
    status: 'draft' as const,
  }
  await db.insert(writingPersonas).values(row)
  return row
}

export async function updatePersona(personaId: string, input: Record<string, unknown>) {
  const fields: Record<string, unknown> = { updatedAt: now() }
  for (const key of ['name', 'description', 'genre', 'status', 'coreAppeal', 'pacingRules', 'conflictRules', 'characterRules', 'languageRules', 'chapterRules', 'hookRules', 'forbiddenRules', 'similarityGuardrails']) {
    if (input[key] !== undefined)
      fields[key] = input[key]
  }
  const [row] = await db.update(writingPersonas).set(fields).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

export async function deletePersona(personaId: string) {
  const [row] = await db.delete(writingPersonas).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

export async function generatePersonaFromTrainingSet(trainingSetId: string, input: { name: string, description?: string, genre?: string }) {
  const trainingSet = await db.select().from(referenceTrainingSets).where(eq(referenceTrainingSets.id, trainingSetId)).then(r => r[0])
  if (!trainingSet)
    return fail('训练集不存在')

  // Get all style reports for this training set
  const reports = await db.select().from(workStyleReports).where(eq(workStyleReports.trainingSetId, trainingSetId))
  if (reports.length === 0)
    return fail('训练集尚无作品风格报告，请先分析作品')

  const reportsSummary = reports.map((r, i) => `作品${i + 1}: 核心爽点=${r.coreAppeal || '未知'}, 节奏=${r.pacingModel || '未知'}, 冲突=${r.conflictModel || '未知'}, 优点=${r.strengths || '未知'}`).join('\n')

  const prompt = `你是一位专业的写作风格融合专家。请根据以下多本作品的风格报告，融合成一个可复用的写作人格。
人格必须学习结构、节奏和技巧，但严禁复刻原文表达或桥段。
返回严格 JSON，不要 markdown。

训练集：${trainingSet.name}
作品数：${reports.length}

风格报告摘要：
${reportsSummary}

请返回以下 JSON 格式：
{
  "coreAppeal": "核心爽点",
  "pacingRules": "节奏规则",
  "conflictRules": "冲突规则",
  "characterRules": "人物规则",
  "languageRules": "语言规则",
  "chapterRules": "章节结构规则",
  "hookRules": "结尾钩子规则",
  "forbiddenRules": "禁止事项",
  "similarityGuardrails": "避免过度相似的规则"
}`

  const parsed = await callAIJSON<Record<string, any>>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )

  const persona = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || trainingSet.genre || null,
    sourceTrainingSetId: trainingSetId,
    status: 'draft' as const,
    coreAppeal: parsed.coreAppeal || null,
    pacingRules: parsed.pacingRules || null,
    conflictRules: parsed.conflictRules || null,
    characterRules: parsed.characterRules || null,
    languageRules: parsed.languageRules || null,
    chapterRules: parsed.chapterRules || null,
    hookRules: parsed.hookRules || null,
    forbiddenRules: parsed.forbiddenRules || null,
    similarityGuardrails: parsed.similarityGuardrails || null,
  }

  await db.insert(writingPersonas).values(persona)

  // Update training set status
  await db.update(referenceTrainingSets).set({ status: 'ready', updatedAt: now() }).where(eq(referenceTrainingSets.id, trainingSetId))

  return persona
}

export async function publishPersona(personaId: string) {
  const persona = await getPersona(personaId)
  if (!persona)
    return fail('人格不存在')
  if (!persona.coreAppeal)
    return fail('人格内容不完整，请先生成人格规则')

  const [row] = await db.update(writingPersonas).set({ status: 'published', updatedAt: now() }).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

export async function listPublishedPersonas() {
  return db.select().from(writingPersonas).where(eq(writingPersonas.status, 'published'))
}
