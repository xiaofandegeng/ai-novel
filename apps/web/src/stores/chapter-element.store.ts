import type { ChapterElement, CreateChapterElementInput, UpdateChapterElementInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as elementsApi from '../api/chapter-elements'

export const useChapterElementStore = defineStore('chapterElements', () => {
  const elements = ref<ChapterElement[]>([])

  async function fetchElements(projectId: string, chapterId: string) {
    elements.value = await elementsApi.fetchChapterElements(projectId, chapterId)
  }

  async function createElement(projectId: string, chapterId: string, data: CreateChapterElementInput) {
    const el = await elementsApi.createChapterElement(projectId, chapterId, data)
    elements.value.push(el)
    return el
  }

  async function updateElement(projectId: string, chapterId: string, id: string, data: UpdateChapterElementInput) {
    const el = await elementsApi.updateChapterElement(projectId, chapterId, id, data)
    const idx = elements.value.findIndex(e => e.id === id)
    if (idx !== -1)
      elements.value[idx] = el
    return el
  }

  async function deleteElement(projectId: string, chapterId: string, id: string) {
    await elementsApi.deleteChapterElement(projectId, chapterId, id)
    elements.value = elements.value.filter(e => e.id !== id)
  }

  async function replaceElements(projectId: string, chapterId: string, data: { elements: CreateChapterElementInput[] }) {
    elements.value = await elementsApi.replaceChapterElements(projectId, chapterId, data)
  }

  function clear() {
    elements.value = []
  }

  return { elements, fetchElements, createElement, updateElement, deleteElement, replaceElements, clear }
})
