import type { ConsistencyGuardReport, RunConsistencyCheckInput } from '@ai-novel/shared'
import { buildProjectAIContext, renderAIContext } from './ai-context.service'
import { createOpenAIClient, getEffectiveAISettings } from './ai.service'

export async function runConsistencyGuard(projectId: string, input: RunConsistencyCheckInput): Promise<ConsistencyGuardReport> {
  const { chapterId, generatedText, sourceInstruction, scene } = input
  const settings = await getEffectiveAISettings()
  if (!settings.apiKey) {
    throw new Error('AI 服务未配置')
  }

  const context = await buildProjectAIContext({
    projectId,
    scene,
    chapterId,
    userInstruction: sourceInstruction,
  })
  const contextPrompt = renderAIContext(context)

  const fullPrompt = `你是一位严谨的小说一致性守卫。你的任务是审查 AI 生成的内容是否偏离了作品的已有设定、人物性格、剧情逻辑和文风。

【审查任务】
你正在审查场景 scene=${scene} 的 AI 生成结果。请根据该场景的具体上下文判断生成内容是否违背主题、人物、设定、前后文和风格。

${contextPrompt}

---

【待审查生成内容】
${generatedText}

---

请对上述生成内容进行“一致性审查”，并返回严格的 JSON 格式。

要求：
1. overallStatus: "pass" (无风险), "warning" (轻微偏差), "blocked" (严重冲突/人物崩坏/设定漂移)。
2. score: 0-100 的一致性得分。
3. 必须分别对 themeAlignment, plotContinuity, characterConsistency, worldRuleConsistency, foreshadowingConsistency, styleConsistency 这六个维度进行评分和原因说明。
4. risks: 具体的风险点列表。
5. suggestedFixes: 具体的修改建议列表。

返回 JSON 格式（不要包含 markdown 代码块标记）：
{
  "overallStatus": "pass" | "warning" | "blocked",
  "score": number,
  "themeAlignment": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "plotContinuity": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "characterConsistency": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "worldRuleConsistency": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "foreshadowingConsistency": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "styleConsistency": { "status": "pass" | "warning" | "blocked", "score": number, "reason": "string" },
  "risks": [
    { "severity": "low" | "medium" | "high", "type": "theme_drift" | "plot_gap" | "character_ooc" | "world_rule_break" | "foreshadowing_break" | "style_drift" | "new_unapproved_fact", "message": "string", "evidence": "string" }
  ],
  "suggestedFixes": ["string"]
}

注意：
- 评价必须客观且严厉。
- 如果生成内容很少，只要不违背设定即可给 pass。
- 严禁空话，必须结合【待审查生成内容】的具体文字给出理由。`

  try {
    const client = createOpenAIClient(settings)
    const response = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('AI 返回内容为空')
    }

    return JSON.parse(content) as ConsistencyGuardReport
  }
  catch (e: any) {
    console.error('Consistency Guard Error:', e)
    throw new Error(`一致性检查失败: ${e.message}`)
  }
}
