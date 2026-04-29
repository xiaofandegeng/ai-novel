import type { CharacterRelationship, CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as relationshipsApi from '../api/relationships'

export const useRelationshipStore = defineStore('relationships', () => {
  const relationships = ref<CharacterRelationship[]>([])

  async function fetchRelationships(projectId: string) {
    relationships.value = await relationshipsApi.fetchRelationships(projectId)
  }

  async function createRelationship(projectId: string, data: CreateRelationshipInput) {
    const rel = await relationshipsApi.createRelationship(projectId, data)
    relationships.value.push(rel)
    return rel
  }

  async function updateRelationship(projectId: string, id: string, data: UpdateRelationshipInput) {
    const rel = await relationshipsApi.updateRelationship(projectId, id, data)
    const idx = relationships.value.findIndex(r => r.id === id)
    if (idx !== -1)
      relationships.value[idx] = rel
    return rel
  }

  async function deleteRelationship(projectId: string, id: string) {
    await relationshipsApi.deleteRelationship(projectId, id)
    relationships.value = relationships.value.filter(r => r.id !== id)
  }

  return { relationships, fetchRelationships, createRelationship, updateRelationship, deleteRelationship }
})
