import type { ChapterStatus } from '@ai-novel/shared'
import { ref } from 'vue'

export interface OutlineFormData {
  title: string
  goals: string
  conflicts: string
  events: string
  emotionalArc: string
  foreshadowing: string
  endingHook: string
  status: ChapterStatus
  characterIds: string[]
}

export function useOutlineForm() {
  const form = ref<OutlineFormData>({
    title: '',
    goals: '',
    conflicts: '',
    events: '',
    emotionalArc: '',
    foreshadowing: '',
    endingHook: '',
    status: 'planning',
    characterIds: [],
  })

  function loadFromChapter(ch: { title: string, goals?: string | null, conflicts?: string | null, events?: string | null, emotionalArc?: string | null, foreshadowing?: string | null, endingHook?: string | null, status: ChapterStatus, characters?: string | null }) {
    form.value = {
      title: ch.title,
      goals: ch.goals || '',
      conflicts: ch.conflicts || '',
      events: ch.events || '',
      emotionalArc: ch.emotionalArc || '',
      foreshadowing: ch.foreshadowing || '',
      endingHook: ch.endingHook || '',
      status: ch.status,
      characterIds: ch.characters ? JSON.parse(ch.characters) : [],
    }
  }

  function toUpdatePayload() {
    return {
      ...form.value,
      characters: JSON.stringify(form.value.characterIds),
    }
  }

  function toggleCharacter(charId: string) {
    const index = form.value.characterIds.indexOf(charId)
    if (index === -1)
      form.value.characterIds.push(charId)
    else
      form.value.characterIds.splice(index, 1)
  }

  return { form, loadFromChapter, toUpdatePayload, toggleCharacter }
}
