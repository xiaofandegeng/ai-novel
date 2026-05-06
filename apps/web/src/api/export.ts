export async function exportProject(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/export`)
  const json = await res.json()
  if (!json.success)
    throw new Error(json.error || '导出失败')
  const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${json.data.project?.title || 'project'}-export.json`
  a.click()
  URL.revokeObjectURL(url)
}
