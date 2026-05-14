import type { CharacterArcEvent, CreateCharacterArcEventInput, UpdateCharacterArcEventInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as characterArcApi from '../api/character-arc'

export const useCharacterArcStore = defineStore('character-arc', () => {
  const events = ref<CharacterArcEvent[]>([])

  async function fetchCharacterTimeline(projectId: string, characterId: string) {
    events.value = await characterArcApi.fetchCharacterTimeline(projectId, characterId)
  }

  async function fetchProjectTimeline(projectId: string) {
    events.value = await characterArcApi.fetchProjectTimeline(projectId)
  }

  async function createEvent(projectId: string, data: CreateCharacterArcEventInput) {
    const event = await characterArcApi.createArcEvent(projectId, data)
    events.value.push(event)
    return event
  }

  async function updateEvent(projectId: string, id: string, data: UpdateCharacterArcEventInput) {
    const event = await characterArcApi.updateArcEvent(projectId, id, data)
    const idx = events.value.findIndex(e => e.id === id)
    if (idx !== -1)
      events.value[idx] = event
    return event
  }

  async function deleteEvent(projectId: string, id: string) {
    await characterArcApi.deleteArcEvent(projectId, id)
    events.value = events.value.filter(e => e.id !== id)
  }

  return { events, fetchCharacterTimeline, fetchProjectTimeline, createEvent, updateEvent, deleteEvent }
})
