import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { projectPromptOverrides, promptTemplateRuns, promptTemplates } from '../../db/schema'
import { generateId, now } from '../../shared/utils'

export interface RenderedPrompt {
  system: string
  user: string
  version: string
}

export interface PromptOverrideInput {
  templateKey: string
  overrideSystemPrompt?: string | null
  overrideUserPromptTemplate?: string | null
  enabled?: boolean
}

export function listPromptTemplates() {
  return db.select().from(promptTemplates).where(eq(promptTemplates.status, 'active'))
}

export function listProjectPromptOverrides(projectId: string) {
  return db.select().from(projectPromptOverrides).where(eq(projectPromptOverrides.projectId, projectId))
}

export async function upsertProjectPromptOverride(projectId: string, input: PromptOverrideInput) {
  const [existing] = await db
    .select()
    .from(projectPromptOverrides)
    .where(and(
      eq(projectPromptOverrides.projectId, projectId),
      eq(projectPromptOverrides.templateKey, input.templateKey),
    ))
    .limit(1)

  if (existing) {
    await db.update(projectPromptOverrides).set({
      overrideSystemPrompt: input.overrideSystemPrompt,
      overrideUserPromptTemplate: input.overrideUserPromptTemplate,
      enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
      updatedAt: now(),
    }).where(eq(projectPromptOverrides.id, existing.id))
    return { id: existing.id, created: false }
  }

  const id = generateId()
  const timestamp = now()
  await db.insert(projectPromptOverrides).values({
    id,
    projectId,
    templateKey: input.templateKey,
    overrideSystemPrompt: input.overrideSystemPrompt,
    overrideUserPromptTemplate: input.overrideUserPromptTemplate,
    enabled: input.enabled ? 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return { id, created: true }
}

export class PromptTemplateService {
  /**
   * 获取模板，优先使用项目的覆盖设置
   */
  static async getTemplate(key: string, projectId: string): Promise<RenderedPrompt | null> {
    const [template] = await db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.key, key), eq(promptTemplates.status, 'active')))
      .limit(1)

    if (!template)
      return null

    const [override] = await db
      .select()
      .from(projectPromptOverrides)
      .where(
        and(
          eq(projectPromptOverrides.projectId, projectId),
          eq(projectPromptOverrides.templateKey, key),
          eq(projectPromptOverrides.enabled, 1),
        ),
      )
      .limit(1)

    return {
      system: override?.overrideSystemPrompt || template.systemPrompt || '',
      user: override?.overrideUserPromptTemplate || template.userPromptTemplate || '',
      version: template.version,
    }
  }

  /**
   * 渲染模板，替换 {{variable}}
   */
  static render(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match
    })
  }

  /**
   * 记录提示词运行记录
   */
  static async recordRun(params: {
    projectId: string
    templateId: string
    templateVersion: string
    contextSnapshotId?: string | null
    renderedPreview?: string | null
  }) {
    const id = generateId()
    await db.insert(promptTemplateRuns).values({
      id,
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      contextSnapshotId: params.contextSnapshotId || null,
      renderedPreview: params.renderedPreview || null,
    })
    return id
  }
}
