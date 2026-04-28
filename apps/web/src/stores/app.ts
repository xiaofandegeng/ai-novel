import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const initialized = ref(false)

  function setInitialized(value: boolean) {
    initialized.value = value
  }

  return {
    initialized,
    setInitialized,
  }
})
