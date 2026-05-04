import type { ChapterScene, CreateSceneInput, UpdateSceneInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/scenes'

export const useSceneStore = defineStore('scenes', () => {
  const scenes = ref<ChapterScene[]>([])

  async function fetchScenes(projectId: string, chapterId: string) {
    scenes.value = await api.fetchScenes(projectId, chapterId)
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
  }

  function clear() {
    scenes.value = []
  }

  return { scenes, fetchScenes, createScene, updateScene, deleteScene, clear }
})
