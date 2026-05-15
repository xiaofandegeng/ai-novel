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
