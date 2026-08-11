export function toErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
