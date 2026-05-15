import type { WritingJob, WritingJobStep } from '@ai-novel/shared'

interface AutoApprovalDecision {
  shouldPause: boolean
  approved: boolean
  reason: string
  severity: 'none' | 'low' | 'medium' | 'high'
}

/**
 * 评估写作任务步骤是否可以自动通过
 */
export function evaluateAutoApproval(input: {
  job: WritingJob
  step: WritingJobStep
  previousOutputs: Map<string, string>
}): AutoApprovalDecision {
  const { job, step, previousOutputs } = input

  if (job.executionMode === 'manual') {
    return {
      shouldPause: true,
      approved: false,
      reason: '半自动执行策略要求人工确认',
      severity: 'none',
    }
  }

  // 基础校验：如果步骤本身失败了，不能自动通过
  if (step.status === 'failed') {
    return {
      shouldPause: true,
      approved: false,
      reason: '步骤执行失败，无法自动通过',
      severity: 'high',
    }
  }

  const stepType = step.stepType

  switch (stepType) {
    case 'confirm_plan':
      return evaluateConfirmPlan(step, job.autoApprovalLevel, previousOutputs)
    case 'consistency_check':
      return evaluateConsistencyCheck(step, job.autoApprovalLevel)
    case 'confirm_apply':
      return evaluateConfirmApply(step, job.autoApprovalLevel, previousOutputs)
    case 'confirm_suggestions':
      return evaluateConfirmSuggestions(step, job.autoApprovalLevel)
    case 'review_change_set':
      return evaluateReviewChangeSet(step, job.autoApprovalLevel, previousOutputs)
    default:
      // 非人工确认类节点（如 prepare_context, generate_plan 等），通常不由该服务调用
      // 若被调用，默认不暂停
      return {
        shouldPause: false,
        approved: true,
        reason: '非人工确认节点，自动继续',
        severity: 'none',
      }
  }
}

function evaluateConfirmPlan(_step: WritingJobStep, _level: string, previousOutputs: Map<string, string>): AutoApprovalDecision {
  const planOutput = previousOutputs.get('generate_plan')
  if (!planOutput) {
    return { shouldPause: true, approved: false, reason: '未找到大纲输出 (需由 generate_plan 提供)', severity: 'high' }
  }

  try {
    const plan = JSON.parse(planOutput)
    if (!plan.title || !plan.events || plan.events.length === 0) {
      return { shouldPause: true, approved: false, reason: '大纲内容不完整', severity: 'medium' }
    }
    return {
      shouldPause: false,
      approved: true,
      reason: '大纲结构完整，满足自动通过条件',
      severity: 'low',
    }
  }
  catch {
    return { shouldPause: true, approved: false, reason: '大纲解析失败', severity: 'high' }
  }
}

function evaluateConsistencyCheck(step: WritingJobStep, level: string): AutoApprovalDecision {
  if (!step.output) {
    return { shouldPause: true, approved: false, reason: '未找到一致性检查结果', severity: 'high' }
  }

  try {
    const result = JSON.parse(step.output)
    const status = result.overallStatus // 'pass' | 'warning' | 'blocked'

    if (status === 'pass') {
      return {
        shouldPause: false,
        approved: true,
        reason: '一致性检查完全通过',
        severity: 'low',
      }
    }

    if (status === 'warning') {
      if (level === 'balanced' || level === 'aggressive') {
        return {
          shouldPause: false,
          approved: true,
          reason: '一致性检查存在警告，当前策略允许通过',
          severity: 'medium',
        }
      }
      return {
        shouldPause: true,
        approved: false,
        reason: '一致性检查存在警告，保守策略要求人工确认',
        severity: 'medium',
      }
    }

    return {
      shouldPause: true,
      approved: false,
      reason: '一致性检查未通过 (Blocked)',
      severity: 'high',
    }
  }
  catch {
    return { shouldPause: true, approved: false, reason: '一致性检查结果解析失败', severity: 'high' }
  }
}

function evaluateConfirmApply(_step: WritingJobStep, _level: string, previousOutputs: Map<string, string>): AutoApprovalDecision {
  const draftOutput = previousOutputs.get('generate_draft')
  if (!draftOutput) {
    return { shouldPause: true, approved: false, reason: '未找到正文草稿 (需由 generate_draft 提供)', severity: 'high' }
  }

  try {
    const draft = JSON.parse(draftOutput)
    const content = typeof draft.draft === 'string' ? draft.draft.trim() : ''

    if (content.length < 200) {
      return { shouldPause: true, approved: false, reason: `正文字数过少 (当前 ${content.length} 字，不足 200 字)`, severity: 'medium' }
    }

    return {
      shouldPause: false,
      approved: true,
      reason: '正文字数达标，自动写入',
      severity: 'low',
    }
  }
  catch {
    return { shouldPause: true, approved: false, reason: '正文草稿解析失败', severity: 'high' }
  }
}

function evaluateConfirmSuggestions(step: WritingJobStep, level: string): AutoApprovalDecision {
  // 建议审查在 evaluateAutoApproval 中只负责判断是否能跳过人工确认点
  // 实际建议的过滤应用在后处理建议服务中处理
  if (level === 'conservative') {
    return {
      shouldPause: true,
      approved: false,
      reason: '保守策略要求人工确认章后建议',
      severity: 'medium',
    }
  }

  return {
    shouldPause: false,
    approved: true,
    reason: '平衡/进取策略允许自动处理低风险建议',
    severity: 'low',
  }
}

function evaluateReviewChangeSet(_step: WritingJobStep, level: string, previousOutputs: Map<string, string>): AutoApprovalDecision {
  const buildOutput = previousOutputs.get('build_change_set')
  if (!buildOutput) {
    return { shouldPause: true, approved: false, reason: '未找到变更集构建结果', severity: 'high' }
  }

  try {
    const result = JSON.parse(buildOutput)
    const riskLevel = result.riskLevel // 'low' | 'medium' | 'high'
    const overallStatus = result.overallStatus // 'pass' | 'warning' | 'blocked'

    if (overallStatus === 'blocked') {
      return { shouldPause: true, approved: false, reason: '一致性审查被阻断 (Blocked)', severity: 'high' }
    }

    if (riskLevel === 'high') {
      return { shouldPause: true, approved: false, reason: '变更集风险等级为高，需人工确认', severity: 'high' }
    }

    if (riskLevel === 'medium') {
      if (level === 'balanced' || level === 'aggressive') {
        return { shouldPause: false, approved: true, reason: '风险中等，当前策略允许自动通过', severity: 'medium' }
      }
      return { shouldPause: true, approved: false, reason: '风险中等，保守策略要求人工确认', severity: 'medium' }
    }

    return {
      shouldPause: false,
      approved: true,
      reason: '变更集风险较低，自动通过',
      severity: 'low',
    }
  }
  catch {
    return { shouldPause: true, approved: false, reason: '变更集解析失败', severity: 'high' }
  }
}
