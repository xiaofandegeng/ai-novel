export function success<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message && { message }) }
}

export function fail(error: string) {
  return { success: false as const, error }
}
