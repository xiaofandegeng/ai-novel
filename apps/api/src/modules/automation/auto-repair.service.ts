import type { AutonomousStrategy, ConsistencyGuardReport } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapters, chapterScenes, projectHealthReports } from '../../db/schema'
import { errorMessage, generateId, now } from '../../shared/utils'
import { renderAIContext } from '../ai/ai-context-renderer'
import { buildProjectAIContext } from '../ai/ai-context.service'
import { callAIJSON } from '../ai/ai.service'
import { getProjectHealthMetrics } from '../narrative/health-metrics.service'

type BeatType = NonNullable<typeof chapterScenes.$inferInsert['beatType']>
type ProjectHealthMetrics = Awaited<ReturnType<typeof getProjectHealthMetrics>>

interface GuardDimension {
  status: string
  reason?: string
  details?: unknown
}

function isGuardDimension(value: unknown): value is GuardDimension {
  return !!value && typeof value === 'object' && 'status' in value
}

function normalizeBeatType(value: string): BeatType {
  const valid = new Set<BeatType>(['hook', 'setup', 'reveal', 'conflict', 'reversal', 'payoff', 'transition', 'cliffhanger'])
  return valid.has(value as BeatType) ? value as BeatType : 'setup'
}

export async function attemptAutoRepair(input: {
  projectId: string
  chapterId: string
  draftContent: string
  consistencyReport: ConsistencyGuardReport
  strategy: AutonomousStrategy
}): Promise<{
  repaired: boolean
  draftContent: string
  repairReport: unknown
}> {
  const { consistencyReport, draftContent, projectId } = input

  // Decide if we should repair based on strategy and report
  const hasBlocked = Object.values(consistencyReport).some(value => isGuardDimension(value) && value.status === 'blocked')
  if (hasBlocked) {
    return { repaired: false, draftContent, repairReport: 'Cannot auto-repair blocked issues' }
  }

  const warnings = Object.entries(consistencyReport)
    .flatMap(([type, value]) => isGuardDimension(value) && value.status === 'warning'
      ? [{ type, reason: value.reason, details: value.details }]
      : [])

  if (warnings.length === 0) {
    return { repaired: true, draftContent, repairReport: 'No issues to repair' }
  }

  // AI logic to repair the draft
  try {
    const warningText = warnings.map(w => `- [${w.type}] ${w.reason}: ${w.details}`).join('\n')

    const prompt = `
你是一位资深的网文主编和文学医生，擅长在保持作者原笔触和风格的前提下，修复稿件中的逻辑冲突和一致性问题。

目前有一段新生成的章节草稿，经自动化一致性检查，发现了以下问题：
${warningText}

待修复草稿内容如下：
---
${draftContent}
---

请你根据上述警告信息，对草稿进行针对性的微调修复。
要求：
1. **最小化改动**：只修复冲突点，不要重写整个章节，严禁改变作者原有的文风和核心剧情。
2. **解决冲突**：确保修复后的内容不再触发上述警告（例如：修正角色位置、物品状态、称呼错误等）。
3. **连贯性**：确保修复后的文字与上下文衔接自然。

请以 JSON 格式返回修复后的结果：
{
  "repairedDraft": "修复后的完整章节正文..."
}
    `.trim()

    const result = await callAIJSON<{ repairedDraft: string }>([
      { role: 'user', content: prompt },
    ], {
      temperature: 30, // 0.3
      metadata: {
        projectId,
        taskType: 'auto_repair',
      },
    })

    return {
      repaired: true,
      draftContent: result.repairedDraft,
      repairReport: {
        originalWarnings: warnings,
        repairedAt: new Date().toISOString(),
      },
    }
  }
  catch (error: unknown) {
    console.error('Auto-repair AI call failed', error)
    return {
      repaired: false,
      draftContent,
      repairReport: `Auto-repair AI call failed: ${errorMessage(error)}`,
    }
  }
}

export async function attemptAutoRepairPlan(input: {
  projectId: string
  planContent: string
  validateReport: {
    status: 'pass' | 'warning' | 'blocked'
    issues: Array<{ type: string, severity: 'warning' | 'blocked', description: string }>
    suggestions: string
  }
}): Promise<{
  repaired: boolean
  planContent: string
  repairReport: unknown
}> {
  const { projectId, planContent, validateReport } = input

  if (validateReport.status === 'blocked') {
    return { repaired: false, planContent, repairReport: 'Cannot auto-repair blocked issues' }
  }

  const warnings = validateReport.issues || []
  if (warnings.length === 0) {
    return { repaired: true, planContent, repairReport: 'No issues to repair' }
  }

  try {
    const warningText = warnings.map(w => `- [${w.type}] ${w.description}`).join('\n')
    const originalPlan = JSON.parse(planContent)

    const prompt = `
你是一位资深的长篇小说主编和大纲优化专家，擅长微调大纲以消除逻辑漏洞和设定偏差。

目前有一份新生成的章节大纲，经大纲审查，发现了以下问题：
${warningText}

修改建议：
${validateReport.suggestions || '无'}

原大纲内容 JSON 如下：
---
${JSON.stringify(originalPlan, null, 2)}
---

请你根据上述警告信息和优化建议，对大纲 JSON 进行针对性的微调修复。
要求：
1. **最小化改动**：只针对性地修复冲突点（例如修改不合理的情节起因、微调冲突的角色动机或地理路线等），不要重写整个大纲，严禁大改核心剧情。
2. **解决冲突**：确保修复后的大纲不再触发上述警告。
3. **返回合法的 JSON 格式**，必须包含且仅包含原大纲 JSON 中的字段，并且确保它是合法的 JSON。

返回 JSON 格式：
{
  "title": "章节标题",
  "goals": "本章写作目标",
  "conflicts": "本章核心冲突",
  "events": "关键事件列表",
  "emotionalArc": "情绪曲线描述",
  "foreshadowing": "伏笔",
  "endingHook": "结尾钩子",
  "outline": "详细章节大纲"
}
`.trim()

    const result = await callAIJSON<Record<string, unknown>>([
      { role: 'user', content: prompt },
    ], {
      temperature: 30, // 0.3
      metadata: {
        projectId,
        taskType: 'auto_repair_plan',
      },
    })

    return {
      repaired: true,
      planContent: JSON.stringify(result),
      repairReport: {
        originalWarnings: warnings,
        repairedAt: new Date().toISOString(),
      },
    }
  }
  catch (error: unknown) {
    console.error('Auto-repair plan AI call failed', error)
    return {
      repaired: false,
      planContent,
      repairReport: `Auto-repair plan AI call failed: ${errorMessage(error)}`,
    }
  }
}

export async function autoPlanScenesForChapter(projectId: string, chapterId: string): Promise<{ success: boolean }> {
  // 1. 获取章节和项目信息
  const [chapter] = await db.select().from(chapters).where(
    and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)),
  )
  if (!chapter) {
    throw new Error('Chapter not found')
  }

  // 2. 获取 AI 上下文
  const context = await buildProjectAIContext({
    projectId,
    scene: 'outline',
    chapterId,
    userInstruction: '为当前章节生成详细的大纲和场景拆分规划',
  })
  const rendered = renderAIContext(context)

  const chapterInfo = `章节序号: 第 ${chapter.chapterNumber} 章, 章节标题: ${chapter.title || '待定'}`

  const prompt = `你是一位顶级的小说大纲策划师和场景拆分专家。请根据以下项目故事背景、设定集、前文摘要等上下文，为当前章节规划详细的剧情大纲，并拆分为具体的场景节拍（3-5个场景）。

【上下文环境】
${rendered}

【当前章节信息】
${chapterInfo}

请按以下严格的 JSON 格式返回规划方案，切记不要包含 Markdown 格式标记（如 \`\`\`json）：
{
  "goals": "本章核心目标和起到的承上启下作用",
  "conflicts": "本章主要矛盾冲突",
  "outline": "章节大纲细则（300字左右详细交代起因、发展、转折）",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "场景标题",
      "location": "场景发生地点",
      "purpose": "此场景在剧情/角色塑造上的目的",
      "summary": "此场景的具体情节梗概",
      "characters": ["出场角色A", "出场角色B"],
      "conflict": "此场景内的局部冲突",
      "conflictLevel": 5,
      "beatType": "setup"
    }
  ]
}
`.trim()

  const result = await callAIJSON<{
    goals: string
    conflicts: string
    outline: string
    scenes: Array<{
      sceneNumber: number
      title: string
      location: string
      purpose: string
      summary: string
      characters: string[]
      conflict: string
      conflictLevel: number
      beatType: string
    }>
  }>([
    { role: 'user', content: prompt },
  ], {
    temperature: 50,
    metadata: { projectId, chapterId, taskType: 'auto_plan_scenes' },
  })

  if (!result || !result.outline || !Array.isArray(result.scenes)) {
    throw new Error('AI 生成场景规划失败或返回格式不正确')
  }

  // 3. 在事务中写入数据库
  await db.transaction(async (tx) => {
    // A. 更新章节大纲、目标、冲突
    await tx.update(chapters).set({
      outline: result.outline,
      goals: result.goals || null,
      conflicts: result.conflicts || null,
      updatedAt: now(),
    }).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

    // B. 清除旧场景
    await tx.delete(chapterScenes).where(
      and(
        eq(chapterScenes.projectId, projectId),
        eq(chapterScenes.chapterId, chapterId),
      ),
    )

    // C. 插入新场景
    if (result.scenes.length > 0) {
      const sceneValues = result.scenes.map((s, index) => ({
        id: generateId(),
        projectId,
        chapterId,
        sceneNumber: s.sceneNumber || (index + 1),
        title: s.title || null,
        location: s.location || null,
        purpose: s.purpose || null,
        summary: s.summary || null,
        characters: s.characters ? JSON.stringify(s.characters) : null,
        conflict: s.conflict || null,
        conflictLevel: s.conflictLevel || 5,
        beatType: normalizeBeatType(s.beatType || 'setup'),
        status: 'planned' as 'planned' | 'drafting' | 'reviewed' | 'completed',
        orderIndex: index + 1,
        updatedAt: now(),
      }))
      await tx.insert(chapterScenes).values(sceneValues)
    }
  })

  // 4. 重新计算并保存项目健康度指标
  const metrics = await getProjectHealthMetrics(projectId)
  const topRisks = metrics.risks.slice(0, 5).map(risk => ({
    id: risk.id,
    severity: risk.severity,
    type: risk.type,
    title: risk.title,
    actionLabel: risk.actionLabel,
    targetRoute: risk.targetRoute,
  }))
  const { riskLevel, score } = calculateHealthScoreLocal(metrics)
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

  return { success: true }
}

function calculateHealthScoreLocal(metrics: ProjectHealthMetrics): {
  riskLevel: 'low' | 'medium' | 'high'
  score: number
} {
  const radarValues = Object.values(metrics.radarMetrics || {}) as number[]
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
