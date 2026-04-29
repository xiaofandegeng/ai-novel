import type { ChapterVersion } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as versionsApi from '../api/versions'

export const useVersionStore = defineStore('versions', () => {
  const versions = ref<ChapterVersion[]>([])

  async function fetchVersions(projectId: string, chapterId: string) {
    versions.value = await versionsApi.fetchVersions(projectId, chapterId)
  }

  async function createSnapshot(projectId: string, chapterId: string, content: string, note?: string) {
    const v = await versionsApi.createSnapshot(projectId, chapterId, { content, note })
    versions.value.unshift(v)
    return v
  }

  async function deleteVersion(projectId: string, id: string) {
    await versionsApi.deleteVersion(projectId, id)
    versions.value = versions.value.filter(v => v.id !== id)
  }

  return { versions, fetchVersions, createSnapshot, deleteVersion }
})
