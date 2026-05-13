import type { Ref } from 'vue'
import { onMounted, onUnmounted, watch } from 'vue'

export function useOverlayVisibility(modelValue: Ref<boolean>, close: () => void) {
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && modelValue.value)
      close()
  }

  watch(modelValue, (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  })

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  })
}
