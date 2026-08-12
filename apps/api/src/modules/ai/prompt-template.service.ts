import type { JsonObject } from '../../eventing'
import type { ProjectPromptOverrideSnapshot } from './prompt-settings.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { projectPromptOverrides, promptTemplates } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactAIOperationPayload, dispatchAIOperationCommand } from './ai-operations.commands'
import { RECORD_AI_OPERATION_COMMAND } from './ai-operations.eventing'
import {
  PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE,
  promptOverrideAggregateId,
  SET_PROJECT_PROMPT_OVERRIDE_COMMAND,
} from './prompt-settings.eventing'

export interface RenderedPrompt {
  system: string
  user: string
  version: string
}

export interface PromptOverrideInput {
  templateKey: string
  overrideSystemPrompt?: string | null
  overrideUserPromptTemplate?: string | null
  enabled?: boolean | 0 | 1
}

export function listPromptTemplates() {
  return db.select().from(promptTemplates).where(eq(promptTemplates.status, 'active'))
}

export function listProjectPromptOverrides(projectId: string) {
  return db.select().from(projectPromptOverrides).where(eq(projectPromptOverrides.projectId, projectId))
}

export interface PromptOverrideCommandOptions {
  commandId?: string
  correlationId?: string
}

type PromptOverrideCommandResult = ProjectPromptOverrideSnapshot & {
  created: boolean
}

export async function upsertProjectPromptOverride(
  projectId: string,
  input: PromptOverrideInput,
  options: PromptOverrideCommandOptions = {},
) {
  const commandId = options.commandId ?? generateId()
  const result = await commandBus.dispatch<PromptOverrideCommandResult>({
    commandId,
    commandType: SET_PROJECT_PROMPT_OVERRIDE_COMMAND,
    aggregateType: PROJECT_PROMPT_OVERRIDE_AGGREGATE_TYPE,
    aggregateId: promptOverrideAggregateId(projectId, input.templateKey),
    projectId,
    correlationId: options.correlationId ?? commandId,
    payload: compactPayload(input),
  })
  return { id: result.id, created: result.created }
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
    await dispatchAIOperationCommand(RECORD_AI_OPERATION_COMMAND, params.projectId, id, compactAIOperationPayload({ kind: 'prompt_run', data: {
      templateId: params.templateId,
      templateVersion: params.templateVersion,
      contextSnapshotId: params.contextSnapshotId || null,
      renderedPreview: params.renderedPreview || null,
    } }))
    return id
  }
}

function compactPayload(input: PromptOverrideInput): JsonObject {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  )
  if (input.enabled === 0 || input.enabled === 1)
    payload.enabled = input.enabled === 1
  return payload
}
