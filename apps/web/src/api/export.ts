export interface ExportResult {
  content: string
  filename: string
}

export async function exportProject(projectId: string): Promise<ExportResult> {
  const res = await fetch(`/api/projects/${projectId}/export`)
  const json = await res.json()
  if (!json.success)
    throw new Error(json.error || '导出失败')
  return json.data as ExportResult
}
