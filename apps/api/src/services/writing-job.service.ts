import type { WritingJob, WritingJobStepType } from '@ai-novel/shared'
import { and, asc, eq, or } from 'drizzle-orm'
import { db } from '../db'
import { chapters, chapterScenes, projectHealthReports, writingJobs, writingJobSteps } from '../db/schema'
import { generateId, now } from '../utils'
import { renderAIContext } from './ai-context-renderer'
import { createAIContextSnapshot } from './ai-context-snapshot.service'
import { buildProjectAIContext } from './ai-context.service'
import { callAIJSON, getEffectiveAISettings } from './ai.service'
import { AuthoringEventService } from './authoring-event.service'
import { attemptAutoRepair } from './auto-repair.service'
import { applyChangeSet as applyChangeSetSvc, approveChangeSet as approveChangeSetSvc, createChapterChangeSet, rejectChangeSet as rejectChangeSetSvc } from './chapter-change-set.service'
import { extractChapterChanges, runChapterPostprocess, runScenePostprocess } from './chapter-postprocess.service'
import { runConsistencyGuard } from './consistency-guard.service'
import { getProjectHealthMetrics } from './health-metrics.service'
import { applyAcceptedSuggestions, applyAutoSuggestions } from './postprocess-suggestion.service'
import { runGraphInference } from './story-graph-inference.service'
import { createSnapshot } from './version.service'
import { evaluateAutoApproval } from './writing-job-auto-approval.service'

type JobMode = 'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'

const STEP_SEQUENCE: Record<JobMode, WritingJobStepType[]> = {
  outline_only: [
    'prepare_context',
    'generate_plan',
    'confirm_plan',
    'update_health',
    'auto_repair',
    'done',
  ],
  draft_only: [
    'prepare_context',
    'generate_draft',
    'build_change_set',
    'review_change_set',
    'auto_repair',
    'apply_change_set',
    'update_health',
    'done',
  ],
  outline_then_draft: [
    'prepare_context',
    'generate_plan',
    'confirm_plan',
    'generate_draft',
    'build_change_set',
    'review_change_set',
    'auto_repair',
    'apply_change_set',
    'update_health',
    'done',
  ],
  scene_draft: [
    'prepare_context',
    'generate_scene_draft',
    'confirm_plan',
    'generate_draft',
    'build_change_set',
    'review_change_set',
    'auto_repair',
    'apply_change_set',
    'update_health',
    'done',
  ],
}

const CONFIRM_STEPS = new Set<WritingJobStepType>([
  'confirm_plan',
  'consistency_check',
  'confirm_apply',
  'confirm_suggestions',
  'review_change_set',
])

const STEP_LABELS: Record<WritingJobStepType, string> = {
  prepare_context: '构建上下文',
  generate_plan: '生成大纲',
  generate_scene_draft: '生成场景大纲',
  confirm_plan: '审查大纲',
  generate_draft: '生成正文',
  consistency_check: '一致性检查',
  confirm_apply: '审查正文',
  apply_draft: '写入正文',
  save_version: '保存快照',
  postprocess: '章后管线',
  confirm_suggestions: '审查建议',
  apply_suggestions: '应用建议',
  update_health: '更新健康指标',
  build_change_set: '构建变更集',
  review_change_set: '审查变更集',
  apply_change_set: '应用变更集',
  auto_repair: '自动修复',
  done: '任务完成',
}

export function getStepLabel(stepType: WritingJobStepType): string {
  return STEP_LABELS[stepType] || stepType
}

export async function initializeJobSteps(jobId: string): Promise<void> {
  const [job] = await db.select().from(writingJobs).where(eq(writingJobs.id, jobId))
  if (!job)
    throw new Error('Job not found')

  const sequence = STEP_SEQUENCE[job.mode]
  const timestamp = now()

  // Delete any existing steps first (in case of re-initialization)
  await db.delete(writingJobSteps).where(eq(writingJobSteps.jobId, jobId))

  const values = sequence.map((stepType, index) => ({
    id: generateId(),
    jobId,
    stepType,
    status: 'pending' as const,
    input: JSON.stringify({ stepIndex: index }),
    output: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  await db.insert(writingJobSteps).values(values)
}

export async function getJobSteps(jobId: string) {
  const [job] = await db.select().from(writingJobs).where(eq(writingJobs.id, jobId))
  const rows = await db.select().from(writingJobSteps).where(eq(writingJobSteps.jobId, jobId)).orderBy(asc(writingJobSteps.createdAt))
  if (!job)
    return rows

  const sequence = STEP_SEQUENCE[job.mode]
  const order = new Map(sequence.map((stepType, index) => [stepType, index]))

  return rows.sort((left, right) => {
    const leftOrder = order.get(left.stepType) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right.stepType) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder)
      return leftOrder - rightOrder
    return left.createdAt.localeCompare(right.createdAt)
  })
}

async function updateJobStatus(jobId: string, status: string, lastError?: string | null) {
  const fields: Record<string, any> = {
    status,
    updatedAt: now(),
  }
  if (lastError !== undefined) {
    fields.lastError = lastError
  }
  await db.update(writingJobs).set(fields).where(eq(writingJobs.id, jobId))

  // P1-3: 如果是自动驾驶任务，通知 Run 进度
  if (['completed', 'failed', 'waiting_review'].includes(status)) {
    const [job] = await db.select({ projectId: writingJobs.projectId }).from(writingJobs).where(eq(writingJobs.id, jobId))
    if (job) {
      // 动态导入避免循环依赖
      const { handleAutonomousJobCompletion } = await import('./autonomous-writing.service')
      await handleAutonomousJobCompletion(
        job.projectId,
        jobId,
        status as any,
        lastError || undefined,
      )
    }
  }
}

async function updateStep(stepId: string, fields: Record<string, any>) {
  await db.update(writingJobSteps).set({ ...fields, updatedAt: now() }).where(eq(writingJobSteps.id, stepId))
}

async function getJobAndChapter(jobId: string, projectId: string) {
  const [job] = await db.select().from(writingJobs).where(
    and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
  )
  if (!job)
    throw new Error('Job not found')

  let chapter = null
  if (job.currentChapterId) {
    const [ch] = await db.select().from(chapters).where(and(
      eq(chapters.id, job.currentChapterId),
      eq(chapters.projectId, projectId),
    ))
    chapter = ch || null
  }

  let scene = null
  if (job.sceneId) {
    const [sc] = await db.select().from(chapterScenes).where(and(
      eq(chapterScenes.id, job.sceneId),
      eq(chapterScenes.projectId, projectId),
    ))
    scene = sc || null
  }

  return { job, chapter, scene }
}

// ---- Step executors ----

async function executePrepareContext(
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  stepId: string,
): Promise<string> {
  const context = await buildProjectAIContext({
    projectId,
    scene: 'outline',
    chapterId: chapterId || undefined,
    sceneId: sceneId || undefined,
    userInstruction: '为下一章生成写作计划和正文',
  })
  const rendered = renderAIContext(context)

  // Record snapshot
  const settings = await getEffectiveAISettings()
  await createAIContextSnapshot({
    projectId,
    chapterId: chapterId || undefined,
    scene: 'outline',
    requestId: stepId, // Use stepId as requestId for mapping
    modelProvider: typeof settings.provider === 'string' ? settings.provider : (settings.provider as any).id,
    modelName: settings.model,
    contextPayload: context,
    renderedPromptPreview: rendered,
  }).catch(err => console.error('Failed to create AI context snapshot:', err))

  const output = JSON.stringify({ context, rendered })
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeGenerateSceneDraft(
  contextOutput: string,
  sceneTitle: string | null,
  stepId: string,
): Promise<string> {
  const parsed = JSON.parse(contextOutput)
  const contextPrompt = parsed.rendered || ''

  const sceneInfo = sceneTitle ? `场景: ${sceneTitle}` : '当前场景'

  const messages = [
    {
      role: 'user' as const,
      content: `你是一位专业的长篇小说场景大纲撰写者。请根据以下上下文，为当前场景生成详细的执行计划。

${contextPrompt}

---

请为【${sceneInfo}】生成详细的场景执行计划，返回严格 JSON 格式：

{
  "title": "场景标题",
  "goals": "本场景核心目标",
  "conflicts": "本场景主要冲突点",
  "events": "场景内关键行动列表",
  "emotionalArc": "本场景情绪走向",
  "outline": "详细场景大纲（200-400字，包含场景起因、经过、转折和结果）"
}

要求：
- 场景必须推进当前章节的目标
- 角色行为必须符合上下文设定的性格
- 注意场景内部的节奏张力`,
    },
  ]

  const plan = await callAIJSON<Record<string, any>>(messages, { temperature: 60 })
  const output = JSON.stringify(plan)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeGeneratePlan(
  contextOutput: string,
  chapterTitle: string | null,
  stepId: string,
): Promise<string> {
  const parsed = JSON.parse(contextOutput)
  const contextPrompt = parsed.rendered || ''

  const chapterInfo = chapterTitle ? `章节标题: ${chapterTitle}` : '下一章'

  const messages = [
    {
      role: 'user' as const,
      content: `你是一位专业的长篇小说大纲撰写者。请根据以下上下文，为当前章节生成详细的大纲。

${contextPrompt}

---

请为【${chapterInfo}】生成详细的章节大纲，返回严格 JSON 格式：

{
  "title": "章节标题",
  "goals": "本章写作目标（1-2句话）",
  "conflicts": "本章核心冲突",
  "events": "关键事件列表（用分号分隔）",
  "emotionalArc": "情绪曲线描述",
  "foreshadowing": "本章可能埋设的伏笔",
  "endingHook": "结尾钩子（吸引读者继续阅读）",
  "outline": "详细章节大纲（300-500字，包含场景描述、角色行动、对话要点和转折点）"
}

要求：
- 大纲必须与前后章节连贯
- 角色行为必须符合已有性格和动机
- 必须推进主线或支线剧情
- 注意伏笔的埋设和回收`,
    },
  ]

  const plan = await callAIJSON<Record<string, any>>(messages, { temperature: 60 })
  const output = JSON.stringify(plan)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeGenerateDraft(
  contextOutput: string,
  planOutput: string,
  stepId: string,
  targetWords?: number | null,
): Promise<string> {
  const parsedContext = JSON.parse(contextOutput)
  const contextPrompt = parsedContext.rendered || ''
  const plan = JSON.parse(planOutput)

  const wordsRange = targetWords
    ? `${Math.floor(targetWords * 0.8)}-${Math.floor(targetWords * 1.2)}`
    : '2000-4000'

  const messages = [
    {
      role: 'user' as const,
      content: `你是一位专业的长篇小说作者。请根据以下上下文和章节大纲，撰写完整的章节正文。

${contextPrompt}

---

【章节大纲】
标题: ${plan.title || ''}
目标: ${plan.goals || ''}
冲突: ${plan.conflicts || ''}
事件: ${plan.events || ''}
情绪曲线: ${plan.emotionalArc || ''}
伏笔: ${plan.foreshadowing || ''}
结尾钩子: ${plan.endingHook || ''}
详细大纲: ${plan.outline || ''}

---

请撰写完整的章节正文。要求：
1. 严格按照大纲的情节发展
2. 角色对话生动自然，符合角色性格
3. 场景描写细腻，有画面感
4. 节奏张弛有度，注意留白
5. 字数控制在 ${wordsRange} 字
6. 结尾要有悬念或钩子

返回 JSON 格式：
{
  "title": "章节标题",
  "draft": "完整的章节正文内容",
  "wordCount": 正文字数
}`,
    },
  ]

  const draft = await callAIJSON<Record<string, any>>(messages, { temperature: 70 })
  const output = JSON.stringify(draft)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeConsistencyCheck(
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  draftOutput: string,
  stepId: string,
): Promise<string> {
  const draft = JSON.parse(draftOutput)
  const report = await runConsistencyGuard(projectId, {
    chapterId: chapterId || undefined,
    sceneId: sceneId || undefined,
    generatedText: draft.draft || '',
    sourceInstruction: '章节正文生成',
    scene: 'draft',
  })
  const output = JSON.stringify(report)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}
async function executeApplyDraft(
  projectId: string,
  chapterId: string | null,
  draftOutput: string,
  stepId: string,
  isAutoMode = false,
): Promise<string> {
  if (!chapterId)
    throw new Error('没有可写入的章节')

  const draft = JSON.parse(draftOutput)
  const content = typeof draft.draft === 'string' ? draft.draft.trim() : ''
  if (!content)
    throw new Error('生成正文为空，无法写入章节')

  if (isAutoMode) {
    const currentContent = (await db.select({ draft: chapters.draft }).from(chapters).where(eq(chapters.id, chapterId)))[0]?.draft || ''
    await createSnapshot(projectId, chapterId, currentContent, '全自动写作写入前备份 (Before Auto-Write)')
  }

  const [row] = await db.update(chapters).set({
    draft: content,
    title: draft.title || undefined,
    updatedAt: now(),
  }).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  )).returning()

  if (!row)
    throw new Error('章节不存在或不属于当前项目')

  // Log event
  await AuthoringEventService.logEvent({
    projectId,
    chapterId,
    eventType: 'draft_write',
    source: 'ai',
    payload: { wordCount: content.length, jobId: stepId },
  }).catch(err => console.error('Failed to log authoring event:', err))

  if (isAutoMode) {
    await createSnapshot(projectId, chapterId, content, '全自动写作写入后备份 (After Auto-Write)')
  }

  const output = JSON.stringify({
    chapterId,
    wordCount: content.length,
    title: row.title,
  })

  await updateStep(stepId, { output })
  return output
}

async function executeApplySceneDraft(
  projectId: string,
  sceneId: string | null,
  draftOutput: string,
  stepId: string,
  isAutoMode = false,
): Promise<string> {
  if (!sceneId)
    throw new Error('没有可写入的场景')

  const draft = JSON.parse(draftOutput)
  const content = typeof draft.draft === 'string' ? draft.draft.trim() : ''
  if (!content)
    throw new Error('生成正文为空，无法写入场景')

  const [row] = await db.update(chapterScenes).set({
    content,
    status: 'reviewed',
    updatedAt: now(),
  }).where(and(
    eq(chapterScenes.id, sceneId),
    eq(chapterScenes.projectId, projectId),
  )).returning()

  if (!row)
    throw new Error('场景不存在或不属于当前项目')

  if (isAutoMode) {
    const currentContent = (await db.select({ content: chapterScenes.content }).from(chapterScenes).where(eq(chapterScenes.id, sceneId)))[0]?.content || ''
    await createSnapshot(projectId, row.chapterId, currentContent, '全自动写作写入前备份 (Before Auto-Write)')
  }

  // Log event
  await AuthoringEventService.logEvent({
    projectId,
    sceneId,
    chapterId: row.chapterId,
    eventType: 'scene_write',
    source: 'ai',
    payload: { wordCount: content.length, jobId: stepId },
  }).catch(err => console.error('Failed to log authoring event:', err))

  if (isAutoMode) {
    await createSnapshot(projectId, row.chapterId, content, '全自动写作写入后备份 (After Auto-Write)')
  }

  const output = JSON.stringify({
    sceneId,
    wordCount: content.length,
    title: row.title,
  })
  await updateStep(stepId, { output })
  return output
}

async function executeSaveVersion(
  projectId: string,
  chapterId: string | null,
  stepId: string,
): Promise<string> {
  if (!chapterId) {
    await updateStep(stepId, {
      output: JSON.stringify({ skipped: true, reason: 'no_chapter' }),
      updatedAt: now(),
    })
    return JSON.stringify({ skipped: true })
  }

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('章节不存在或不属于当前项目')

  const content = chapter.draft || ''
  if (!content)
    throw new Error('章节正文为空，无法保存快照')

  const result = await createSnapshot(
    projectId,
    chapterId,
    content,
    'Writing job approved draft',
  )
  const snapshotId = result && 'id' in result ? result.id : null
  const output = JSON.stringify({ snapshotId, wordCount: content.length })
  await updateStep(stepId, { output })
  return output
}

async function executePostprocess(
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  draftOutput: string,
  stepId: string,
): Promise<string> {
  const draft = JSON.parse(draftOutput)

  if (!chapterId) {
    await updateStep(stepId, { output: JSON.stringify({ skipped: true, reason: 'no_chapter' }) })
    return JSON.stringify({ skipped: true })
  }

  const result = sceneId
    ? await runScenePostprocess({
        projectId,
        chapterId,
        sceneId,
        content: draft.draft || '',
      })
    : await runChapterPostprocess({
        projectId,
        chapterId,
        content: draft.draft || '',
        trigger: 'auto_drive',
      })

  // Also trigger graph inference after postprocess to identify more candidates
  const inferenceCount = await runGraphInference(projectId).catch(() => 0)

  const output = JSON.stringify({ ...result, inferenceCount })
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeApplySuggestions(
  projectId: string,
  chapterId: string | null,
  stepId: string,
  job: WritingJob,
): Promise<string> {
  if (!chapterId) {
    await updateStep(stepId, { output: JSON.stringify({ skipped: true, reason: 'no_chapter' }) })
    return JSON.stringify({ skipped: true })
  }

  const result = job.executionMode === 'auto'
    ? await applyAutoSuggestions(projectId, chapterId, job.autoApprovalLevel)
    : await applyAcceptedSuggestions(projectId, chapterId)
  const output = JSON.stringify(result)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeUpdateHealth(
  projectId: string,
  stepId: string,
): Promise<void> {
  const metrics = await getProjectHealthMetrics(projectId)
  const topRisks = metrics.risks.slice(0, 5).map(risk => ({
    severity: risk.severity,
    type: risk.type,
    title: risk.title,
    actionLabel: risk.actionLabel,
    targetRoute: risk.targetRoute,
  }))
  const { riskLevel, score } = calculateHealthScore(metrics)
  const reportId = generateId()

  await db.insert(projectHealthReports).values({
    id: reportId,
    projectId,
    scope: 'overall',
    score,
    riskLevel,
    metricsJson: {
      completedChapters: metrics.completedChapters,
      totalChapters: metrics.totalChapters,
      openForeshadowingCount: metrics.openForeshadowingCount,
      pendingTriples: metrics.pendingTriples,
      scenesWithoutContent: metrics.scenesWithoutContent,
      scenesWithoutPurpose: metrics.scenesWithoutPurpose,
      scenesWithoutConflict: metrics.scenesWithoutConflict,
      tensionTrend: metrics.tensionTrend,
      riskCount: metrics.risks.length,
      topRisks,
    },
  })

  const output = {
    reportId,
    score,
    riskLevel,
    completedChapters: metrics.completedChapters,
    totalChapters: metrics.totalChapters,
    openForeshadowingCount: metrics.openForeshadowingCount,
    pendingTriples: metrics.pendingTriples,
    scenesWithoutContent: metrics.scenesWithoutContent,
    scenesWithoutPurpose: metrics.scenesWithoutPurpose,
    scenesWithoutConflict: metrics.scenesWithoutConflict,
    riskCount: metrics.risks.length,
    topRisks,
  }
  await updateStep(stepId, { output: JSON.stringify(output), updatedAt: now() })
}

function calculateHealthScore(metrics: Awaited<ReturnType<typeof getProjectHealthMetrics>>): {
  riskLevel: 'low' | 'medium' | 'high'
  score: number
} {
  const radarValues = Object.values(metrics.radarMetrics)
  const baseScore = radarValues.length > 0
    ? Math.round(radarValues.reduce((sum, value) => sum + value, 0) / radarValues.length)
    : 100
  const penalty = metrics.risks.reduce((sum, risk) => {
    if (risk.severity === 'high')
      return sum + 15
    if (risk.severity === 'medium')
      return sum + 8
    return sum + 3
  }, 0)
  const score = Math.max(0, Math.min(100, baseScore - penalty))
  const hasHighRisk = metrics.risks.some(risk => risk.severity === 'high')
  const hasMediumRisk = metrics.risks.some(risk => risk.severity === 'medium')

  if (hasHighRisk || score < 60)
    return { riskLevel: 'high', score }
  if (hasMediumRisk || score < 80)
    return { riskLevel: 'medium', score }
  return { riskLevel: 'low', score }
}

async function executeBuildChangeSet(
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  draftOutput: string,
  stepId: string,
  jobId: string,
): Promise<string> {
  const draft = JSON.parse(draftOutput)
  const content = draft.draft || ''

  if (!chapterId) {
    throw new Error('Chapter ID is required for building change set')
  }

  // 1. 一致性检查
  const report = await runConsistencyGuard(projectId, {
    chapterId,
    sceneId: sceneId || undefined,
    scene: 'draft',
    generatedText: content,
    sourceInstruction: '自动写作一致性检查',
  })

  // 2. 抽取变更
  const extracted = await extractChapterChanges({
    projectId,
    chapterId,
    content,
    trigger: 'auto_drive',
  })

  // 3. 创建变更集
  const changeSet = await createChapterChangeSet({
    projectId,
    chapterId,
    sceneId: sceneId || undefined,
    writingJobId: jobId,
    sourceStepId: stepId,
    draftContent: content,
    consistencyReport: report,
    extractedChanges: extracted,
  })

  const output = JSON.stringify({
    changeSetId: changeSet.id,
    riskLevel: changeSet.riskLevel,
    overallStatus: report.overallStatus,
    consistencyReport: report,
  })
  await updateStep(stepId, { output, changeSetId: changeSet.id, updatedAt: now() })
  return output
}

async function executeApplyChangeSet(
  projectId: string,
  changeSetId: string | null,
  stepId: string,
): Promise<string> {
  if (!changeSetId) {
    throw new Error('Change set ID is required for application')
  }

  const result = await applyChangeSetSvc(projectId, changeSetId)
  const output = JSON.stringify(result)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

// ---- Core engine: auto-execute steps until hitting a confirm step or completion ----

async function executeStep(
  step: typeof writingJobSteps.$inferSelect,
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  job: WritingJob,
  previousStepOutputs: Map<string, string>,
): Promise<boolean> {
  // Returns true if execution should continue, false if we hit a confirm/pause point

  const timestamp = now()
  await updateStep(step.id, { status: 'running', startedAt: timestamp, error: null })

  try {
    switch (step.stepType) {
      case 'prepare_context':
        await executePrepareContext(projectId, chapterId, sceneId, step.id)
        break

      case 'generate_plan': {
        const contextOutput = previousStepOutputs.get('prepare_context') || '{}'
        const chapterTitle = chapterId
          ? (await db.select({ title: chapters.title }).from(chapters).where(eq(chapters.id, chapterId)))[0]?.title
          : null
        await executeGeneratePlan(contextOutput, chapterTitle, step.id)
        break
      }

      case 'generate_scene_draft': {
        const contextOutput = previousStepOutputs.get('prepare_context') || '{}'
        const sceneTitle = sceneId
          ? (await db.select({ title: chapterScenes.title }).from(chapterScenes).where(eq(chapterScenes.id, sceneId)))[0]?.title
          : null
        await executeGenerateSceneDraft(contextOutput, sceneTitle, step.id)
        break
      }

      case 'confirm_plan':
        // This is a pause point — signal pause
        return false

      case 'generate_draft': {
        const contextOutput = previousStepOutputs.get('prepare_context') || '{}'
        const planOutput = job.mode === 'scene_draft'
          ? previousStepOutputs.get('generate_scene_draft') || '{}'
          : previousStepOutputs.get('generate_plan') || '{}'
        await executeGenerateDraft(contextOutput, planOutput, step.id, job.targetWords)
        break
      }

      case 'consistency_check': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        const output = await executeConsistencyCheck(projectId, chapterId, sceneId, draftOutput, step.id)
        const report = JSON.parse(output)
        if (report.overallStatus === 'blocked' || report.overallStatus === 'warning') {
          return false // Pause for review if there are risks
        }
        break
      }

      case 'confirm_apply':
        // Pause point
        return false

      case 'apply_draft': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        if (job.mode === 'scene_draft') {
          await executeApplySceneDraft(projectId, sceneId, draftOutput, step.id, job.executionMode === 'auto')
        }
        else {
          await executeApplyDraft(projectId, chapterId, draftOutput, step.id, job.executionMode === 'auto')
        }
        break
      }

      case 'save_version': {
        await executeSaveVersion(projectId, chapterId, step.id)
        break
      }

      case 'postprocess': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        await executePostprocess(projectId, chapterId, sceneId, draftOutput, step.id)
        break
      }

      case 'confirm_suggestions':
        // Pause point
        return false

      case 'apply_suggestions':
        await executeApplySuggestions(projectId, chapterId, step.id, job)
        break

      case 'build_change_set': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        await executeBuildChangeSet(projectId, chapterId, sceneId, draftOutput, step.id, job.id)
        // 如果是高风险或自动驾驶需要确认，可以在这里 return false
        // 但通常我们让后续的 review_change_set 来处理暂停
        break
      }

      case 'review_change_set':
        // Pause point for user to review the build_change_set result
        return false

      case 'apply_change_set': {
        // Find changeSetId from previous build_change_set step
        const buildOutput = previousStepOutputs.get('build_change_set') || '{}'
        const { changeSetId } = JSON.parse(buildOutput)
        await executeApplyChangeSet(projectId, changeSetId, step.id)
        break
      }

      case 'auto_repair': {
        // Only attempt repair when review_change_set detected medium risk
        const reviewSteps = await getJobSteps(job.id)
        const needsRepair = reviewSteps.some(
          s => s.stepType === 'review_change_set' && s.autoDecision === 'medium_risk_repair',
        )

        if (!needsRepair) {
          await updateStep(step.id, { status: 'skipped', autoDecisionReason: 'No repair needed - review passed' })
          return true
        }

        const draftOutputStr = previousStepOutputs.get('generate_draft') || '{}'
        const draftOutput = JSON.parse(draftOutputStr)
        const buildOutputStr = previousStepOutputs.get('build_change_set') || '{}'
        const buildOutput = JSON.parse(buildOutputStr)

        if (!buildOutput.consistencyReport) {
          await updateStep(step.id, { status: 'skipped', autoDecisionReason: 'No consistency report found' })
          return true
        }

        const repairResult = await attemptAutoRepair({
          projectId,
          chapterId: chapterId!,
          draftContent: draftOutput.draft,
          consistencyReport: buildOutput.consistencyReport,
          strategy: (job as any).strategy || 'balanced', // Autonomous run strategy if available
        })

        if (repairResult.repaired) {
          // Update generate_draft output with repaired content
          const updatedDraftOutput = { ...draftOutput, draft: repairResult.draftContent }
          const generateDraftStep = reviewSteps.find(s => s.stepType === 'generate_draft')
          if (generateDraftStep) {
            await updateStep(generateDraftStep.id, { output: JSON.stringify(updatedDraftOutput) })
          }

          // Reject old change set before resetting steps
          const oldBuildStep = reviewSteps.find(s => s.stepType === 'build_change_set' && s.changeSetId)
          if (oldBuildStep?.changeSetId) {
            await rejectChangeSetSvc(projectId, oldBuildStep.changeSetId)
          }

          // Reset build_change_set and review_change_set so they re-run with repaired content
          await db.update(writingJobSteps).set({
            status: 'pending',
            output: null,
            changeSetId: null,
            finishedAt: null,
            autoDecision: null,
            autoDecisionReason: null,
            reviewRequired: false,
            updatedAt: now(),
          }).where(and(
            eq(writingJobSteps.jobId, job.id),
            or(eq(writingJobSteps.stepType, 'build_change_set'), eq(writingJobSteps.stepType, 'review_change_set')),
          ))

          await updateStep(step.id, { status: 'completed', output: JSON.stringify(repairResult.repairReport) })
        }
        else {
          await updateStep(step.id, { status: 'failed', error: repairResult.repairReport })
          throw new Error(`Auto-repair failed: ${repairResult.repairReport}`)
        }
        break
      }

      case 'update_health':
        await executeUpdateHealth(projectId, step.id)
        break

      default:
        await updateStep(step.id, { status: 'skipped', finishedAt: now() })
        return true
    }

    // Mark as completed if we reached here successfully
    await updateStep(step.id, { status: 'completed', finishedAt: now() })
    return true
  }
  catch (error: any) {
    await updateStep(step.id, {
      status: 'failed',
      error: error.message || 'Unknown error',
      finishedAt: now(),
    })
    await updateJobStatus(step.jobId, 'failed', error.message || 'Unknown error')
    throw error
  }
}

async function collectStepOutputs(jobId: string): Promise<Map<string, string>> {
  const steps = await getJobSteps(jobId)
  const outputs = new Map<string, string>()
  for (const s of steps) {
    if (s.output) {
      outputs.set(s.stepType, s.output)
    }
  }
  return outputs
}

async function runNextSteps(projectId: string, jobId: string): Promise<void> {
  const { chapter, scene, job } = await getJobAndChapter(jobId, projectId)

  await updateJobStatus(jobId, 'running', null)

  while (true) {
    const allSteps = await getJobSteps(jobId)
    const previousOutputs = await collectStepOutputs(jobId)

    const step = allSteps.find(s => s.status !== 'completed' && s.status !== 'skipped')
    if (!step) {
      // All steps done
      await updateJobStatus(jobId, 'completed', null)
      return
    }

    // If step was previously failed, we only continue if it's a retry (which would have reset the status)
    // But here we might want to handle it
    if (step.status === 'failed') {
      return // Wait for manual retry
    }

    const shouldContinue = await executeStep(
      step,
      projectId,
      chapter?.id || null,
      scene?.id || null,
      job as any,
      previousOutputs,
    )

    if (!shouldContinue) {
      // 获取最新 step 状态（包含 output）
      const [updatedStep] = await db.select().from(writingJobSteps).where(eq(writingJobSteps.id, step.id))
      const decision = evaluateAutoApproval({ job: job as any, step: updatedStep as any, previousOutputs })

      if (job.executionMode === 'auto') {
        if (decision.approved) {
          // P1-1: 自动通过变更集后必须批准变更项，否则应用时会跳过结构化变更
          if (step.stepType === 'review_change_set' && updatedStep.changeSetId) {
            await approveChangeSetSvc(projectId, updatedStep.changeSetId)
          }

          await db.update(writingJobSteps).set({
            autoDecision: 'approved',
            autoDecisionReason: decision.reason,
            reviewRequired: false,
            status: 'completed',
            finishedAt: now(),
            updatedAt: now(),
          }).where(eq(writingJobSteps.id, step.id))

          await db.update(writingJobs).set({
            autoApprovedSteps: (job.autoApprovedSteps || 0) + 1,
            updatedAt: now(),
          }).where(eq(writingJobs.id, job.id))

          // 继续执行后续步骤 (while 循环会重新获取 steps)
          continue
        }
        else if (decision.severity === 'medium' && step.stepType === 'review_change_set') {
          // P1-4: 自动修复链路
          const hasTriedRepair = allSteps.some(s => s.stepType === 'auto_repair' && s.status !== 'pending')
          if (!hasTriedRepair) {
            // 1. 创建或找到 auto_repair 步骤并设置为 pending
            const repairStep = allSteps.find(s => s.stepType === 'auto_repair')
            if (!repairStep) {
              const repairStepId = generateId()
              await db.insert(writingJobSteps).values({
                id: repairStepId,
                jobId,
                stepType: 'auto_repair',
                status: 'pending',
                createdAt: now(),
                updatedAt: now(),
              })
            }
            else {
              await db.update(writingJobSteps).set({
                status: 'pending',
                updatedAt: now(),
              }).where(eq(writingJobSteps.id, repairStep.id))
            }

            // 2. 将当前步骤标记为已完成（带特殊标记），以便循环能走到 auto_repair
            await db.update(writingJobSteps).set({
              status: 'completed',
              autoDecision: 'medium_risk_repair',
              autoDecisionReason: '检测到中风险，自动尝试修复',
              finishedAt: now(),
              updatedAt: now(),
            }).where(eq(writingJobSteps.id, step.id))

            await updateJobStatus(jobId, 'running', '正在执行自动修复...')
            continue // 重新循环，会发现 auto_repair 是下一个待处理步骤
          }
        }
      }

      // P1-2: 暂停审查时，统一把 step 设置为 completed，否则 approveStep 接口会因为 status !== 'completed' 而报错
      await db.update(writingJobSteps).set({
        status: 'completed',
        autoDecision: 'paused',
        autoDecisionReason: decision.reason,
        reviewRequired: true,
        finishedAt: now(),
        updatedAt: now(),
      }).where(eq(writingJobSteps.id, step.id))

      await updateJobStatus(jobId, 'waiting_review', decision.reason)
      return
    }
  }
}

// ---- Public API ----

export async function startJob(projectId: string, jobId: string): Promise<void> {
  // Verify job belongs to project
  const [job] = await db.select().from(writingJobs).where(
    and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
  )
  if (!job)
    throw new Error('Job not found or does not belong to this project')

  // Initialize steps if none exist
  const existingSteps = await getJobSteps(jobId)
  if (existingSteps.length === 0) {
    await initializeJobSteps(jobId)
  }

  await runNextSteps(projectId, jobId)
}

export async function approveStep(projectId: string, jobId: string, stepId: string): Promise<void> {
  // Verify job belongs to project first
  const [job] = await db.select().from(writingJobs).where(
    and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
  )
  if (!job)
    throw new Error('Job not found')

  // Verify the step is a confirm step
  const [step] = await db.select().from(writingJobSteps).where(
    and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId)),
  )
  if (!step)
    throw new Error('Step not found')
  if (!CONFIRM_STEPS.has(step.stepType))
    throw new Error('Step is not a confirm step')
  if (step.status !== 'completed')
    throw new Error('Step is not in a confirmable state')

  // Get all steps to find the index of this step
  const allSteps = await getJobSteps(jobId)
  const currentIdx = allSteps.findIndex(s => s.id === stepId)
  if (currentIdx === -1)
    throw new Error('Step not found in sequence')

  // Mark the current confirm step as completed
  await updateStep(stepId, { status: 'completed', finishedAt: now() })

  // If this was a change set review, mark the change set as approved
  if (step.stepType === 'review_change_set' && step.changeSetId) {
    await approveChangeSetSvc(projectId, step.changeSetId)
  }

  // Continue execution from the next step
  await runNextSteps(projectId, jobId)
}

export async function rejectStep(projectId: string, jobId: string, stepId: string, reason?: string): Promise<void> {
  const [job] = await db.select().from(writingJobs).where(
    and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
  )
  if (!job)
    throw new Error('Job not found')

  const [step] = await db.select().from(writingJobSteps).where(
    and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId)),
  )
  if (!step)
    throw new Error('Step not found')
  if (!CONFIRM_STEPS.has(step.stepType))
    throw new Error('Step is not a confirm step')

  // Mark the confirm step as failed with the rejection reason
  await updateStep(stepId, {
    status: 'failed',
    error: reason || 'User rejected',
    finishedAt: now(),
  })

  // If this was a change set review, mark the change set as rejected
  if (step.stepType === 'review_change_set' && step.changeSetId) {
    await rejectChangeSetSvc(projectId, step.changeSetId)
  }

  // Also mark the preceding generation step as failed (so it can be retried)
  const allSteps = await getJobSteps(jobId)
  const currentIdx = allSteps.findIndex(s => s.id === stepId)

  if (currentIdx > 0) {
    const prevStep = allSteps[currentIdx - 1]
    if (prevStep && (prevStep.stepType === 'generate_plan' || prevStep.stepType === 'generate_draft' || prevStep.stepType === 'postprocess')) {
      await updateStep(prevStep.id, {
        status: 'failed',
        error: reason || 'Output rejected by user',
        finishedAt: now(),
      })
    }
  }

  // Mark all subsequent steps as skipped
  for (let i = currentIdx + 1; i < allSteps.length; i++) {
    if (allSteps[i].status === 'pending') {
      await updateStep(allSteps[i].id, { status: 'skipped', finishedAt: now() })
    }
  }

  await updateJobStatus(jobId, 'failed', reason || 'User rejected output')
}

export async function retryStep(projectId: string, jobId: string, stepId: string): Promise<void> {
  // Verify job belongs to project before any state changes
  const [job] = await db.select().from(writingJobs).where(
    and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
  )
  if (!job)
    throw new Error('Job not found')

  const [step] = await db.select().from(writingJobSteps).where(
    and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId)),
  )
  if (!step)
    throw new Error('Step not found')
  if (step.status !== 'failed')
    throw new Error('Only failed steps can be retried')

  // Find the generate step that corresponds to this confirm step
  const allSteps = await getJobSteps(jobId)
  const currentIdx = allSteps.findIndex(s => s.id === stepId)

  let retryFromIdx = currentIdx

  // If this is a confirm step, retry from the generation step before it
  if (CONFIRM_STEPS.has(step.stepType) && currentIdx > 0) {
    const prevStep = allSteps[currentIdx - 1]
    if (prevStep) {
      // Reset the generation step too
      await updateStep(prevStep.id, {
        status: 'pending',
        error: null,
        startedAt: null,
        finishedAt: null,
        output: null,
      })
      retryFromIdx = currentIdx - 1
    }
  }

  // Reset this step
  await updateStep(stepId, {
    status: 'pending',
    error: null,
    startedAt: null,
    finishedAt: null,
  })

  // Reset all subsequent pending/skipped steps to pending
  for (let i = retryFromIdx + 1; i < allSteps.length; i++) {
    if (allSteps[i].status === 'failed' || allSteps[i].status === 'skipped') {
      await updateStep(allSteps[i].id, {
        status: 'pending',
        error: null,
        startedAt: null,
        finishedAt: null,
      })
    }
  }

  // Run from the retry point
  await runNextSteps(projectId, jobId)
}
