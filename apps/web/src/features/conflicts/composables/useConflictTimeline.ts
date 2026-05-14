import type { ConflictTimelineEvent } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed } from 'vue'
import { useConflictTimelineStore } from '@/stores/conflict-timeline.store'

export function useConflictTimeline(projectId: string) {
  const toast = useToast()
  const store = useConflictTimelineStore()

  async function loadTimeline() {
    try {
      await store.fetchProjectTimeline(projectId)
    }
    catch {
      toast.add('加载冲突时间线失败', 'error')
    }
  }

  async function loadConflictTimeline(conflictId: string) {
    try {
      await store.fetchConflictTimeline(projectId, conflictId)
    }
    catch {
      toast.add('加载冲突时间线失败', 'error')
    }
  }

  async function addEvent(data: {
    conflictId: string
    chapterId?: string
    sceneId?: string
    intensityBefore: number
    intensityAfter: number
    statusBefore: string
    statusAfter: string
    reason?: string
    evidence?: string
    sourceType?: 'ai_extracted' | 'manual'
  }) {
    try {
      const event = await store.createEvent(projectId, data)
      toast.add('时间线事件已添加', 'success')
      return event
    }
    catch {
      toast.add('添加时间线事件失败', 'error')
      return null
    }
  }

  async function removeEvent(id: string) {
    try {
      await store.deleteEvent(projectId, id)
      toast.add('时间线事件已删除', 'success')
    }
    catch {
      toast.add('删除时间线事件失败', 'error')
    }
  }

  function getEventsForConflict(conflictId: string): ConflictTimelineEvent[] {
    return store.events.filter(e => e.conflictId === conflictId)
  }

  const allEvents = computed(() => store.events)

  return {
    allEvents,
    loadTimeline,
    loadConflictTimeline,
    addEvent,
    removeEvent,
    getEventsForConflict,
  }
}
