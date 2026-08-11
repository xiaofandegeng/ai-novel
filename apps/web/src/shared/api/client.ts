import type { ApiResponse } from '@ai-novel/shared'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = (await res.json()) as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error || '操作失败')
  }
  return json.data as T
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url)
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: 'POST', body: JSON.stringify(body) })
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
}

export function apiPut<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: 'PUT', body: JSON.stringify(body) })
}

export function apiDel<T = void>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' })
}

export interface CrudApi<T, C = unknown, U = unknown> {
  fetch: (projectId: string) => Promise<T[]>
  create: (projectId: string, data: C) => Promise<T>
  update: (projectId: string, id: string, data: U) => Promise<T>
  delete: (projectId: string, id: string) => Promise<void>
}

export function createCrudApi<T, C = unknown, U = unknown>(resource: string): CrudApi<T, C, U> {
  return {
    fetch: projectId => apiGet<T[]>(`/api/projects/${projectId}/${resource}`),
    create: (projectId, data) => apiPost<T>(`/api/projects/${projectId}/${resource}`, data),
    update: (projectId, id, data) => apiPatch<T>(`/api/projects/${projectId}/${resource}/${id}`, data),
    delete: (projectId, id) => apiDel(`/api/projects/${projectId}/${resource}/${id}`),
  }
}
