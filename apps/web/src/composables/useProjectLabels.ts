import type { TagVariant } from '@ai-novel/ui'

export function useProjectLabels() {
  const projectStatusLabels: Record<string, string> = {
    planning: '规划中',
    writing: '写作中',
    paused: '已暂停',
    completed: '已完成',
    archived: '已归档',
  }

  const projectStatusVariants: Record<string, TagVariant> = {
    planning: 'info',
    writing: 'primary',
    paused: 'warning',
    completed: 'success',
    archived: 'default',
  }

  const chapterStatusLabels: Record<string, string> = {
    not_started: '未开始',
    planning: '规划中',
    writing: '写作中',
    completed: '已完成',
  }

  const chapterStatusVariants: Record<string, TagVariant> = {
    not_started: 'default',
    planning: 'info',
    writing: 'primary',
    completed: 'success',
  }

  return {
    projectStatusLabels,
    projectStatusVariants,
    chapterStatusLabels,
    chapterStatusVariants,
  }
}
