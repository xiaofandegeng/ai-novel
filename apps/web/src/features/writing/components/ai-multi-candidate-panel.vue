<script setup lang="ts">
import type { AIGenerationCandidate } from '@ai-novel/shared'
import { NButton } from '@ai-novel/ui'
import { Star, X } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  candidates: AIGenerationCandidate[]
  selecting: boolean
  rating: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', candidateId: string): void
  (e: 'rate', candidateId: string, score: number): void
}>()

const groupedCandidates = computed(() => {
  const groups: Record<string, AIGenerationCandidate[]> = {}
  for (const c of props.candidates) {
    const key = `${c.taskType}-${c.chapterId ?? 'none'}`
    if (!groups[key])
      groups[key] = []
    groups[key].push(c)
  }
  return groups
})

function truncate(content: string, maxLen = 300): string {
  if (content.length <= maxLen)
    return content
  return `${content.slice(0, maxLen)}...`
}

function starClass(candidate: AIGenerationCandidate, star: number): string {
  if (candidate.userRating && star <= candidate.userRating)
    return 'text-yellow-400'
  return 'text-text-muted/30'
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div class="relative max-h-[85vh] max-w-6xl w-[90vw] flex flex-col border border-border-light rounded-xl bg-bg-surface shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border-light px-6 py-4">
        <h2 class="text-lg text-text-primary font-bold">
          多模型生成对比
        </h2>
        <button
          class="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-page hover:text-text-primary"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="candidates.length === 0" class="py-16 text-center">
          <p class="text-text-muted">
            暂无候选结果，请先生成内容。
          </p>
        </div>

        <div v-else class="space-y-8">
          <div v-for="(group, groupKey) in groupedCandidates" :key="groupKey">
            <h3 class="mb-4 text-sm text-text-muted font-bold tracking-wider uppercase">
              {{ group[0]?.taskType || 'unknown' }}
            </h3>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
              <div
                v-for="candidate in group"
                :key="candidate.id"
                class="flex flex-col border border-border-light rounded-lg bg-bg-page/50 p-4 transition-shadow hover:shadow-md"
                :class="{ 'ring-2 ring-primary': candidate.userSelected === 1 }"
              >
                <!-- Model header -->
                <div class="mb-3 flex items-center justify-between">
                  <div>
                    <span class="text-sm text-text-primary font-bold">{{ candidate.model }}</span>
                    <span class="ml-2 text-xs text-text-muted">({{ candidate.provider }})</span>
                  </div>
                  <span
                    v-if="candidate.userSelected === 1"
                    class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-bold uppercase"
                  >
                    已选
                  </span>
                </div>

                <!-- Content preview -->
                <div class="mb-4 flex-1 whitespace-pre-wrap rounded-md bg-bg-surface p-3 text-xs text-text-secondary leading-relaxed">
                  {{ truncate(candidate.content) }}
                </div>

                <!-- Quality score -->
                <div v-if="candidate.qualityScore != null" class="mb-3 text-xs text-text-muted">
                  质量评分: {{ candidate.qualityScore }}
                </div>

                <!-- Star rating -->
                <div class="mb-3 flex items-center gap-1">
                  <span class="mr-2 text-xs text-text-muted">评分:</span>
                  <button
                    v-for="star in 5"
                    :key="star"
                    class="transition-colors hover:text-yellow-300"
                    :disabled="rating"
                    @click="emit('rate', candidate.id, star)"
                  >
                    <Star :size="14" :class="starClass(candidate, star)" />
                  </button>
                </div>

                <!-- Actions -->
                <NButton
                  :variant="candidate.userSelected === 1 ? 'primary' : 'secondary'"
                  size="sm"
                  :disabled="selecting || candidate.userSelected === 1"
                  class="w-full"
                  @click="emit('select', candidate.id)"
                >
                  {{ candidate.userSelected === 1 ? '已选中' : '选择此方案' }}
                </NButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
