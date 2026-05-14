import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { promptTemplateRuns, promptTemplates } from '../db/schema'
import { generateId, now } from '../utils'

export class PromptTemplateService {
  static async getActiveTemplate(taskType: string) {
    const [template] = await db
      .select()
      .from(promptTemplates)
      .where(
        and(
          eq(promptTemplates.taskType, taskType),
          eq(promptTemplates.status, 'active'),
        ),
      )
      .orderBy(desc(promptTemplates.version))
      .limit(1)

    return template
  }

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

  static async createTemplate(params: {
    name: string
    taskType: string
    version: string
    content: string
    variablesSchema?: any
  }) {
    const id = generateId()
    const timestamp = now()
    await db.insert(promptTemplates).values({
      id,
      name: params.name,
      taskType: params.taskType,
      version: params.version,
      content: params.content,
      variablesSchema: params.variablesSchema || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }
}
