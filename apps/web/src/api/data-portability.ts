import { apiGet, apiPost } from './client'

export function exportProject(projectId: string) {
  return apiGet<any>(`/api/projects/${projectId}/export`)
}

export function importProject(data: any) {
  return apiPost<any>('/api/projects/import', data)
}
