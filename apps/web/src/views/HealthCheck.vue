<script setup lang="ts">
import { onMounted, ref } from 'vue'

const apiStatus = ref<'loading' | 'ok' | 'error'>('loading')
const apiMessage = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    apiStatus.value = 'ok'
    apiMessage.value = data.message || 'Backend is healthy'
  }
  catch {
    apiStatus.value = 'error'
    apiMessage.value = 'Failed to connect to backend'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-page">
    <div class="max-w-md w-full rounded-lg bg-surface p-8 shadow-md">
      <h1 class="mb-6 text-2xl text-heading">
        AI 小说创作工作台
      </h1>

      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="inline-block h-2.5 w-2.5 rounded-full bg-semantic-success" />
          <span class="text-body">Frontend: Running</span>
        </div>

        <div class="flex items-center gap-3">
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            :class="{
              'bg-semantic-warning animate-pulse': apiStatus === 'loading',
              'bg-semantic-success': apiStatus === 'ok',
              'bg-semantic-error': apiStatus === 'error',
            }"
          />
          <span class="text-body">
            Backend: {{ apiStatus === 'loading' ? 'Checking...' : apiMessage }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
