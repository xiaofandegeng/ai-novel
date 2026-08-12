import type {
  AutonomousStrategy,
  AutoRiskLevel,
  WritingJobStepStatus,
  WritingJobStepType,
} from '@ai-novel/shared'

interface DecisionStep {
  status: WritingJobStepStatus
  error: string | null
  stepType: WritingJobStepType
  output: string | null
}

export interface AutoDecisionResult {
  action: 'continue' | 'repair' | 'isolate' | 'skip' | 'stop_run'
  riskLevel: AutoRiskLevel
  reason: string
  report: Record<string, unknown>
}

/**
 * 全自动决策服务
 * 根据任务步骤的输出、风险等级和运行策略，决定下一步动作
 */
export async function decideNextAction(input: {
  projectId: string
  job: object
  step: DecisionStep
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
  let report: Record<string, unknown> = {}
  let reason = '自动通过：风险较低'

  switch (step.stepType) {
    case 'validate_plan': {
      const validateData = tryParseJson(step.output)
      if (validateData) {
        const status = stringValue(validateData.status)
        const issueCount = Array.isArray(validateData.issues) ? validateData.issues.length : 0
        riskLevel = status === 'blocked' ? 'high' : (status === 'warning' ? 'medium' : 'low')
        report = validateData
        reason = `大纲校验结果: ${status}，包含 ${issueCount} 个问题`
      }
      break
    }

    case 'evaluate_change_set': {
      // 变更集审查通常由 LLM 或规则给出风险评分
      const reviewData = tryParseJson(step.output)
      if (reviewData) {
        riskLevel = isAutoRiskLevel(reviewData.riskLevel) ? reviewData.riskLevel : 'medium'
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
  let action = getActionByStrategy(runStrategy, riskLevel)

  // 如果是修复步骤自身失败（高风险），不能再次触发修复，强制隔离（isolate）以跳过推进
  if (step.stepType === 'auto_repair' && action === 'repair') {
    action = 'isolate'
  }

  return {
    action,
    riskLevel,
    reason,
    report,
  }
}

function tryParseJson(str: string | null): Record<string, unknown> | null {
  if (!str)
    return null
  try {
    const value: unknown = JSON.parse(str)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown'
}

function isAutoRiskLevel(value: unknown): value is AutoRiskLevel {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
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
    if (risk === 'none' || risk === 'low' || risk === 'medium')
      return 'continue'
    return 'isolate' // high risk isolate but don't stop run
  }

  return 'continue'
}
