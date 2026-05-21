import type { AutonomousStrategy, ConsistencyGuardReport } from '@ai-novel/shared'
import { callAIJSON } from './ai.service'

export async function attemptAutoRepair(input: {
  projectId: string
  chapterId: string
  draftContent: string
  consistencyReport: ConsistencyGuardReport
  strategy: AutonomousStrategy
}): Promise<{
  repaired: boolean
  draftContent: string
  repairReport: any
}> {
  const { consistencyReport, draftContent, projectId } = input

  // Decide if we should repair based on strategy and report
  const hasBlocked = Object.values(consistencyReport).some((v: any) => v.status === 'blocked')
  if (hasBlocked) {
    return { repaired: false, draftContent, repairReport: 'Cannot auto-repair blocked issues' }
  }

  const warnings = Object.entries(consistencyReport)
    .filter(([_, v]: [string, any]) => v.status === 'warning')
    .map(([k, v]: [string, any]) => ({ type: k, reason: v.reason, details: v.details }))

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
  catch (err: any) {
    console.error('Auto-repair AI call failed', err)
    return {
      repaired: false,
      draftContent,
      repairReport: `Auto-repair AI call failed: ${err.message}`,
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
  repairReport: any
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

    const result = await callAIJSON<any>([
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
  catch (err: any) {
    console.error('Auto-repair plan AI call failed', err)
    return {
      repaired: false,
      planContent,
      repairReport: `Auto-repair plan AI call failed: ${err.message}`,
    }
  }
}
