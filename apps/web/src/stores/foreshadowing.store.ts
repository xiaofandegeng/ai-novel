import type { CreateForeshadowingInput, ForeshadowingItem, UpdateForeshadowingInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/foreshadowing'

export const useForeshadowingStore = defineStore('foreshadowing', () => {
  const items = ref<ForeshadowingItem[]>([])

  async function fetchItems(projectId: string) {
    items.value = await api.fetchForeshadowingItems(projectId)
  }

  async function createItem(projectId: string, data: CreateForeshadowingInput) {
    const item = await api.createForeshadowingItem(projectId, data)
    items.value.push(item)
    return item
  }

  async function updateItem(projectId: string, id: string, data: UpdateForeshadowingInput) {
    const item = await api.updateForeshadowingItem(projectId, id, data)
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1)
      items.value[idx] = item
    return item
  }

  async function deleteItem(projectId: string, id: string) {
    await api.deleteForeshadowingItem(projectId, id)
    items.value = items.value.filter(i => i.id !== id)
  }

  return { items, fetchItems, createItem, updateItem, deleteItem }
})
