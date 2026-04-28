import type { ApiResponse } from '@ai-novel/shared'
import { ref } from 'vue'

export function useApi() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function request<T>(url: string, options?: RequestInit): Promise<T> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      })
      const json = (await res.json()) as ApiResponse<T>
      if (!json.success) {
        error.value = json.error || 'Unknown error'
        throw new Error(json.error)
      }
      return json.data as T
    }
    catch (e: any) {
      error.value = e.message
      throw e
    }
    finally {
      loading.value = false
    }
  }

  function get<T>(url: string) {
    return request<T>(url)
  }

  function post<T>(url: string, body: unknown) {
    return request<T>(url, { method: 'POST', body: JSON.stringify(body) })
  }

  function patch<T>(url: string, body: unknown) {
    return request<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
  }

  function del<T>(url: string) {
    return request<T>(url, { method: 'DELETE' })
  }

  return { loading, error, get, post, patch, del }
}
