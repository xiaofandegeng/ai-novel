import type { WritingJobStepType } from '@ai-novel/shared'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, chapterScenes, projectHealthReports, writingJobs, writingJobSteps } from '../db/schema'
import { generateId, now } from '../utils'
import { renderAIContext } from './ai-context-renderer'
import { createAIContextSnapshot } from './ai-context-snapshot.service'
import { buildProjectAIContext } from './ai-context.service'
import { callAIJSON, getEffectiveAISettings } from './ai.service'
import { AuthoringEventService } from './authoring-event.service'
import { runChapterPostprocess, runScenePostprocess } from './chapter-postprocess.service'
import { runConsistencyGuard } from './consistency-guard.service'
import { getProjectHealthMetrics } from './health-metrics.service'
import { applyAcceptedSuggestions } from './postprocess-suggestion.service'
import { runGraphInference } from './story-graph-inference.service'
import { createSnapshot } from './version.service'

type JobMode = 'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'

const STEP_SEQUENCE: Record<JobMode, WritingJobStepType[]> = {
  outline_only: [
    'prepare_context',
    'generate_plan',
    'confirm_plan',
    'update_health',
    'done',
  ],
  draft_only: [
    'prepare_context',
    'generate_draft',
    'consistency_check',
    'confirm_apply',
    'apply_draft',
    'save_version',
    'postprocess',
    'confirm_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
  outline_then_draft: [
    'prepare_context',
    'generate_plan',
    'confirm_plan',
    'generate_draft',
    'consistency_check',
    'confirm_apply',
    'apply_draft',
    'save_version',
    'postprocess',
    'confirm_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
  scene_draft: [
    'prepare_context',
    'generate_scene_draft',
    'confirm_plan',
    'generate_draft',
    'consistency_check',
    'confirm_apply',
    'apply_draft',
    'save_version',
    'postprocess',
    'confirm_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
}

const CONFIRM_STEPS = new Set<WritingJobStepType>([
  'confirm_plan',
  'consistency_check',
  'confirm_apply',
  'confirm_suggestions',
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
  return db.select().from(writingJobSteps).where(eq(writingJobSteps.jobId, jobId)).orderBy(asc(writingJobSteps.createdAt))
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
    const [ch] = await db.select().from(chapters).where(eq(chapters.id, job.currentChapterId))
    chapter = ch || null
  }

  let scene = null
  if (job.sceneId) {
    const [sc] = await db.select().from(chapterScenes).where(eq(chapterScenes.id, job.sceneId))
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
  return output
}

async function executeGenerateDraft(
  contextOutput: string,
  planOutput: string,
  stepId: string,
): Promise<string> {
  const parsedContext = JSON.parse(contextOutput)
  const contextPrompt = parsedContext.rendered || ''
  const plan = JSON.parse(planOutput)

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
5. 字数控制在 2000-4000 字
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
  return output
}

async function executeApplyDraft(
  projectId: string,
  chapterId: string | null,
  draftOutput: string,
  stepId: string,
): Promise<string> {
  if (!chapterId)
    throw new Error('没有可写入的章节')

  const draft = JSON.parse(draftOutput)
  const content = typeof draft.draft === 'string' ? draft.draft.trim() : ''
  if (!content)
    throw new Error('生成正文为空，无法写入章节')

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

  const output = JSON.stringify({
    chapterId,
    wordCount: content.length,
    title: row.title,
  })

  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
  return output
}

async function executeApplySceneDraft(
  projectId: string,
  sceneId: string | null,
  draftOutput: string,
  stepId: string,
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

  // Log event
  await AuthoringEventService.logEvent({
    projectId,
    sceneId,
    chapterId: row.chapterId,
    eventType: 'scene_write',
    source: 'ai',
    payload: { wordCount: content.length, jobId: stepId },
  }).catch(err => console.error('Failed to log authoring event:', err))

  const output = JSON.stringify({
    sceneId,
    wordCount: content.length,
    title: row.title,
  })
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
      status: 'completed',
      finishedAt: now(),
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
    await updateStep(stepId, { output: JSON.stringify({ skipped: true, reason: 'no_chapter' }), status: 'completed', finishedAt: now() })
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
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
  return output
}

async function executeApplySuggestions(
  projectId: string,
  chapterId: string | null,
  stepId: string,
): Promise<string> {
  if (!chapterId) {
    await updateStep(stepId, { output: JSON.stringify({ skipped: true, reason: 'no_chapter' }), status: 'completed', finishedAt: now() })
    return JSON.stringify({ skipped: true })
  }

  const result = await applyAcceptedSuggestions(projectId, chapterId)
  const output = JSON.stringify(result)
  await updateStep(stepId, { output, status: 'completed', finishedAt: now() })
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
  await updateStep(stepId, { output: JSON.stringify(output), status: 'completed', finishedAt: now() })
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

// ---- Core engine: auto-execute steps until hitting a confirm step or completion ----

async function executeStep(
  step: typeof writingJobSteps.$inferSelect,
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  jobMode: string,
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
        // This is a pause point — mark completed (it's a marker) and signal pause
        await updateStep(step.id, { status: 'completed', finishedAt: now() })
        return false

      case 'generate_draft': {
        const contextOutput = previousStepOutputs.get('prepare_context') || '{}'
        const planOutput = previousStepOutputs.get('generate_plan') || '{}'
        await executeGenerateDraft(contextOutput, planOutput, step.id)
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
        await updateStep(step.id, { status: 'completed', finishedAt: now() })
        return false

      case 'apply_draft': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        if (jobMode === 'scene_draft') {
          await executeApplySceneDraft(projectId, sceneId, draftOutput, step.id)
        }
        else {
          await executeApplyDraft(projectId, chapterId, draftOutput, step.id)
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
        await updateStep(step.id, { status: 'completed', finishedAt: now() })
        return false

      case 'apply_suggestions':
        await executeApplySuggestions(projectId, chapterId, step.id)
        break

      case 'update_health':
        await executeUpdateHealth(projectId, step.id)
        break

      case 'done':
        await updateStep(step.id, { status: 'completed', finishedAt: now() })
        break

      default:
        await updateStep(step.id, { status: 'skipped', finishedAt: now() })
        break
    }

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

async function runNextSteps(projectId: string, jobId: string, fromStepIndex?: number): Promise<void> {
  const { chapter, scene, job } = await getJobAndChapter(jobId, projectId)
  const allSteps = await getJobSteps(jobId)

  await updateJobStatus(jobId, 'running', null)

  const previousOutputs = await collectStepOutputs(jobId)

  const startIndex = fromStepIndex ?? allSteps.findIndex(s => s.status === 'pending')
  if (startIndex === -1) {
    // All steps done
    await updateJobStatus(jobId, 'completed', null)
    return
  }

  for (let i = startIndex; i < allSteps.length; i++) {
    const step = allSteps[i]

    // Skip already completed steps
    if (step.status === 'completed' || step.status === 'skipped') {
      continue
    }

    // If step was previously running (stale), reset to pending
    if (step.status === 'running' || step.status === 'failed') {
      // Only re-execute pending/failed steps when retrying
      if (step.status === 'failed' && fromStepIndex === undefined)
        continue
    }

    const shouldContinue = await executeStep(step, projectId, chapter?.id || null, scene?.id || null, job.mode, previousOutputs)

    // Update output cache after execution
    const [updatedStep] = await db.select().from(writingJobSteps).where(eq(writingJobSteps.id, step.id))
    if (updatedStep?.output) {
      previousOutputs.set(updatedStep.stepType, updatedStep.output)
    }

    if (!shouldContinue) {
      // Hit a confirm step — pause for user review
      await updateJobStatus(jobId, 'waiting_review', null)
      return
    }
  }

  // All steps completed
  await updateJobStatus(jobId, 'completed', null)
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

  await runNextSteps(projectId, jobId, 0)
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

  // Continue execution from the next step
  await runNextSteps(projectId, jobId, currentIdx + 1)
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
  await runNextSteps(projectId, jobId, retryFromIdx)
}
