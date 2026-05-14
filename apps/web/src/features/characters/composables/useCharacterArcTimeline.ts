import type { CharacterArcEvent, CharacterArcEventType, CreateCharacterArcEventInput } from '@ai-novel/shared'
import type { Ref } from 'vue'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useCharacterArcStore } from '@/stores/character-arc.store'

const eventTypeLabels: Record<CharacterArcEventType, string> = {
  goal_shift: '目标转变',
  fear_triggered: '恐惧触发',
  secret_revealed: '秘密揭露',
  relationship_changed: '关系变化',
  belief_changed: '信念转变',
  ability_changed: '能力变化',
  trauma: '创伤经历',
  victory: '胜利时刻',
  loss: '损失经历',
}

const eventTypeColors: Record<CharacterArcEventType, string> = {
  goal_shift: 'bg-blue-500',
  fear_triggered: 'bg-purple-500',
  secret_revealed: 'bg-amber-500',
  relationship_changed: 'bg-pink-500',
  belief_changed: 'bg-indigo-500',
  ability_changed: 'bg-emerald-500',
  trauma: 'bg-red-500',
  victory: 'bg-green-500',
  loss: 'bg-gray-500',
}

export function useCharacterArcTimeline(projectId: string, characterId: Ref<string | null>) {
  const toast = useToast()
  const arcStore = useCharacterArcStore()

  const loading = ref(false)
  const showAddForm = ref(false)

  const newEventForm = ref<{
    eventType: CharacterArcEventType | ''
    beforeState: string
    afterState: string
    motivationChange: string
    relationshipImpact: string
    evidence: string
  }>({
    eventType: '',
    beforeState: '',
    afterState: '',
    motivationChange: '',
    relationshipImpact: '',
    evidence: '',
  })

  const timelineEvents = computed(() => arcStore.events)

  const eventsGroupedByChapter = computed(() => {
    const groups = new Map<string, { chapterId: string | null, events: CharacterArcEvent[] }>()
    for (const event of arcStore.events) {
      const key = event.chapterId || '__no_chapter__'
      if (!groups.has(key)) {
        groups.set(key, { chapterId: event.chapterId, events: [] })
      }
      groups.get(key)!.events.push(event)
    }
    return Array.from(groups.values())
  })

  async function loadTimeline() {
    if (!characterId.value)
      return
    loading.value = true
    try {
      await arcStore.fetchCharacterTimeline(projectId, characterId.value)
    }
    catch {
      toast.add('加载弧光时间线失败', 'error')
    }
    finally {
      loading.value = false
    }
  }

  async function addEvent() {
    if (!characterId.value || !newEventForm.value.eventType)
      return
    try {
      const data: CreateCharacterArcEventInput = {
        characterId: characterId.value,
        eventType: newEventForm.value.eventType as CharacterArcEventType,
        beforeState: newEventForm.value.beforeState || undefined,
        afterState: newEventForm.value.afterState || undefined,
        motivationChange: newEventForm.value.motivationChange || undefined,
        relationshipImpact: newEventForm.value.relationshipImpact || undefined,
        evidence: newEventForm.value.evidence || undefined,
        sourceType: 'manual',
      }
      await arcStore.createEvent(projectId, data)
      resetForm()
      toast.add('弧光事件已添加', 'success')
    }
    catch {
      toast.add('添加弧光事件失败', 'error')
    }
  }

  async function removeEvent(eventId: string) {
    try {
      await arcStore.deleteEvent(projectId, eventId)
      toast.add('弧光事件已删除', 'success')
    }
    catch {
      toast.add('删除弧光事件失败', 'error')
    }
  }

  function resetForm() {
    newEventForm.value = {
      eventType: '',
      beforeState: '',
      afterState: '',
      motivationChange: '',
      relationshipImpact: '',
      evidence: '',
    }
    showAddForm.value = false
  }

  function getEventTypeLabel(type: CharacterArcEventType): string {
    return eventTypeLabels[type] || type
  }

  function getEventTypeColor(type: CharacterArcEventType): string {
    return eventTypeColors[type] || 'bg-gray-400'
  }

  watch(characterId, (newId) => {
    if (newId)
      loadTimeline()
    else
      arcStore.events = []
  })

  onMounted(() => {
    if (characterId.value)
      loadTimeline()
  })

  return {
    loading,
    timelineEvents,
    eventsGroupedByChapter,
    showAddForm,
    newEventForm,
    loadTimeline,
    addEvent,
    removeEvent,
    resetForm,
    getEventTypeLabel,
    getEventTypeColor,
  }
}
