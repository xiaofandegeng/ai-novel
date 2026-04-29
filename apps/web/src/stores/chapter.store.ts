import type { Chapter, CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as chaptersApi from '../api/chapters'

export const useChapterStore = defineStore('chapters', () => {
  const chapters = ref<Chapter[]>([])

  async function fetchChapters(projectId: string) {
    chapters.value = await chaptersApi.fetchChapters(projectId)
  }

  async function createChapter(projectId: string, data: CreateChapterInput) {
    const ch = await chaptersApi.createChapter(projectId, data)
    chapters.value.push(ch)
    return ch
  }

  async function updateChapter(projectId: string, id: string, data: UpdateChapterInput) {
    const ch = await chaptersApi.updateChapter(projectId, id, data)
    const idx = chapters.value.findIndex(c => c.id === id)
    if (idx !== -1)
      chapters.value[idx] = ch
    return ch
  }

  async function deleteChapter(projectId: string, id: string) {
    await chaptersApi.deleteChapter(projectId, id)
    chapters.value = chapters.value.filter(c => c.id !== id)
  }

  return { chapters, fetchChapters, createChapter, updateChapter, deleteChapter }
})
