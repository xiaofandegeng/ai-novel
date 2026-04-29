import type { CreateKnowledgeSourceInput, KnowledgeSource, KnowledgeSourceDetail } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as knowledgeApi from '../api/knowledge'

export const useKnowledgeStore = defineStore('knowledge', () => {
  const sources = ref<KnowledgeSource[]>([])
  const currentSource = ref<KnowledgeSourceDetail | null>(null)

  async function fetchSources(projectId: string) {
    sources.value = await knowledgeApi.fetchSources(projectId)
  }

  async function createSource(projectId: string, data: CreateKnowledgeSourceInput) {
    const source = await knowledgeApi.createSource(projectId, data)
    sources.value.push(source)
    return source
  }

  async function fetchSourceDetail(projectId: string, sourceId: string) {
    currentSource.value = await knowledgeApi.getSourceDetail(projectId, sourceId)
    return currentSource.value
  }

  return { sources, currentSource, fetchSources, createSource, fetchSourceDetail }
})
