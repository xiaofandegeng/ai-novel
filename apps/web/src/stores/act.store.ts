import type { Act, CreateActInput, UpdateActInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/acts'

export const useActStore = defineStore('acts', () => {
  const acts = ref<Act[]>([])

  async function fetchActs(projectId: string) {
    acts.value = await api.fetchActs(projectId)
  }

  async function createAct(projectId: string, data: CreateActInput) {
    const act = await api.createAct(projectId, data)
    acts.value.push(act)
    return act
  }

  async function updateAct(projectId: string, id: string, data: UpdateActInput) {
    const act = await api.updateAct(projectId, id, data)
    const idx = acts.value.findIndex(a => a.id === id)
    if (idx !== -1)
      acts.value[idx] = act
    return act
  }

  async function deleteAct(projectId: string, id: string) {
    await api.deleteAct(projectId, id)
    acts.value = acts.value.filter(a => a.id !== id)
  }

  return { acts, fetchActs, createAct, updateAct, deleteAct }
})
