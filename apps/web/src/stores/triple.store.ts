import type { CreateTripleInput, StoryFactTriple, UpdateTripleInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/triples'

export const useTripleStore = defineStore('triples', () => {
  const triples = ref<StoryFactTriple[]>([])

  async function fetchTriples(projectId: string) {
    triples.value = await api.fetchTriples(projectId)
  }

  async function createTriple(projectId: string, data: CreateTripleInput) {
    const triple = await api.createTriple(projectId, data)
    triples.value.push(triple)
    return triple
  }

  async function updateTriple(projectId: string, id: string, data: UpdateTripleInput) {
    const triple = await api.updateTriple(projectId, id, data)
    const idx = triples.value.findIndex(t => t.id === id)
    if (idx !== -1)
      triples.value[idx] = triple
    return triple
  }

  async function deleteTriple(projectId: string, id: string) {
    await api.deleteTriple(projectId, id)
    triples.value = triples.value.filter(t => t.id !== id)
  }

  return { triples, fetchTriples, createTriple, updateTriple, deleteTriple }
})
