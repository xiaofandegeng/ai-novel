export interface ManuscriptExportOptions {
  format?: 'md' | 'txt'
  includeOutline?: boolean
  includeScenes?: boolean
  includeUnfinishedChapters?: boolean
  includeAuthorNotes?: boolean
}

/**
 * Download a file from an export endpoint as a blob and trigger browser download.
 */
export async function downloadExport(projectId: string, path: string, filename: string) {
  const res = await fetch(`/api/projects/${projectId}/export/${path}`)
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error || `导出失败 (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export full project backup as JSON.
 */
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

/**
 * Export manuscript (MD or TXT) with options.
 */
export async function exportManuscript(projectId: string, options: ManuscriptExportOptions = {}) {
  const params = new URLSearchParams()
  if (options.format)
    params.set('format', options.format)
  if (options.includeOutline)
    params.set('includeOutline', 'true')
  if (options.includeScenes)
    params.set('includeScenes', 'true')
  if (options.includeUnfinishedChapters)
    params.set('includeUnfinishedChapters', 'true')
  if (options.includeAuthorNotes)
    params.set('includeAuthorNotes', 'true')

  const qs = params.toString()
  const path = `manuscript${qs ? `?${qs}` : ''}`
  const ext = options.format === 'txt' ? 'txt' : 'md'
  await downloadExport(projectId, path, `manuscript.${ext}`)
}

/**
 * Export project proposal.
 */
export async function exportProposal(projectId: string) {
  await downloadExport(projectId, 'proposal', '企划书.md')
}

/**
 * Export character profiles.
 */
export async function exportCharacterProfiles(projectId: string) {
  await downloadExport(projectId, 'characters', '角色设定集.md')
}

/**
 * Export foreshadowing report.
 */
export async function exportForeshadowingReport(projectId: string) {
  await downloadExport(projectId, 'foreshadowing-report', '伏笔报告.md')
}

/**
 * Export conflict report.
 */
export async function exportConflictReport(projectId: string) {
  await downloadExport(projectId, 'conflict-report', '矛盾报告.md')
}
