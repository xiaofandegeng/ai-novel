import type {
  AutomationCockpitPayload,
  CockpitChapterDetail,
  CockpitChapterProgress,
  CockpitChapterStep,
  CockpitCharacterState,
  CockpitConflictState,
  CockpitForeshadowingState,
  CockpitHealthRiskRepairInput,
  CockpitHealthRiskRepairResult,
  CockpitHealthSummary,
  CockpitNarrativeEvent,
  CockpitPlotDirection,
  CockpitProjectSummary,
  CockpitRelationshipState,
  CockpitRunSummary,
} from '@ai-novel/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import {
  autonomousRunJobs,
  autonomousWritingRuns,
  chapterChangeSetItems,
  chapterMemories,
  chapters,
  chapterScenes,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  projectHealthReports,
  writingJobSteps,
} from '../../db/schema'
import { buildGlobalNarrativeControl } from '../ai/narrative-control.service'
import { autoPlanScenesForChapter } from './auto-repair.service'
import { createAutonomousRun, startAutonomousRun } from './autonomous-writing.service'

const STEP_LABEL_MAP: Record<string, string> = {
  prepare_context: '构建上下文',
  generate_plan: '生成大纲',
  validate_plan: '大纲校验',
  generate_draft: '生成正文',
  generate_scene_draft: '生成场景正文',
  consistency_check: '一致性检查',
  apply_draft: '应用草稿',
  save_version: '保存版本',
  postprocess: '章后分析',
  classify_suggestions: '分析建议',
  apply_suggestions: '同步台账',
  update_health: '更新健康指标',
  build_change_set: '构建变更集',
  evaluate_change_set: '评估变更集',
  apply_change_set: '写回正文',
  auto_repair: '自动修复',
  done: '完成',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function textField(payload: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }
  return fallback
}

function numberField(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'number' && Number.isFinite(value))
      return value
  }
  return null
}

interface StoredHealthRisk {
  id?: string
  type?: string
  chapterId?: string | null
  severity?: 'high' | 'medium' | 'low'
  title?: string
  actionLabel?: string
  targetRoute?: string
}

function isStoredHealthRisk(value: unknown): value is StoredHealthRisk {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class AutomationCockpitService {
  private static extractChapterIdFromRisk(risk: { id?: string, chapterId?: string | null, targetRoute?: string }): string | null {
    if (risk.chapterId)
      return risk.chapterId

    if (risk.id) {
      const parts = risk.id.split(':')
      if (parts[1])
        return parts[1]
    }

    if (risk.targetRoute) {
      const match = risk.targetRoute.match(/[?&]chapter=([^&]+)/)
      if (match?.[1])
        return decodeURIComponent(match[1])
    }

    return null
  }

  private static getRiskFixMeta(risk: { type?: string, chapterId?: string | null }) {
    if (!risk.chapterId)
      return { fixAction: 'none' as const, fixLabel: undefined }

    if (risk.type === 'scene') {
      return {
        fixAction: 'auto_plan_scenes' as const,
        fixLabel: '一键规划场景',
      }
    }

    return {
      fixAction: 'autonomous_chapter_repair' as const,
      fixLabel: '一键自动修复',
    }
  }

  static async repairHealthRisk(
    projectId: string,
    input: CockpitHealthRiskRepairInput,
  ): Promise<CockpitHealthRiskRepairResult> {
    const chapterId = input.chapterId || this.extractChapterIdFromRisk({
      id: input.riskId,
      chapterId: input.chapterId,
    })

    if (!chapterId) {
      throw new Error('该风险缺少章节定位，暂无法自动修复。')
    }

    const [chapter] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))
      .limit(1)

    if (!chapter) {
      throw new Error('未找到该项目下的风险章节，无法自动修复。')
    }

    if (input.riskType === 'scene' || input.riskId?.startsWith('scene:')) {
      await autoPlanScenesForChapter(projectId, chapterId)
      return {
        action: 'auto_plan_scenes',
        chapterId,
        message: '已完成章节场景规划，并同步刷新健康指标。',
      }
    }

    const run = await createAutonomousRun(projectId, {
      strategy: 'safe',
      scopeType: 'rewrite_selected',
      startChapterId: chapterId,
      endChapterId: chapterId,
      targetChapterCount: 1,
      targetWordsPerChapter: Math.max(1200, Math.min(5000, chapter.draft?.length || 3000)),
    })
    await startAutonomousRun(projectId, run.id)

    return {
      action: 'autonomous_chapter_repair',
      chapterId,
      runId: run.id,
      message: '已启动该章节的自动修复任务，修复会同步进入驾驶舱流水线。',
    }
  }

  static async getCockpitData(projectId: string): Promise<AutomationCockpitPayload> {
    // 1. 获取项目基本信息
    const [projectRecord] = await db
      .select()
      .from(novelProjects)
      .where(eq(novelProjects.id, projectId))
      .limit(1)

    if (!projectRecord) {
      throw new Error('Project not found')
    }

    // 2. 获取所有的章节，以便计算项目总字数，并作为章节流水线底座
    const allChapters = await db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.chapterNumber)

    let totalWords = 0
    for (const ch of allChapters) {
      totalWords += ch.draft?.length || 0
    }

    const projectSummary: CockpitProjectSummary = {
      id: projectRecord.id,
      title: projectRecord.title,
      genre: projectRecord.genre || undefined,
      theme: projectRecord.theme || undefined,
      targetWordCount: projectRecord.targetWords || undefined,
      currentWordCount: totalWords,
    }

    // 3. 获取最新的一次自动写作运行任务 (Run)
    const [latestRunRecord] = await db
      .select()
      .from(autonomousWritingRuns)
      .where(eq(autonomousWritingRuns.projectId, projectId))
      .orderBy(desc(autonomousWritingRuns.createdAt))
      .limit(1)

    let runSummary: CockpitRunSummary | null = null
    let activeRunId: string | null = null

    if (latestRunRecord) {
      runSummary = {
        id: latestRunRecord.id,
        status: latestRunRecord.status,
        strategy: latestRunRecord.strategy,
        targetChapterCount: latestRunRecord.targetChapterCount || 0,
        completedChapterCount: latestRunRecord.completedChapterCount || 0,
        currentChapterId: latestRunRecord.currentChapterId || undefined,
        startedAt: latestRunRecord.startedAt || undefined,
        finishedAt: latestRunRecord.finishedAt || undefined,
      }
      activeRunId = latestRunRecord.id
    }

    // 4. 章节推进流水线 (Chapters Progress)
    // 只有当有运行中的 Run 或者是最近的 Run 时，查询其关联的任务与步骤
    let runJobs: Array<typeof autonomousRunJobs.$inferSelect> = []
    const stepsByJobId: Record<string, Array<typeof writingJobSteps.$inferSelect>> = {}

    if (activeRunId) {
      runJobs = await db
        .select()
        .from(autonomousRunJobs)
        .where(eq(autonomousRunJobs.runId, activeRunId))
        .orderBy(autonomousRunJobs.orderIndex)

      const jobIds = runJobs.map(j => j.writingJobId)
      if (jobIds.length > 0) {
        const allSteps = await db
          .select()
          .from(writingJobSteps)
          .where(inArray(writingJobSteps.jobId, jobIds))
          .orderBy(writingJobSteps.createdAt)

        for (const step of allSteps) {
          if (!stepsByJobId[step.jobId]) {
            stepsByJobId[step.jobId] = []
          }
          stepsByJobId[step.jobId].push(step)
        }
      }
    }

    const jobMapByChapterId = new Map<string, typeof autonomousRunJobs.$inferSelect>()
    for (const job of runJobs) {
      if (job.chapterId) {
        jobMapByChapterId.set(job.chapterId, job)
      }
    }

    const chapterProgressList: CockpitChapterProgress[] = allChapters.map((ch) => {
      const associatedJob = jobMapByChapterId.get(ch.id)
      if (associatedJob) {
        const steps = stepsByJobId[associatedJob.writingJobId] || []
        const cockpitSteps: CockpitChapterStep[] = steps.map(s => ({
          key: s.stepType,
          label: STEP_LABEL_MAP[s.stepType] || s.stepType,
          status: s.status,
          error: s.error || undefined,
          startedAt: s.startedAt || undefined,
          finishedAt: s.finishedAt || undefined,
        }))

        return {
          id: ch.id,
          title: ch.title,
          orderIndex: ch.chapterNumber,
          status: associatedJob.status,
          wordCount: ch.draft?.length || 0,
          steps: cockpitSteps,
        }
      }
      else {
        // 如果没有在这个运行任务中，则表示它是普通历史章节
        return {
          id: ch.id,
          title: ch.title,
          orderIndex: ch.chapterNumber,
          status: ch.status === 'completed' ? 'completed' : 'pending',
          wordCount: ch.draft?.length || 0,
          steps: [],
        }
      }
    })

    // 5. 角色状态 (Characters)
    const characterRecords = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))

    // 映射角色 ID -> 名字，方便给关系和事件使用
    const charNameMap = new Map<string, string>()
    for (const c of characterRecords) {
      charNameMap.set(c.id, c.name)
    }

    const cockpitCharacters: CockpitCharacterState[] = characterRecords.map(c => ({
      id: c.id,
      name: c.name,
      role: c.role || null,
      emotion: '平静', // 默认初值，下面会从回写事件中更新最新的
      goal: c.goal || null,
      fear: c.fear || null,
      secret: c.secret || null,
      weakness: c.weakness || null,
      personality: c.personality || null,
      relationshipPressure: '正常',
      lastChangedChapterId: null,
      confidence: 0.85,
    }))

    // 6. 角色关系 (Relationships)
    const relationshipRecords = await db
      .select()
      .from(characterRelationships)
      .where(eq(characterRelationships.projectId, projectId))

    const cockpitRelationships: CockpitRelationshipState[] = relationshipRecords.map(r => ({
      id: r.id,
      sourceCharacterId: r.characterAId,
      targetCharacterId: r.characterBId,
      sourceName: charNameMap.get(r.characterAId) || '未知',
      targetName: charNameMap.get(r.characterBId) || '未知',
      type: r.type,
      intimacy: r.strength, // 强度作为亲密度
      trust: r.status === 'stable' ? 8 : 5, // 状态简易推导
      conflict: r.status === 'conflict' ? 8 : 2,
      recentChange: r.description || null,
      lastChangedChapterId: null,
    }))

    // 7. 矛盾矩阵 (Conflicts)
    const conflictRecords = await db
      .select()
      .from(conflicts)
      .where(eq(conflicts.projectId, projectId))

    const cockpitConflicts: CockpitConflictState[] = conflictRecords.map(c => ({
      id: c.id,
      title: c.title,
      type: c.type,
      intensity: c.intensity,
      status: c.status,
      participants: c.participants || null,
      participantIds: c.participantIds || null,
      description: c.description || null,
      resolution: c.resolution || null,
    }))

    // 8. 伏笔追踪 (Foreshadowing)
    const foreshadowingRecords = await db
      .select()
      .from(foreshadowingItems)
      .where(eq(foreshadowingItems.projectId, projectId))

    const cockpitForeshadowing: CockpitForeshadowingState[] = foreshadowingRecords.map(f => ({
      id: f.id,
      title: f.title,
      description: f.description || null,
      setupChapterId: f.setupChapterId || null,
      expectedPayoffChapterId: f.expectedPayoffChapterId || null,
      payoffChapterId: f.payoffChapterId || null,
      status: f.status,
      importance: f.importance,
      relatedCharacters: f.relatedCharacters || null,
    }))

    // 9. 剧情走向 (Plot Direction)
    // 查询最近的章节记忆以获取进展，或者从健康巡检中获取建议
    const [latestMemory] = await db
      .select()
      .from(chapterMemories)
      .where(eq(chapterMemories.projectId, projectId))
      .orderBy(desc(chapterMemories.createdAt))
      .limit(1)

    const globalControl = await buildGlobalNarrativeControl(projectId, runSummary?.currentChapterId)
    const plotDirection: CockpitPlotDirection = {
      themeProgress: latestMemory?.themeProgress || '项目已正常启动，进入全自动写作流程。',
      nextChapterGoal: globalControl.plotDirection.find(i => i.startsWith('下一章目标：'))?.replace('下一章目标：', ''),
      nextChapterEvents: globalControl.plotDirection.find(i => i.startsWith('下一章关键事件：'))?.replace('下一章关键事件：', ''),
      suggestions: [
        ...globalControl.conflictGuardrails.slice(0, 2).map(i => `推进矛盾：${i}`),
        ...globalControl.foreshadowingGuardrails.slice(0, 2).map(i => `照看伏笔：${i}`),
      ],
      globalGuardrails: globalControl.themeGuardrails,
      activeConstraints: [
        ...globalControl.characterGuardrails.slice(0, 4),
        ...globalControl.relationshipGuardrails.slice(0, 4),
      ],
      healthWarnings: globalControl.healthWarnings,
    }

    // 10. 健康风险与巡检 (Health Risk Summary)
    const healthReports = await db
      .select()
      .from(projectHealthReports)
      .where(eq(projectHealthReports.projectId, projectId))
      .orderBy(desc(projectHealthReports.generatedAt))

    let overallScore = 100
    let riskCount = 0
    const detailsList: NonNullable<CockpitHealthSummary['details']> = []

    const latestReport = healthReports[0]
    if (latestReport) {
      overallScore = latestReport.score
      const metricsJson = asRecord(latestReport.metricsJson)
      const topRisks = Array.isArray(metricsJson.topRisks)
        ? metricsJson.topRisks.filter(isStoredHealthRisk)
        : []

      riskCount = topRisks.filter(r => r.severity === 'high' || r.severity === 'medium').length

      const typeLabelMap: Record<string, string> = {
        foreshadowing: '伏笔偏离',
        conflict: '矛盾失衡',
        character: '人物崩坏',
        relationship: '关系异常',
        bible: '设定偏离',
        scene: '情节缺失',
      }

      for (const risk of topRisks) {
        const riskType = risk.type || 'unknown'
        const chapterId = this.extractChapterIdFromRisk(risk)
        const fixMeta = this.getRiskFixMeta({ type: risk.type, chapterId })
        detailsList.push({
          id: risk.id,
          type: risk.type,
          chapterId,
          scope: typeLabelMap[riskType] || riskType,
          score: undefined,
          riskLevel: risk.severity || 'low',
          description: risk.title,
          actionLabel: risk.actionLabel,
          targetRoute: risk.targetRoute,
          ...fixMeta,
        })
      }

      // 兜底项：防备没有任何具体 risks 却扣分的情况
      if (detailsList.length === 0 && overallScore < 100) {
        detailsList.push({
          scope: '综合情况',
          score: overallScore,
          riskLevel: latestReport.riskLevel || 'low',
          description: '一致性检测发生轻微扣分，暂无急需处置的具体冲突点。',
          fixAction: 'none',
        })
      }
    }

    const healthSummary: CockpitHealthSummary = {
      overallScore,
      riskCount,
      details: detailsList,
    }

    // 11. 结构化回写事件流 (Events)
    const events = await this.getCockpitEvents(projectId, 100)

    return {
      project: projectSummary,
      run: runSummary,
      chapters: chapterProgressList,
      characters: cockpitCharacters,
      relationships: cockpitRelationships,
      conflicts: cockpitConflicts,
      foreshadowing: cockpitForeshadowing,
      plotDirection,
      health: healthSummary,
      events,
    }
  }

  static async getCockpitEvents(projectId: string, limit = 100): Promise<CockpitNarrativeEvent[]> {
    const items = await db
      .select()
      .from(chapterChangeSetItems)
      .where(eq(chapterChangeSetItems.projectId, projectId))
      .orderBy(desc(chapterChangeSetItems.createdAt))
      .limit(limit)

    const chapterIds = Array.from(new Set(items.map(item => item.chapterId)))
    const chapterRows = chapterIds.length > 0
      ? await db
          .select({ id: chapters.id, chapterNumber: chapters.chapterNumber })
          .from(chapters)
          .where(and(eq(chapters.projectId, projectId), inArray(chapters.id, chapterIds)))
      : []
    const chapterNumberById = new Map(chapterRows.map(chapter => [chapter.id, chapter.chapterNumber]))

    return items.map((item) => {
      // 映射状态为 CockpitNarrativeEvent 契约状态
      let cockpitStatus: CockpitNarrativeEvent['status'] = 'pending_review'
      if (item.status === 'applied') {
        cockpitStatus = 'auto_applied'
      }
      else if (item.status === 'approved') {
        cockpitStatus = 'approved'
      }
      else if (item.status === 'pending') {
        cockpitStatus = 'pending_review'
      }
      else if (item.status === 'blocked') {
        cockpitStatus = 'isolated'
      }
      else if (item.status === 'apply_failed') {
        cockpitStatus = 'failed'
      }
      else if (item.status === 'rejected') {
        cockpitStatus = 'ignored'
      }

      // 根据 itemType 进行可读化命名
      let typeLabel: string = item.itemType
      let summaryText = ''
      try {
        const payload = asRecord(item.payloadJson)
        if (item.itemType === 'character_create') {
          typeLabel = '新增角色'
          summaryText = `在文中抽取出全新人物角色 [${textField(payload, ['name'], '未命名角色')}]，身份设定为：${textField(payload, ['role'], '无')}`
        }
        else if (item.itemType === 'character_update') {
          typeLabel = '更新角色'
          summaryText = `更新人物 [${textField(payload, ['name'], '未命名角色')}] 档案设定。情绪：${textField(payload, ['emotion'], '平静')}，目标：${textField(payload, ['goal'], '无')}`
        }
        else if (item.itemType === 'relationship_create') {
          typeLabel = '新增关系'
          const sourceName = textField(payload, ['sourceName', 'characterAName'], '未知角色')
          const targetName = textField(payload, ['targetName', 'characterBName'], '未知角色')
          summaryText = `在文中发现 [${sourceName}] 与 [${targetName}] 建立新联系：${textField(payload, ['type'], '未分类')}`
        }
        else if (item.itemType === 'relationship_update') {
          typeLabel = '关系更新'
          const sourceName = textField(payload, ['sourceName', 'characterAName'], '未知角色')
          const targetName = textField(payload, ['targetName', 'characterBName'], '未知角色')
          const relationshipStatus = textField(payload, ['status'], '关系已更新')
          const strength = numberField(payload, ['strength', 'intimacy'])
          summaryText = `更新关系：[${sourceName}] 与 [${targetName}] 当前为「${relationshipStatus}」${strength === null ? '' : `，关系强度 ${strength}`}`
        }
        else if (item.itemType === 'conflict_create') {
          typeLabel = '发现冲突'
          const conflictType = textField(payload, ['type'], 'external') === 'internal' ? '内部' : '外部'
          const intensity = numberField(payload, ['intensity'])
          summaryText = `抽取到全新矛盾冲突：[${textField(payload, ['title'], '未命名冲突')}]。性质：${conflictType}，强度：${intensity ?? '未标注'}`
        }
        else if (item.itemType === 'conflict_update') {
          typeLabel = '冲突演变'
          const status = textField(payload, ['newStatus', 'status'], '状态已更新')
          const intensity = numberField(payload, ['newIntensity', 'intensity'])
          summaryText = `矛盾关系演变：[${textField(payload, ['title'], '未命名冲突')}] 演变至 [${status}] 阶段，强度：${intensity ?? '未标注'}`
        }
        else if (item.itemType === 'foreshadowing_create') {
          typeLabel = '埋下伏笔'
          summaryText = `在章节正文中埋下重要伏笔 [${textField(payload, ['title'], '未命名伏笔')}]：${textField(payload, ['description'], '暂无说明')}`
        }
        else if (item.itemType === 'foreshadowing_payoff') {
          typeLabel = '回收伏笔'
          summaryText = `回收了早期伏笔 [${textField(payload, ['title'], '未命名伏笔')}]，证明线索：${textField(payload, ['notes'], '无')}`
        }
        else {
          summaryText = item.title
        }
      }
      catch {
        summaryText = item.title
      }

      return {
        id: item.id,
        type: item.itemType,
        status: cockpitStatus,
        title: typeLabel,
        summary: summaryText,
        sourceChapterId: item.chapterId,
        sourceChapterNumber: chapterNumberById.get(item.chapterId),
        confidence: item.riskLevel === 'low' ? 90 : item.riskLevel === 'medium' ? 70 : 50,
        changeSetId: item.changeSetId,
        createdAt: item.createdAt,
      }
    })
  }

  static async getCockpitChapterDetail(
    projectId: string,
    chapterId: string,
  ): Promise<CockpitChapterDetail | null> {
    const [chapter] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))
      .limit(1)

    if (!chapter)
      return null

    const scenes = await db
      .select()
      .from(chapterScenes)
      .where(and(eq(chapterScenes.chapterId, chapterId), eq(chapterScenes.projectId, projectId)))
      .orderBy(chapterScenes.orderIndex)

    return {
      id: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      content: chapter.draft,
      summary: chapter.summary,
      notes: chapter.outline,
      scenes: scenes.map((s): CockpitChapterDetail['scenes'][number] => ({
        id: s.id,
        title: s.title || '未命名场景',
        summary: s.purpose || s.summary,
        content: s.content,
        status: s.status === 'completed' ? 'completed' : 'pending',
      })),
    }
  }
}
