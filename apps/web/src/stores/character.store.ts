import type { Character, CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as charactersApi from '../api/characters'

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Character[]>([])

  async function fetchCharacters(projectId: string) {
    characters.value = await charactersApi.fetchCharacters(projectId)
  }

  async function createCharacter(projectId: string, data: CreateCharacterInput) {
    const c = await charactersApi.createCharacter(projectId, data)
    characters.value.push(c)
    return c
  }

  async function updateCharacter(projectId: string, id: string, data: UpdateCharacterInput) {
    const c = await charactersApi.updateCharacter(projectId, id, data)
    const idx = characters.value.findIndex(ch => ch.id === id)
    if (idx !== -1)
      characters.value[idx] = c
    return c
  }

  async function deleteCharacter(projectId: string, id: string) {
    await charactersApi.deleteCharacter(projectId, id)
    characters.value = characters.value.filter(c => c.id !== id)
  }

  async function inferRelationships(projectId: string) {
    return await charactersApi.inferRelationships(projectId)
  }

  return { characters, fetchCharacters, createCharacter, updateCharacter, deleteCharacter, inferRelationships }
})
