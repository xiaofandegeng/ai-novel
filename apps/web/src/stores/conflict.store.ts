import type { Conflict, CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as conflictsApi from '../api/conflicts'

export const useConflictStore = defineStore('conflicts', () => {
  const conflicts = ref<Conflict[]>([])

  async function fetchConflicts(projectId: string) {
    conflicts.value = await conflictsApi.fetchConflicts(projectId)
  }

  async function createConflict(projectId: string, data: CreateConflictInput) {
    const c = await conflictsApi.createConflict(projectId, data)
    conflicts.value.push(c)
    return c
  }

  async function updateConflict(projectId: string, id: string, data: UpdateConflictInput) {
    const c = await conflictsApi.updateConflict(projectId, id, data)
    const idx = conflicts.value.findIndex(con => con.id === id)
    if (idx !== -1)
      conflicts.value[idx] = c
    return c
  }

  async function deleteConflict(projectId: string, id: string) {
    await conflictsApi.deleteConflict(projectId, id)
    conflicts.value = conflicts.value.filter(c => c.id !== id)
  }

  return { conflicts, fetchConflicts, createConflict, updateConflict, deleteConflict }
})
