import type {
  AutonomousStrategy,
  AutoRiskLevel,
  WritingJob,
  WritingJobStep,
} from '@ai-novel/shared'

export interface AutoDecisionResult {
  action: 'continue' | 'repair' | 'isolate' | 'skip' | 'stop_run'
  riskLevel: AutoRiskLevel
  reason: string
  report: Record<string, any>
}

/**
 * 全自动决策服务
 * 根据任务步骤的输出、风险等级和运行策略，决定下一步动作
 */
export async function decideNextAction(input: {
  projectId: string
  job: WritingJob
  step: WritingJobStep
  previousOutputs: Map<string, string>
  runStrategy: AutonomousStrategy
}): Promise<AutoDecisionResult> {
  const { step, runStrategy } = input

  // 1. 基础异常判断
  if (step.status === 'failed') {
    return {
      action: 'stop_run',
      riskLevel: 'critical',
      reason: `步骤执行失败: ${step.error || '未知错误'}`,
      report: { error: step.error },
    }
  }

  // 2. 根据步骤类型进行风险评估
  let riskLevel: AutoRiskLevel = 'none'
  let report: Record<string, any> = {}
  let reason = '自动通过：风险较低'

  switch (step.stepType) {
    case 'consistency_check': {
      const consistencyData = tryParseJson(step.output)
      if (consistencyData) {
        riskLevel = mapConsistencyRisk(consistencyData.overallStatus)
        report = consistencyData
        reason = `一致性检查结果: ${consistencyData.overallStatus}`
      }
      break
    }

    case 'review_change_set': {
      // 变更集审查通常由 LLM 或规则给出风险评分
      const reviewData = tryParseJson(step.output)
      if (reviewData) {
        riskLevel = reviewData.riskLevel || 'medium'
        report = reviewData
        reason = `变更集风险评估: ${riskLevel}`
      }
      break
    }

    case 'auto_repair': {
      const repairData = tryParseJson(step.output)
      if (repairData) {
        riskLevel = repairData.success ? 'low' : 'high'
        report = repairData
        reason = repairData.success ? '自动修复成功' : '自动修复失败，风险仍较高'
      }
      break
    }

    default:
      riskLevel = 'low'
      reason = '常规步骤，自动继续'
  }

  // 3. 根据策略和风险等级决定 Action
  const action = getActionByStrategy(runStrategy, riskLevel)

  return {
    action,
    riskLevel,
    reason,
    report,
  }
}

function tryParseJson(str: string | null): any {
  if (!str)
    return null
  try {
    return JSON.parse(str)
  }
  catch {
    return null
  }
}

function mapConsistencyRisk(status: string): AutoRiskLevel {
  switch (status) {
    case 'blocked': return 'high'
    case 'warning': return 'medium'
    case 'pass': return 'low'
    default: return 'none'
  }
}

function getActionByStrategy(strategy: AutonomousStrategy, risk: AutoRiskLevel): AutoDecisionResult['action'] {
  // critical 风险任何策略都停止
  if (risk === 'critical')
    return 'stop_run'

  if (strategy === 'safe') {
    if (risk === 'none' || risk === 'low')
      return 'continue'
    if (risk === 'medium')
      return 'repair'
    return 'isolate' // high risk isolate
  }

  if (strategy === 'balanced') {
    if (risk === 'none' || risk === 'low' || risk === 'medium')
      return 'continue'
    if (risk === 'high')
      return 'repair'
    return 'isolate'
  }

  if (strategy === 'fast') {
    return 'continue' // fast 模式几乎不阻塞，除非崩溃
  }

  return 'continue'
}
