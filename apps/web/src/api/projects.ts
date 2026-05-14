import type { CreateProjectInput, NovelProject, UpdateProjectInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchProjects(params?: { limit?: number, offset?: number }) {
  const query = new URLSearchParams()
  if (params?.limit)
    query.set('limit', params.limit.toString())
  if (params?.offset)
    query.set('offset', params.offset.toString())
  const queryString = query.toString()
  return apiGet<NovelProject[]>(`/api/projects${queryString ? `?${queryString}` : ''}`)
}

export function fetchProject(id: string) {
  return apiGet<NovelProject>(`/api/projects/${id}`)
}

export function createProject(data: CreateProjectInput) {
  return apiPost<NovelProject>('/api/projects', data)
}

export function updateProject(id: string, data: UpdateProjectInput) {
  return apiPatch<NovelProject>(`/api/projects/${id}`, data)
}

export function deleteProject(id: string) {
  return apiDel(`/api/projects/${id}`)
}
