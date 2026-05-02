import type { AIScene } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projectPersonaConfigs } from '../db/schema'
import * as personaService from './persona.service'

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

  const persona = await personaService.getPersona(config.personaId)
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

  const strength = config.strength

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
