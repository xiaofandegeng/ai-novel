import type { StoryStructureCommandOptions } from './story-structure.commands'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { acts, chapters, storyStructureTemplates } from '../../db/schema'
import { dispatchStoryStructureCommand } from './story-structure.commands'
import { APPLY_STRUCTURE_TEMPLATE_COMMAND } from './story-structure.eventing'

export class StoryStructureService {
  static async listTemplates(genre?: string) {
    if (genre)
      return db.select().from(storyStructureTemplates).where(eq(storyStructureTemplates.genre, genre))
    return db.select().from(storyStructureTemplates)
  }

  static async applyTemplate(
    projectId: string,
    templateId: string,
    options: StoryStructureCommandOptions = {},
  ) {
    const result = await dispatchStoryStructureCommand<{ actIds: string[] }>(
      APPLY_STRUCTURE_TEMPLATE_COMMAND,
      projectId,
      { templateId },
      options,
    )
    return result.actIds
  }

  /**
   * 获取项目的结构上下文，用于 AI 提示词注入
   */
  static async getProjectStructureContext(projectId: string, chapterId?: string) {
    const allActs = await db.select().from(acts).where(eq(acts.projectId, projectId)).orderBy(acts.orderIndex)

    let currentAct = null
    let nextAct = null
    let progressInAct = ''

    if (chapterId) {
      const [chapter] = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, chapterId)))
      if (chapter && chapter.volumeId) {
        // 这里可以进一步根据章节在卷中的位置定位所在的幕
        // 简化实现：根据章节序号和幕的目标章节数估算
        const chaptersBefore = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.volumeId, chapter.volumeId)))
        const chapterIndex = chaptersBefore.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0)).findIndex(c => c.id === chapterId)

        let currentCount = 0
        for (let i = 0; i < allActs.length; i++) {
          const act = allActs[i]
          const actTotal = act.targetChapterCount || 10
          if (chapterIndex >= currentCount && chapterIndex < currentCount + actTotal) {
            currentAct = act
            nextAct = allActs[i + 1] || null
            progressInAct = `${chapterIndex - currentCount + 1} / ${actTotal}`
            break
          }
          currentCount += actTotal
        }
      }
    }

    return {
      allActs: allActs.map(a => ({ title: a.title, description: a.description })),
      currentAct: currentAct ? { title: currentAct.title, description: currentAct.description, progress: progressInAct } : null,
      nextAct: nextAct ? { title: nextAct.title, description: nextAct.description } : null,
    }
  }
}
