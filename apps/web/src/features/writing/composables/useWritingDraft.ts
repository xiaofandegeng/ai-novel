import type { Chapter } from '@ai-novel/shared'
import type { ComputedRef } from 'vue'
import type { useChapterStore } from '../../../stores/chapter.store'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { recordWritingActivity } from '../../../api/writing-goals'

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
      const previousLength = lastSavedDraft.value.length
      await chapterStore.updateChapter(projectId, currentChapterId.value, {
        draft: draft.value,
        status: 'writing',
      })
      lastSavedDraft.value = draft.value
      const wordsAdded = Math.max(0, draft.value.length - previousLength)
      if (wordsAdded > 0) {
        await recordWritingActivity(projectId, {
          date: new Date().toISOString().slice(0, 10),
          wordsAdded,
          manualWordsAdded: wordsAdded,
        })
      }
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
