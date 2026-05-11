import type { BulkCreateScenesInput, ChapterScene, CreateSceneInput, UpdateSceneInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/scenes'

export const useSceneStore = defineStore('scenes', () => {
  const scenes = ref<ChapterScene[]>([])
  const selectedSceneId = ref<string | null>(null)

  async function fetchScenes(projectId: string, chapterId: string) {
    scenes.value = await api.fetchScenes(projectId, chapterId)
    selectedSceneId.value = null
  }

  async function createScene(projectId: string, chapterId: string, data: CreateSceneInput) {
    const scene = await api.createScene(projectId, chapterId, data)
    scenes.value.push(scene)
    return scene
  }

  async function updateScene(projectId: string, chapterId: string, id: string, data: UpdateSceneInput) {
    const scene = await api.updateScene(projectId, chapterId, id, data)
    const idx = scenes.value.findIndex(s => s.id === id)
    if (idx !== -1)
      scenes.value[idx] = scene
    return scene
  }

  async function deleteScene(projectId: string, chapterId: string, id: string) {
    await api.deleteScene(projectId, chapterId, id)
    scenes.value = scenes.value.filter(s => s.id !== id)
    if (selectedSceneId.value === id)
      selectedSceneId.value = null
  }

  async function reorderScenes(projectId: string, chapterId: string, orders: Array<{ id: string, orderIndex: number }>) {
    scenes.value = await api.reorderScenes(projectId, chapterId, orders)
  }

  async function bulkCreateScenes(projectId: string, chapterId: string, data: BulkCreateScenesInput) {
    const result = await api.bulkCreateScenes(projectId, chapterId, data)
    scenes.value = result
    return result
  }

  function selectScene(id: string | null) {
    selectedSceneId.value = id
  }

  function clear() {
    scenes.value = []
    selectedSceneId.value = null
  }

  return { scenes, selectedSceneId, fetchScenes, createScene, bulkCreateScenes, updateScene, deleteScene, reorderScenes, selectScene, clear }
})
