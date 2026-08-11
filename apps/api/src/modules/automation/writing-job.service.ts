import type { AutonomousStrategy, CreateWritingJobInput, WritingJob, WritingJobStepType } from '@ai-novel/shared'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { autonomousRunExceptions, autonomousRunJobs, autonomousWritingRuns, chapters, chapterScenes, projectHealthReports, writingJobs, writingJobSteps } from '../../db/schema'
import { assertOptionalChapterBelongsToProject } from '../../shared/ownership'
import { errorMessage, generateId, now } from '../../shared/utils'
import { renderAIContext } from '../ai/ai-context-renderer'
import { createAIContextSnapshot } from '../ai/ai-context-snapshot.service'
import { buildProjectAIContext } from '../ai/ai-context.service'
import { callAIJSON, getEffectiveAISettings } from '../ai/ai.service'
import { runConsistencyGuard } from '../ai/consistency-guard.service'
import { AuthoringEventService } from '../narrative/authoring-event.service'
import { getProjectHealthMetrics } from '../narrative/health-metrics.service'
import { createSnapshot } from '../story/version.service'
import { decideNextAction } from './auto-decision.service'
import { attemptAutoRepair, attemptAutoRepairPlan } from './auto-repair.service'
import { applyChangeSet as applyChangeSetSvc, approveChangeSet as approveChangeSetSvc, createChapterChangeSet, rejectChangeSet as rejectChangeSetSvc } from './chapter-change-set.service'
import { extractChapterChanges, runChapterPostprocess, runScenePostprocess } from './chapter-postprocess.service'
import { applyAutoSuggestions, getSuggestions } from './postprocess-suggestion.service'
import { runGraphInference } from './story-graph-inference.service'

function mapActionToDecision(action: 'continue' | 'repair' | 'isolate' | 'skip' | 'stop_run'): 'approved' | 'medium_risk_repair' | 'isolated' | 'skipped' | 'failed' {
  switch (action) {
    case 'continue': return 'approved'
    case 'repair': return 'medium_risk_repair'
    case 'isolate': return 'isolated'
    case 'skip': return 'skipped'
    case 'stop_run': return 'failed'
  }
}

type JobMode = 'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'
type WritingJobStatus = NonNullable<typeof writingJobs.$inferInsert['status']>
type TerminalWritingJobStatus = 'completed' | 'failed' | 'isolated'
type JobStepUpdate = Partial<typeof writingJobSteps.$inferInsert>
type SceneBeatType = NonNullable<typeof chapterScenes.$inferInsert['beatType']>

interface GeneratedScenePlan {
  sceneNumber?: number
  title?: string
  location?: string
  purpose?: string
  summary?: string
  characters?: string[]
  conflict?: string
  conflictLevel?: number
  beatType?: string
}

interface GeneratedChapterPlan extends Record<string, unknown> {
  title?: string
  goals?: string
  conflicts?: string
  events?: string
  emotionalArc?: string
  foreshadowing?: string
  endingHook?: string
  outline?: string
  scenes?: GeneratedScenePlan[]
}

function normalizeSceneBeatType(value?: string): SceneBeatType {
  const valid = new Set<SceneBeatType>(['hook', 'setup', 'reveal', 'conflict', 'reversal', 'payoff', 'transition', 'cliffhanger'])
  return value && valid.has(value as SceneBeatType) ? value as SceneBeatType : 'setup'
}

function isTerminalWritingJobStatus(status: WritingJobStatus): status is TerminalWritingJobStatus {
  return status === 'completed' || status === 'failed' || status === 'isolated'
}

const STEP_SEQUENCE: Record<JobMode, WritingJobStepType[]> = {
  outline_only: [
    'prepare_context',
    'generate_plan',
    'validate_plan',
    'update_health',
    'auto_repair',
    'done',
  ],
  draft_only: [
    'prepare_context',
    'generate_draft',
    'build_change_set',
    'evaluate_change_set',
    'auto_repair',
    'apply_change_set',
    'postprocess',
    'classify_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
  outline_then_draft: [
    'prepare_context',
    'generate_plan',
    'validate_plan',
    'generate_draft',
    'build_change_set',
    'evaluate_change_set',
    'auto_repair',
    'apply_change_set',
    'postprocess',
    'classify_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
  scene_draft: [
    'prepare_context',
    'generate_scene_draft',
    'validate_plan',
    'generate_draft',
    'build_change_set',
    'evaluate_change_set',
    'auto_repair',
    'apply_change_set',
    'postprocess',
    'classify_suggestions',
    'apply_suggestions',
    'update_health',
    'done',
  ],
}

export async function getLatestWritingJob(projectId: string) {
  const [activeRow] = await db.select().from(writingJobs).where(and(
    eq(writingJobs.projectId, projectId),
    inArray(writingJobs.status, ['idle', 'running']),
  )).orderBy(desc(writingJobs.createdAt))
  if (activeRow)
    return activeRow

  const [row] = await db.select().from(writingJobs).where(eq(writingJobs.projectId, projectId)).orderBy(desc(writingJobs.createdAt))
  return row ?? null
}

export async function getWritingJob(projectId: string, id: string) {
  const [row] = await db.select().from(writingJobs).where(and(
    eq(writingJobs.id, id),
    eq(writingJobs.projectId, projectId),
  ))
  return row ?? null
}

export async function createWritingJob(projectId: string, input: CreateWritingJobInput) {
  const { mode, currentChapterId, sceneId } = input
  if (['draft_only', 'outline_then_draft', 'scene_draft'].includes(mode) && !currentChapterId)
    return { row: null, error: '该写作模式必须选择目标章节，系统需要知道正文写入哪一章' }

  await assertOptionalChapterBelongsToProject(projectId, currentChapterId)
  if (mode === 'scene_draft') {
    if (!sceneId || !currentChapterId)
      return { row: null, error: 'scene_draft mode requires both sceneId and currentChapterId' }
    const [scene] = await db.select({ id: chapterScenes.id }).from(chapterScenes).where(and(
      eq(chapterScenes.id, sceneId),
      eq(chapterScenes.projectId, projectId),
      eq(chapterScenes.chapterId, currentChapterId),
    ))
    if (!scene)
      return { row: null, error: 'Scene not found or does not belong to this chapter' }
  }

  if (mode !== 'outline_only' && !currentChapterId)
    return { row: null, error: '必须选择目标章节，以便自动写入正文' }

  const id = generateId()
  const [row] = await db.insert(writingJobs).values({
    id,
    projectId,
    mode,
    currentChapterId,
    sceneId,
    executionMode: 'auto',
    status: 'idle',
  }).returning()
  await initializeJobSteps(id)
  return { row, error: null }
}

export async function pauseWritingJob(projectId: string, id: string) {
  const [row] = await db.update(writingJobs).set({
    status: 'paused',
    updatedAt: now(),
  }).where(and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId))).returning()
  return row ?? null
}

export async function continueWritingJob(projectId: string, id: string) {
  const [row] = await db.update(writingJobs).set({
    status: 'running',
    lastError: null,
    updatedAt: now(),
  }).where(and(
    eq(writingJobs.id, id),
    eq(writingJobs.projectId, projectId),
    eq(writingJobs.status, 'paused'),
  )).returning()
  return row ?? null
}

export async function deleteWritingJob(projectId: string, id: string) {
  const [row] = await db.delete(writingJobs).where(and(
    eq(writingJobs.id, id),
    eq(writingJobs.projectId, projectId),
  )).returning()
  return row ?? null
}

export async function getProjectJobSteps(projectId: string, jobId: string) {
  const job = await getWritingJob(projectId, jobId)
  return job ? getJobSteps(jobId) : null
}

const CHECKPOINT_STEPS = new Set<WritingJobStepType>([
  'validate_plan',
  'evaluate_change_set',
  'classify_suggestions',
])

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

async function updateJobStatus(jobId: string, status: WritingJobStatus, lastError?: string | null) {
  const fields: Partial<typeof writingJobs.$inferInsert> = {
    status,
    updatedAt: now(),
  }
  if (lastError !== undefined) {
    fields.lastError = lastError
  }
  await db.update(writingJobs).set(fields).where(eq(writingJobs.id, jobId))

  // P1-3: 如果是自动驾驶任务，通知 Run 进度
  if (isTerminalWritingJobStatus(status)) {
    const [job] = await db.select({ projectId: writingJobs.projectId }).from(writingJobs).where(eq(writingJobs.id, jobId))
    if (job) {
      // 动态导入避免循环依赖
      const { handleAutonomousJobCompletion } = await import('./autonomous-writing.service')
      await handleAutonomousJobCompletion(
        job.projectId,
        jobId,
        status,
        lastError || undefined,
      )
    }
  }
}

async function updateStep(stepId: string, fields: JobStepUpdate) {
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
    modelProvider: settings.provider,
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

  const plan = await callAIJSON<Record<string, unknown>>(messages, { temperature: 60 })
  const output = JSON.stringify(plan)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeGeneratePlan(
  contextOutput: string,
  chapterTitle: string | null,
  stepId: string,
  projectId?: string,
  chapterId?: string | null,
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
  "outline": "详细章节大纲（300-500字，包含场景描述、角色行动、对话要点和转折点）",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "场景标题",
      "location": "发生地点",
      "purpose": "此场景在剧情、关系或伏笔上的作用",
      "summary": "场景梗概",
      "characters": ["出场角色"],
      "conflict": "场景内局部冲突",
      "conflictLevel": 5,
      "beatType": "setup"
    }
  ]
}

要求：
- 大纲必须与前后章节连贯
- 角色行为必须符合已有性格和动机
- 必须推进主线或支线剧情
- 注意伏笔的埋设和回收
- 必须拆出 3-5 个可执行场景，后续正文将严格按这些场景推进`,
    },
  ]

  const plan = await callAIJSON<GeneratedChapterPlan>(messages, { temperature: 60 })

  if (projectId && chapterId) {
    await db.transaction(async (tx) => {
      await tx.update(chapters).set({
        title: typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim() : undefined,
        goals: typeof plan.goals === 'string' ? plan.goals : null,
        conflicts: typeof plan.conflicts === 'string' ? plan.conflicts : null,
        events: typeof plan.events === 'string' ? plan.events : null,
        emotionalArc: typeof plan.emotionalArc === 'string' ? plan.emotionalArc : null,
        foreshadowing: typeof plan.foreshadowing === 'string' ? plan.foreshadowing : null,
        endingHook: typeof plan.endingHook === 'string' ? plan.endingHook : null,
        outline: typeof plan.outline === 'string' ? plan.outline : null,
        status: 'planning',
        updatedAt: now(),
      }).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

      if (Array.isArray(plan.scenes) && plan.scenes.length > 0) {
        await tx.delete(chapterScenes).where(and(
          eq(chapterScenes.projectId, projectId),
          eq(chapterScenes.chapterId, chapterId),
        ))

        await tx.insert(chapterScenes).values(plan.scenes.slice(0, 8).map((scene, index) => ({
          id: generateId(),
          projectId,
          chapterId,
          sceneNumber: Number(scene.sceneNumber) || index + 1,
          title: typeof scene.title === 'string' ? scene.title : `场景 ${index + 1}`,
          location: typeof scene.location === 'string' ? scene.location : null,
          purpose: typeof scene.purpose === 'string' ? scene.purpose : null,
          summary: typeof scene.summary === 'string' ? scene.summary : null,
          characters: Array.isArray(scene.characters) ? JSON.stringify(scene.characters) : null,
          conflict: typeof scene.conflict === 'string' ? scene.conflict : null,
          conflictLevel: Number(scene.conflictLevel) || 5,
          beatType: normalizeSceneBeatType(scene.beatType),
          status: 'planned' as const,
          orderIndex: index + 1,
          createdAt: now(),
          updatedAt: now(),
        })))
      }
    })
  }

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

  const draft = await callAIJSON<{ title: string, draft: string, wordCount: number }>(messages, { temperature: 70 })
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
    status: 'completed',
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
    'Writing job applied draft',
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
  _job: WritingJob,
): Promise<string> {
  if (!chapterId) {
    await updateStep(stepId, { output: JSON.stringify({ skipped: true, reason: 'no_chapter' }) })
    return JSON.stringify({ skipped: true })
  }

  const result = await applyAutoSuggestions(projectId, chapterId, 'aggressive')
  const output = JSON.stringify(result)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeClassifySuggestions(
  projectId: string,
  chapterId: string | null,
  stepId: string,
): Promise<string> {
  if (!chapterId) {
    const output = JSON.stringify({ skipped: true, reason: 'no_chapter' })
    await updateStep(stepId, { output, updatedAt: now() })
    return output
  }

  const suggestions = await getSuggestions(projectId, chapterId)
  const pending = suggestions.filter(s => s.status === 'pending')
  const output = JSON.stringify({
    total: suggestions.length,
    pending: pending.length,
    highConfidence: pending.filter(s => (s.confidence || 0) >= 80).length,
    lowConfidence: pending.filter(s => (s.confidence || 0) < 80).length,
    nextAction: 'auto_apply_high_confidence',
  })
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeUpdateHealth(
  projectId: string,
  stepId: string,
): Promise<void> {
  const metrics = await getProjectHealthMetrics(projectId)
  const topRisks = metrics.risks.slice(0, 5).map(risk => ({
    id: risk.id,
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

async function executeValidatePlan(
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  planOutput: string,
  stepId: string,
): Promise<string> {
  const plan = JSON.parse(planOutput)

  const context = await buildProjectAIContext({
    projectId,
    scene: 'outline',
    chapterId: chapterId || undefined,
    sceneId: sceneId || undefined,
    userInstruction: '诊断以下大纲是否存在逻辑冲突或偏离故事设定',
  })
  const rendered = renderAIContext(context)

  const prompt = `
你是一位资深的网络小说主编和一致性校验专家。请根据故事背景、设定集、最近的章节摘要等上下文，校验新生成的这一章大纲是否存在逻辑冲突或设定偏差。

【故事上下文】
${rendered}

【新生成的大纲】
标题: ${plan.title || ''}
目标: ${plan.goals || ''}
冲突: ${plan.conflicts || ''}
事件: ${plan.events || ''}
详细大纲: ${plan.outline || ''}

请进行严格的审查，诊断是否存在以下问题：
1. 角色行为动机是否合理，是否与已有人物性格或设定冲突。
2. 设定的地理位置、超凡规则或已有事实是否出现严重的矛盾与偏离。
3. 剧情走向是否存在明显的硬伤。

请返回严格的 JSON 格式：
{
  "status": "pass" | "warning" | "blocked",
  "issues": [
    {
      "type": "character" | "plot" | "setting" | "other",
      "severity": "warning" | "blocked",
      "description": "具体冲突描述"
    }
  ],
  "suggestions": "具体的修改意见和优化建议"
}
`.trim()

  const report = await callAIJSON<{
    status: 'pass' | 'warning' | 'blocked'
    issues: Array<{ type: string, severity: 'warning' | 'blocked', description: string }>
    suggestions: string
  }>([
    { role: 'user', content: prompt },
  ], {
    temperature: 30, // 0.3
    metadata: {
      projectId,
      taskType: 'validate_plan',
    },
  })

  const output = JSON.stringify(report)
  await updateStep(stepId, { output, updatedAt: now() })
  return output
}

async function executeEvaluateChangeSet(
  projectId: string,
  changeSetId: string | null,
  stepId: string,
  previousOutputs: Map<string, string>,
): Promise<string> {
  if (!changeSetId) {
    throw new Error('Change set ID is required for evaluation')
  }

  const buildOutputStr = previousOutputs.get('build_change_set') || '{}'
  const buildOutput = JSON.parse(buildOutputStr)
  const riskLevel = buildOutput.riskLevel || 'low'

  const report = {
    riskLevel,
    reason: buildOutput.consistencyReport?.overallStatus === 'warning' ? '一致性检查发现警告' : '基本通过',
    consistencyReport: buildOutput.consistencyReport,
  }

  if (riskLevel === 'medium' || riskLevel === 'high') {
    const prompt = `
你是一位资深的小说审校主编。请评估以下变更集对小说的一致性风险。

【一致性检查结果】
得分: ${buildOutput.consistencyReport?.score || 100}
状态: ${buildOutput.consistencyReport?.overallStatus || 'pass'}

请审阅当前变更集，给出一个具体的风险评估报告：
请返回 JSON 格式：
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "reason": "具体的评估理由说明",
  "detail": "具体的评估细则"
}
`.trim()
    try {
      const aiReport = await callAIJSON<{ riskLevel: string, reason: string, detail: string }>([
        { role: 'user', content: prompt },
      ], {
        temperature: 20,
        metadata: { projectId, taskType: 'evaluate_change_set' },
      })

      const output = JSON.stringify({
        riskLevel: aiReport.riskLevel,
        reason: aiReport.reason,
        detail: aiReport.detail,
        consistencyReport: buildOutput.consistencyReport,
      })
      await updateStep(stepId, { output, changeSetId, updatedAt: now() })
      return output
    }
    catch {
      // fallback
    }
  }

  const output = JSON.stringify(report)
  await updateStep(stepId, { output, changeSetId, updatedAt: now() })
  return output
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

// ---- Core engine: auto-execute steps until automation completes or isolates a blocking issue ----

async function executeStep(
  step: typeof writingJobSteps.$inferSelect,
  projectId: string,
  chapterId: string | null,
  sceneId: string | null,
  job: WritingJob,
  previousStepOutputs: Map<string, string>,
): Promise<boolean> {
  // Returns true if execution should continue, false if the automation isolated a blocking issue

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
        await executeGeneratePlan(contextOutput, chapterTitle, step.id, projectId, chapterId)
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

      case 'validate_plan': {
        const planOutput = job.mode === 'scene_draft'
          ? previousStepOutputs.get('generate_scene_draft') || '{}'
          : previousStepOutputs.get('generate_plan') || '{}'
        await executeValidatePlan(projectId, chapterId, sceneId, planOutput, step.id)
        return false
      }

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
        await executeConsistencyCheck(projectId, chapterId, sceneId, draftOutput, step.id)
        return true
      }

      case 'apply_draft': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        if (job.mode === 'scene_draft') {
          await executeApplySceneDraft(projectId, sceneId, draftOutput, step.id, true)
        }
        else {
          await executeApplyDraft(projectId, chapterId, draftOutput, step.id, true)
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

      case 'classify_suggestions':
        await executeClassifySuggestions(projectId, chapterId, step.id)
        break

      case 'apply_suggestions':
        await executeApplySuggestions(projectId, chapterId, step.id, job)
        break

      case 'build_change_set': {
        const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
        await executeBuildChangeSet(projectId, chapterId, sceneId, draftOutput, step.id, job.id)
        break
      }

      case 'evaluate_change_set': {
        const buildOutput = previousStepOutputs.get('build_change_set') || '{}'
        const { changeSetId } = JSON.parse(buildOutput)
        await executeEvaluateChangeSet(projectId, changeSetId, step.id, previousStepOutputs)
        return false
      }

      case 'apply_change_set': {
        // Find changeSetId from previous build_change_set step
        const buildOutput = previousStepOutputs.get('build_change_set') || '{}'
        const { changeSetId } = JSON.parse(buildOutput)
        await executeApplyChangeSet(projectId, changeSetId, step.id)
        break
      }

      case 'auto_repair': {
        const reviewSteps = await getJobSteps(job.id)
        const validatePlanStep = reviewSteps.find(s => s.stepType === 'validate_plan')
        const evaluateChangeSetStep = reviewSteps.find(s => s.stepType === 'evaluate_change_set')

        const isPlanRepair = validatePlanStep && validatePlanStep.autoDecision === 'medium_risk_repair'
        const isChangeSetRepair = evaluateChangeSetStep && evaluateChangeSetStep.autoDecision === 'medium_risk_repair'

        const needsRepair = isPlanRepair || isChangeSetRepair

        if (!needsRepair) {
          await updateStep(step.id, { status: 'skipped', autoDecisionReason: 'No repair needed - checks passed' })
          return true
        }

        if (isPlanRepair) {
          const planOutputStr = job.mode === 'scene_draft'
            ? previousStepOutputs.get('generate_scene_draft') || '{}'
            : previousStepOutputs.get('generate_plan') || '{}'

          const validateReportStr = validatePlanStep.output || '{}'
          const validateReport = JSON.parse(validateReportStr)

          const repairResult = await attemptAutoRepairPlan({
            projectId,
            planContent: planOutputStr,
            validateReport,
          })

          if (repairResult.repaired) {
            const targetStepType = job.mode === 'scene_draft' ? 'generate_scene_draft' : 'generate_plan'
            const generateStep = reviewSteps.find(s => s.stepType === targetStepType)
            if (generateStep) {
              await updateStep(generateStep.id, { output: repairResult.planContent })
            }

            await db.update(writingJobSteps).set({
              status: 'pending',
              output: null,
              finishedAt: null,
              autoDecision: null,
              autoDecisionReason: null,
              updatedAt: now(),
            }).where(and(
              eq(writingJobSteps.jobId, job.id),
              eq(writingJobSteps.stepType, 'validate_plan'),
            ))

            await updateStep(step.id, { status: 'completed', output: JSON.stringify({ success: true, report: repairResult.repairReport }) })
          }
          else {
            await updateStep(step.id, { status: 'completed', output: JSON.stringify({ success: false, error: typeof repairResult.repairReport === 'string' ? repairResult.repairReport : JSON.stringify(repairResult.repairReport) }) })
            return false
          }
        }
        else {
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
            strategy: 'balanced',
          })

          if (repairResult.repaired) {
            const updatedDraftOutput = { ...draftOutput, draft: repairResult.draftContent }
            const generateDraftStep = reviewSteps.find(s => s.stepType === 'generate_draft')
            if (generateDraftStep) {
              await updateStep(generateDraftStep.id, { output: JSON.stringify(updatedDraftOutput) })
            }

            const oldBuildStep = reviewSteps.find(s => s.stepType === 'build_change_set' && s.changeSetId)
            if (oldBuildStep?.changeSetId) {
              await rejectChangeSetSvc(projectId, oldBuildStep.changeSetId)
            }

            await db.update(writingJobSteps).set({
              status: 'pending',
              output: null,
              changeSetId: null,
              finishedAt: null,
              autoDecision: null,
              autoDecisionReason: null,
              updatedAt: now(),
            }).where(and(
              eq(writingJobSteps.jobId, job.id),
              or(eq(writingJobSteps.stepType, 'build_change_set'), eq(writingJobSteps.stepType, 'evaluate_change_set')),
            ))

            await updateStep(step.id, { status: 'completed', output: JSON.stringify({ success: true, report: repairResult.repairReport }) })
          }
          else {
            await updateStep(step.id, { status: 'completed', output: JSON.stringify({ success: false, error: repairResult.repairReport }) })
            return false
          }
        }
        break
      }

      case 'update_health':
        await executeUpdateHealth(projectId, step.id)
        break

      case 'done':
        await updateStep(step.id, { status: 'completed', output: JSON.stringify({ finished: true }), finishedAt: now() })
        return true

      default:
        await updateStep(step.id, { status: 'skipped', finishedAt: now() })
        return true
    }

    // Mark as completed if we reached here successfully
    await updateStep(step.id, { status: 'completed', finishedAt: now() })
    return true
  }
  catch (error: unknown) {
    const message = errorMessage(error, 'Unknown error')
    await updateStep(step.id, {
      status: 'failed',
      error: message,
      finishedAt: now(),
    })
    await updateJobStatus(step.jobId, 'failed', message)
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
      // Auto mode: classify error and handle automatically
      let strategy: AutonomousStrategy = 'balanced'
      if (job.autonomousRunId) {
        const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, job.autonomousRunId))
        if (run)
          strategy = run.strategy
      }

      const [failedStep] = await db.select().from(writingJobSteps).where(eq(writingJobSteps.id, step.id))
      const decision = await decideNextAction({
        projectId,
        job,
        step: failedStep,
        previousOutputs,
        runStrategy: strategy,
      })

      await db.update(writingJobSteps).set({
        autoDecision: mapActionToDecision(decision.action),
        autoRiskLevel: decision.riskLevel,
        autoDecisionReason: decision.reason,
        autoDecisionReport: decision.report,
        updatedAt: now(),
      }).where(eq(writingJobSteps.id, step.id))

      if (decision.action === 'isolate' || decision.action === 'skip') {
        await updateJobStatus(jobId, 'isolated', decision.reason)
        if (job.autonomousRunId) {
          await db.update(autonomousRunJobs).set({
            status: 'isolated',
            isolationReason: decision.reason,
            isolationReport: decision.report,
            updatedAt: now(),
          }).where(and(eq(autonomousRunJobs.runId, job.autonomousRunId), eq(autonomousRunJobs.writingJobId, jobId)))
        }
        return
      }

      // Default for failed steps in auto mode: mark job failed, propagate to run
      await updateJobStatus(jobId, 'failed', decision.reason)
      return
    }

    const shouldContinue = await executeStep(
      step,
      projectId,
      chapter?.id || null,
      scene?.id || null,
      job,
      previousOutputs,
    )

    if (!shouldContinue) {
      // 获取最新 step 状态（包含 output）
      const [updatedStep] = await db.select().from(writingJobSteps).where(eq(writingJobSteps.id, step.id))

      // 获取当前运行策略（从 run 中获取，如果 job 属于某个 run）
      let strategy: AutonomousStrategy = 'balanced'
      if (job.autonomousRunId) {
        const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, job.autonomousRunId))
        if (run)
          strategy = run.strategy
      }

      const decision = await decideNextAction({
        projectId,
        job,
        step: updatedStep,
        previousOutputs,
        runStrategy: strategy,
      })

      // 更新步骤决策信息
      await db.update(writingJobSteps).set({
        autoDecision: mapActionToDecision(decision.action),
        autoRiskLevel: decision.riskLevel,
        autoDecisionReason: decision.reason,
        autoDecisionReport: decision.report,
        status: 'completed',
        finishedAt: now(),
        updatedAt: now(),
      }).where(eq(writingJobSteps.id, step.id))

      if (decision.action === 'continue') {
        // P1-1: 自动通过变更集后必须将变更项转入可应用状态
        if (step.stepType === 'evaluate_change_set' && updatedStep.changeSetId) {
          await approveChangeSetSvc(projectId, updatedStep.changeSetId)
        }
        continue
      }

      if (decision.action === 'repair') {
        const hasTriedRepair = allSteps.some(s => s.stepType === 'auto_repair' && s.status !== 'pending')
        if (!hasTriedRepair) {
          await db.update(writingJobSteps).set({ status: 'pending', updatedAt: now() }).where(and(eq(writingJobSteps.jobId, jobId), eq(writingJobSteps.stepType, 'auto_repair')))

          await updateJobStatus(jobId, 'running', '正在执行自动修复...')
          continue
        }
        // 如果已经尝试过修复依然决策为 repair，则升级为 isolate
        decision.action = 'isolate'
      }

      if (decision.action === 'isolate') {
        await updateJobStatus(jobId, 'isolated', decision.reason)

        if (job.autonomousRunId) {
          await db.update(autonomousRunJobs).set({
            status: 'isolated',
            isolationReason: decision.reason,
            isolationReport: decision.report,
            updatedAt: now(),
          }).where(and(eq(autonomousRunJobs.runId, job.autonomousRunId), eq(autonomousRunJobs.writingJobId, jobId)))
        }
        return
      }

      if (decision.action === 'stop_run') {
        await updateJobStatus(jobId, 'failed', decision.reason)
        if (job.autonomousRunId) {
          // Record critical exception
          await db.insert(autonomousRunExceptions).values({
            id: generateId(),
            runId: job.autonomousRunId,
            projectId,
            chapterId: job.currentChapterId,
            writingJobId: jobId,
            stepId: step.id,
            exceptionType: 'ai_failed',
            severity: 'critical',
            title: 'Critical Error - Run Stopped',
            description: decision.reason,
            status: 'open',
            createdAt: now(),
            updatedAt: now(),
          }).catch(err => console.error('Failed to record stop_run exception:', err))

          await db
            .update(autonomousRunJobs)
            .set({ status: 'failed', updatedAt: now() })
            .where(and(eq(autonomousRunJobs.runId, job.autonomousRunId), eq(autonomousRunJobs.writingJobId, jobId)))

          await db.update(autonomousWritingRuns).set({
            status: 'failed',
            lastError: decision.reason,
            failedChapterCount: sql`${autonomousWritingRuns.failedChapterCount} + 1`,
            updatedAt: now(),
          }).where(eq(autonomousWritingRuns.id, job.autonomousRunId))
        }
        return
      }

      // Safety net for unexpected decision actions
      await updateJobStatus(jobId, 'failed', `Unhandled decision action: ${decision.action}`)
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

  // Find the generate step that corresponds to this checkpoint step
  const allSteps = await getJobSteps(jobId)
  const currentIdx = allSteps.findIndex(s => s.id === stepId)

  let retryFromIdx = currentIdx

  // If this is a checkpoint step, retry from the generation step before it
  if (CHECKPOINT_STEPS.has(step.stepType) && currentIdx > 0) {
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
