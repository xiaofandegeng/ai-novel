import type { CreateVolumeInput, UpdateVolumeInput, Volume } from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost } from './client'

export function fetchVolumes(projectId: string) {
  return apiGet<Volume[]>(`/api/projects/${projectId}/volumes`)
}

export function createVolume(projectId: string, data: CreateVolumeInput) {
  return apiPost<Volume>(`/api/projects/${projectId}/volumes`, data)
}

export function updateVolume(projectId: string, id: string, data: UpdateVolumeInput) {
  return apiPatch<Volume>(`/api/projects/${projectId}/volumes/${id}`, data)
}

export function deleteVolume(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/volumes/${id}`)
}
