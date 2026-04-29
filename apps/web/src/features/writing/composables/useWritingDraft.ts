import type { Chapter } from '@ai-novel/shared'
import type { ComputedRef } from 'vue'
import type { useChapterStore } from '../../../stores/projects'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export function useWritingDraft(
  projectId: string,
  currentChapterId: ComputedRef<string>,
  chapterStore: ReturnType<typeof useChapterStore>,
) {
  const draft = ref('')
  const lastSavedDraft = ref('')
  const saving = ref(false)

  const wordCount = computed(() => draft.value.length)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function loadChapter(ch: Chapter) {
    draft.value = ch.draft || ''
    lastSavedDraft.value = ch.draft || ''
  }

  function debouncedSave() {
    if (saveTimer)
      clearTimeout(saveTimer)
    saveTimer = setTimeout(handleSave, 3000)
  }

  async function handleSave() {
    if (!currentChapterId.value || draft.value === lastSavedDraft.value)
      return

    saving.value = true
    try {
      await chapterStore.updateChapter(projectId, currentChapterId.value, {
        draft: draft.value,
        status: 'writing',
      })
      lastSavedDraft.value = draft.value
    }
    catch (e) {
      console.error('Auto-save failed', e)
    }
    finally {
      saving.value = false
    }
  }

  watch(draft, (newVal) => {
    if (newVal !== lastSavedDraft.value) {
      debouncedSave()
    }
  })

  onBeforeUnmount(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      handleSave()
    }
  })

  return {
    draft,
    lastSavedDraft,
    saving,
    wordCount,
    loadChapter,
    handleSave,
  }
}
