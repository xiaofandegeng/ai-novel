import type { HealthMetrics } from '@ai-novel/shared'

export type { HealthMetrics }

export async function fetchHealthMetrics(projectId: string): Promise<HealthMetrics> {
  const res = await fetch(`/api/projects/${projectId}/health-metrics`)
  const json = await res.json()
  if (!json.success)
    throw new Error(json.error || '健康指标获取失败')
  return json.data
}
