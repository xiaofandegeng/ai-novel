export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  pageSize: number
}

export interface HealthCheckResponse {
  status: 'ok' | 'error'
  message: string
  timestamp: string
  services: {
    database: 'connected' | 'disconnected' | 'error'
  }
}
