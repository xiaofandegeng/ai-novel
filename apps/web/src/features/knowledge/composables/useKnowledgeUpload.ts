import type { KnowledgeSource } from '@ai-novel/shared'
import { ref } from 'vue'
import { useApi } from '../../../composables/useApi'
import { useKnowledgeStore } from '../../../stores/knowledge.store'

export function useKnowledgeUpload(projectId: string) {
  const uploading = ref(false)
  const api = useApi()
  const knowledgeStore = useKnowledgeStore()

  function readFileAsText(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

  async function uploadFile(file: File): Promise<KnowledgeSource> {
    uploading.value = true
    try {
      // 1. Create source record
      const source = await knowledgeStore.createSource(projectId, {
        title: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileSize: file.size,
        sourceType: 'classic',
      })

      // 2. Read file content
      const content = await readFileAsText(file)

      // 3. Trigger analysis
      await api.post(`/api/projects/${projectId}/knowledge/sources/${source.id}/analyze`, { content })

      // 4. Refresh source list
      await knowledgeStore.fetchSources(projectId)

      return source
    }
    finally {
      uploading.value = false
    }
  }

  function validateFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      return '仅支持 .txt 文本文件'
    }
    return null
  }

  return {
    uploading,
    uploadFile,
    validateFile,
  }
}
