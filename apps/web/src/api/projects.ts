import type { CreateProjectInput, NovelProject, UpdateProjectInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchProjects() {
  return apiGet<NovelProject[]>('/api/projects')
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
