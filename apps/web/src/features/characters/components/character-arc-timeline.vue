<script setup lang="ts">
import type { CharacterArcEventType } from '@ai-novel/shared'
import { NButton, NLoadingState, NSelect, NTextArea } from '@ai-novel/ui'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  loading: boolean
  eventsGroupedByChapter: Array<{ chapterId: string | null, events: any[] }>
  showAddForm: boolean
  newEventForm: {
    eventType: CharacterArcEventType | ''
    beforeState: string
    afterState: string
    motivationChange: string
    relationshipImpact: string
    evidence: string
  }
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'remove', id: string): void
  (e: 'toggleForm'): void
  (e: 'resetForm'): void
  (e: 'update:showAddForm', value: boolean): void
  (e: 'update:newEventForm', value: any): void
}>()

const eventTypeOptions = [
  { value: 'goal_shift', label: '目标转变' },
  { value: 'fear_triggered', label: '恐惧触发' },
  { value: 'secret_revealed', label: '秘密揭露' },
  { value: 'relationship_changed', label: '关系变化' },
  { value: 'belief_changed', label: '信念转变' },
  { value: 'ability_changed', label: '能力变化' },
  { value: 'trauma', label: '创伤经历' },
  { value: 'victory', label: '胜利时刻' },
  { value: 'loss', label: '损失经历' },
]

function getEventTypeLabel(type: CharacterArcEventType): string {
  const found = eventTypeOptions.find(o => o.value === type)
  return found?.label || type
}

function getEventTypeColor(type: CharacterArcEventType): string {
  const colors: Record<string, string> = {
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
  return colors[type] || 'bg-gray-400'
}

function getEventTypeBorder(type: CharacterArcEventType): string {
  const colors: Record<string, string> = {
    goal_shift: 'border-blue-400',
    fear_triggered: 'border-purple-400',
    secret_revealed: 'border-amber-400',
    relationship_changed: 'border-pink-400',
    belief_changed: 'border-indigo-400',
    ability_changed: 'border-emerald-400',
    trauma: 'border-red-400',
    victory: 'border-green-400',
    loss: 'border-gray-400',
  }
  return colors[type] || 'border-gray-300'
}

function getEventTypeBg(type: CharacterArcEventType): string {
  const colors: Record<string, string> = {
    goal_shift: 'bg-blue-50',
    fear_triggered: 'bg-purple-50',
    secret_revealed: 'bg-amber-50',
    relationship_changed: 'bg-pink-50',
    belief_changed: 'bg-indigo-50',
    ability_changed: 'bg-emerald-50',
    trauma: 'bg-red-50',
    victory: 'bg-green-50',
    loss: 'bg-gray-50',
  }
  return colors[type] || 'bg-gray-50'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getSourceLabel(sourceType: string): string {
  return sourceType === 'ai_extracted' ? 'AI 提取' : '手动添加'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h3 class="text-sm text-text-primary font-semibold">
        弧光时间线
      </h3>
      <NButton variant="ghost" size="sm" @click="emit('toggleForm')">
        <template v-if="props.showAddForm">
          <Minus :size="14" class="mr-1" /> 取消
        </template>
        <template v-else>
          <Plus :size="14" class="mr-1" /> 添加事件
        </template>
      </NButton>
    </div>

    <!-- Add Event Form -->
    <div v-if="props.showAddForm" class="animate-in fade-in slide-in-from-top-2 border border-primary/20 rounded-xl bg-primary/5 p-4 space-y-4">
      <NSelect
        :model-value="props.newEventForm.eventType"
        label="事件类型"
        :options="eventTypeOptions"
        placeholder="选择事件类型"
        @update:model-value="(v: string | number) => emit('update:newEventForm', { ...props.newEventForm, eventType: v as CharacterArcEventType | '' })"
      />
      <div class="grid grid-cols-2 gap-4">
        <NTextArea
          :model-value="props.newEventForm.beforeState"
          label="变化前状态"
          placeholder="事件发生前角色的状态..."
          :rows="2"
          @update:model-value="(v: string) => emit('update:newEventForm', { ...props.newEventForm, beforeState: v })"
        />
        <NTextArea
          :model-value="props.newEventForm.afterState"
          label="变化后状态"
          placeholder="事件发生后角色的状态..."
          :rows="2"
          @update:model-value="(v: string) => emit('update:newEventForm', { ...props.newEventForm, afterState: v })"
        />
      </div>
      <NTextArea
        :model-value="props.newEventForm.motivationChange"
        label="动机变化"
        placeholder="该事件如何改变了角色的动机？"
        :rows="2"
        @update:model-value="(v: string) => emit('update:newEventForm', { ...props.newEventForm, motivationChange: v })"
      />
      <NTextArea
        :model-value="props.newEventForm.evidence"
        label="文本证据"
        placeholder="支持这一弧光事件的原文段落或描述..."
        :rows="2"
        @update:model-value="(v: string) => emit('update:newEventForm', { ...props.newEventForm, evidence: v })"
      />
      <div class="flex justify-end gap-2">
        <NButton variant="ghost" size="sm" @click="emit('resetForm')">
          取消
        </NButton>
        <NButton
          variant="primary"
          size="sm"
          :disabled="!props.newEventForm.eventType"
          @click="emit('add')"
        >
          添加
        </NButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="props.loading" class="flex items-center justify-center py-12">
      <NLoadingState />
    </div>

    <!-- Empty State -->
    <div v-else-if="props.eventsGroupedByChapter.length === 0" class="border border-border-light rounded-lg border-dashed py-8 text-center">
      <p class="text-xs text-text-muted">
        暂无弧光事件记录。点击上方「添加事件」开始记录角色的成长轨迹。
      </p>
    </div>

    <!-- Timeline -->
    <div v-else class="space-y-6">
      <div
        v-for="(group, gi) in props.eventsGroupedByChapter"
        :key="gi"
        class="relative"
      >
        <div class="mb-2 flex items-center gap-2">
          <span class="text-[10px] text-text-muted font-bold uppercase">
            {{ group.chapterId ? `章节` : '未关联章节' }}
          </span>
        </div>

        <div class="relative ml-4 border-l-2 border-border-light pl-6 space-y-4">
          <div
            v-for="event in group.events"
            :key="event.id"
            class="relative"
          >
            <!-- Timeline dot -->
            <div
              class="absolute top-2 h-3 w-3 border-2 border-white rounded-full -left-[31px]"
              :class="getEventTypeColor(event.eventType)"
            />

            <!-- Event card -->
            <div
              class="border rounded-lg p-3 space-y-2"
              :class="[getEventTypeBorder(event.eventType), getEventTypeBg(event.eventType)]"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] text-white font-semibold"
                    :class="getEventTypeColor(event.eventType)"
                  >
                    {{ getEventTypeLabel(event.eventType) }}
                  </span>
                  <span class="text-[10px] text-text-muted">
                    {{ getSourceLabel(event.sourceType) }}
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-text-muted">{{ formatDate(event.createdAt) }}</span>
                  <button
                    class="hover:bg-error/10 hover:text-error ml-1 rounded p-1 text-text-muted transition-colors"
                    title="删除事件"
                    @click="emit('remove', event.id)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>

              <div v-if="event.beforeState || event.afterState" class="grid grid-cols-2 gap-2">
                <div v-if="event.beforeState" class="rounded bg-white/60 p-2">
                  <p class="mb-0.5 text-[10px] text-text-muted font-semibold">
                    变化前
                  </p>
                  <p class="text-xs text-text-secondary leading-relaxed">
                    {{ event.beforeState }}
                  </p>
                </div>
                <div v-if="event.afterState" class="rounded bg-white/60 p-2">
                  <p class="mb-0.5 text-[10px] text-text-muted font-semibold">
                    变化后
                  </p>
                  <p class="text-xs text-text-secondary leading-relaxed">
                    {{ event.afterState }}
                  </p>
                </div>
              </div>

              <div v-if="event.motivationChange" class="rounded bg-white/60 p-2">
                <p class="mb-0.5 text-[10px] text-text-muted font-semibold">
                  动机变化
                </p>
                <p class="text-xs text-text-secondary leading-relaxed">
                  {{ event.motivationChange }}
                </p>
              </div>

              <div v-if="event.relationshipImpact" class="rounded bg-white/60 p-2">
                <p class="mb-0.5 text-[10px] text-text-muted font-semibold">
                  关系影响
                </p>
                <p class="text-xs text-text-secondary leading-relaxed">
                  {{ event.relationshipImpact }}
                </p>
              </div>

              <div v-if="event.evidence" class="rounded bg-white/40 p-2">
                <p class="mb-0.5 text-[10px] text-text-muted font-semibold">
                  文本证据
                </p>
                <p class="text-xs text-text-secondary leading-relaxed italic">
                  {{ event.evidence }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-in {
  animation: animate-in 0.3s ease-out;
}
@keyframes animate-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
