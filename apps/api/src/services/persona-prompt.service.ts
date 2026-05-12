import type { AIScene } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projectPersonaConfigs, workStyleReports } from '../db/schema'
import * as personaCrudService from './persona-crud.service'

export function buildPersonaInjectionPrompt(
  persona: {
    sourceTrainingSetId?: string | null
    coreAppeal: string | null
    pacingRules: string | null
    conflictRules: string | null
    characterRules: string | null
    languageRules: string | null
    chapterRules: string | null
    hookRules: string | null
    forbiddenRules: string | null
    similarityGuardrails: string | null
  },
  strength: number,
): string {
  if (strength <= 30) {
    return `参考以下写作人格的高层原则，但优先保持当前小说已有风格：\n核心爽点：${persona.coreAppeal || '无'}\n禁止事项：${persona.forbiddenRules || '无'}`
  }

  if (strength <= 60) {
    return `请参考以下节奏和章节结构，但不要明显模仿语言：\n节奏规则：${persona.pacingRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}`
  }

  if (strength <= 80) {
    return `本次生成应明显遵循该写作人格：\n核心爽点：${persona.coreAppeal || '无'}\n节奏规则：${persona.pacingRules || '无'}\n冲突规则：${persona.conflictRules || '无'}\n人物规则：${persona.characterRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}\n禁止事项：${persona.forbiddenRules || '无'}`
  }

  return `强烈采用该人格的节奏、冲突和章节结构，但不得复刻参考作品的具体桥段、专名、连续表达或标志性场景。\n核心爽点：${persona.coreAppeal || '无'}\n节奏规则：${persona.pacingRules || '无'}\n冲突规则：${persona.conflictRules || '无'}\n人物规则：${persona.characterRules || '无'}\n语言规则：${persona.languageRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}\n禁止事项：${persona.forbiddenRules || '无'}\n相似度防护：${persona.similarityGuardrails || '无'}\n生成后必须自检相似度风险。`
}

async function buildReferenceTechniqueMemory(trainingSetId?: string | null): Promise<string> {
  if (!trainingSetId)
    return ''

  const reports = await db
    .select({
      coreAppeal: workStyleReports.coreAppeal,
      pacingModel: workStyleReports.pacingModel,
      hookModel: workStyleReports.hookModel,
      conflictModel: workStyleReports.conflictModel,
      characterModel: workStyleReports.characterModel,
      languageProfile: workStyleReports.languageProfile,
      chapterTemplate: workStyleReports.chapterTemplate,
      strengths: workStyleReports.strengths,
      avoidCopying: workStyleReports.avoidCopying,
    })
    .from(workStyleReports)
    .where(eq(workStyleReports.trainingSetId, trainingSetId))
    .limit(5)

  if (reports.length === 0)
    return ''

  const lines = reports.map((report, index) => {
    const parts = [
      report.coreAppeal ? `爽点: ${report.coreAppeal}` : null,
      report.pacingModel ? `节奏: ${report.pacingModel}` : null,
      report.hookModel ? `钩子: ${report.hookModel}` : null,
      report.conflictModel ? `冲突: ${report.conflictModel}` : null,
      report.characterModel ? `人物: ${report.characterModel}` : null,
      report.languageProfile ? `语言: ${report.languageProfile}` : null,
      report.chapterTemplate ? `章节模板: ${report.chapterTemplate}` : null,
      report.strengths ? `可借鉴强项: ${report.strengths}` : null,
      report.avoidCopying ? `禁止复刻: ${report.avoidCopying}` : null,
    ].filter(Boolean)

    return `作品报告 ${index + 1}: ${parts.join('；')}`
  })

  return `\n\n参考作品抽象技巧记忆：\n${lines.join('\n')}\n注意：以上只允许作为抽象技法参考，不得输出参考作品原文、专名、具体桥段或连续表达。`
}

export async function buildPersonaPromptForProject(
  projectId: string,
  scene: AIScene,
): Promise<string | null> {
  const [config] = await db
    .select()
    .from(projectPersonaConfigs)
    .where(eq(projectPersonaConfigs.projectId, projectId))

  if (!config)
    return null

  const persona = await personaCrudService.getPersona(config.personaId)
  if (!persona || persona.status !== 'published')
    return null

  // chat is free-form chat, should not inject persona by default
  if (scene === 'chat')
    return null

  // Check scene-specific enabled switches
  if (scene === 'outline' && !config.enabledForOutline)
    return null
  if (scene === 'draft' && !config.enabledForDraft)
    return null
  if (scene === 'polish' && !config.enabledForPolish)
    return null
  if (scene === 'quality' && !config.enabledForQualityReview)
    return null

  const basePrompt = buildPersonaInjectionPrompt(persona, config.strength)
  const referenceMemory = await buildReferenceTechniqueMemory(persona.sourceTrainingSetId)
  return `${basePrompt}${referenceMemory}`
}
