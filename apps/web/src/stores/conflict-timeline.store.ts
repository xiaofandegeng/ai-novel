import type { ConflictTimelineEvent, CreateConflictTimelineEventInput } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/conflict-timeline'

export const useConflictTimelineStore = defineStore('conflict-timeline', () => {
  const events = ref<ConflictTimelineEvent[]>([])

  async function fetchProjectTimeline(projectId: string) {
    events.value = await api.fetchConflictProjectTimeline(projectId)
  }

  async function fetchConflictTimeline(projectId: string, conflictId: string) {
    const rows = await api.fetchConflictTimeline(projectId, conflictId)
    // Merge: replace existing events for this conflict, keep others
    const otherEvents = events.value.filter(e => e.conflictId !== conflictId)
    events.value = [...otherEvents, ...rows]
  }

  async function createEvent(projectId: string, data: CreateConflictTimelineEventInput) {
    const event = await api.createTimelineEvent(projectId, data)
    events.value.push(event)
    return event
  }

  async function deleteEvent(projectId: string, id: string) {
    await api.deleteTimelineEvent(projectId, id)
    events.value = events.value.filter(e => e.id !== id)
  }

  return { events, fetchProjectTimeline, fetchConflictTimeline, createEvent, deleteEvent }
})
