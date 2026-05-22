import type {
  AutomationCockpitPayload,
  CockpitChapterDetail,
  CockpitNarrativeEvent,
} from '@ai-novel/shared'
import { apiGet, apiPost } from '@/api/client'

export async function fetchAutomationCockpit(projectId: string): Promise<AutomationCockpitPayload> {
  return apiGet<AutomationCockpitPayload>(`/api/projects/${projectId}/cockpit`)
}

export async function fetchCockpitEvents(projectId: string, limit = 100): Promise<CockpitNarrativeEvent[]> {
  return apiGet<CockpitNarrativeEvent[]>(`/api/projects/${projectId}/cockpit/events?limit=${limit}`)
}

export async function fetchCockpitChapterDetail(projectId: string, chapterId: string): Promise<CockpitChapterDetail> {
  return apiGet<CockpitChapterDetail>(`/api/projects/${projectId}/cockpit/chapters/${chapterId}`)
}

export async function approveChangeSetItem(projectId: string, changeSetId: string, itemId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/projects/${projectId}/change-sets/${changeSetId}/items/${itemId}/approve`, {})
}

export async function rejectChangeSetItem(projectId: string, changeSetId: string, itemId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/projects/${projectId}/change-sets/${changeSetId}/items/${itemId}/reject`, {})
}
