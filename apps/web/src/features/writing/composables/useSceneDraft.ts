import type { ChapterScene } from '@ai-novel/shared'
import type { ComputedRef } from 'vue'
import type { useSceneStore } from '../../../stores/scene.store'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { recordWritingActivity } from '../../../api/writing-goals'

export function useSceneDraft(
  projectId: string,
  currentChapterId: ComputedRef<string | null>,
  currentSceneId: ComputedRef<string | null>,
  sceneStore: ReturnType<typeof useSceneStore>,
) {
  const sceneContent = ref('')
  const lastSavedContent = ref('')
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  const wordCount = computed(() => sceneContent.value.length)
  const dirty = computed(() => sceneContent.value !== lastSavedContent.value)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function loadScene(scene: ChapterScene) {
    sceneContent.value = scene.content || ''
    lastSavedContent.value = scene.content || ''
    saveError.value = null
  }

  function debouncedSave() {
    if (saveTimer)
      clearTimeout(saveTimer)
    saveTimer = setTimeout(handleSave, 3000)
  }

  async function handleSave(): Promise<boolean> {
    if (!currentChapterId.value || !currentSceneId.value || !dirty.value)
      return true

    saving.value = true
    try {
      const previousLength = lastSavedContent.value.length
      await sceneStore.updateScene(projectId, currentChapterId.value, currentSceneId.value, {
        content: sceneContent.value,
        status: 'drafting',
      })
      lastSavedContent.value = sceneContent.value
      const wordsAdded = Math.max(0, sceneContent.value.length - previousLength)
      if (wordsAdded > 0) {
        await recordWritingActivity(projectId, {
          date: new Date().toISOString().slice(0, 10),
          wordsAdded,
          manualWordsAdded: wordsAdded,
        })
      }
      saveError.value = null
      return true
    }
    catch (e: any) {
      saveError.value = e?.message || '场景保存失败'
      return false
    }
    finally {
      saving.value = false
    }
  }

  watch(sceneContent, (newVal) => {
    if (newVal !== lastSavedContent.value) {
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
    sceneContent,
    lastSavedContent,
    saving,
    saveError,
    dirty,
    wordCount,
    loadScene,
    handleSave,
  }
}
