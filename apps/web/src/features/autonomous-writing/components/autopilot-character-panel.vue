<script setup lang="ts">
import type { CharacterArcEvent, CharacterRelationship } from '@ai-novel/shared'
import { NTag } from '@ai-novel/ui'
import { Heart, Users } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchCharacterArcProjectTimeline } from '@/api/character-arc'
import { useCharacterStore } from '@/stores/character.store'
import { useRelationshipStore } from '@/stores/relationship.store'

const props = defineProps<{
  projectId: string
  refreshTrigger?: number
}>()

const characterStore = useCharacterStore()
const relationshipStore = useRelationshipStore()
const arcEvents = ref<CharacterArcEvent[]>([])
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const majorCharacters = computed(() =>
  characterStore.characters.filter(c =>
    c.role && ['protagonist', 'antagonist', 'mentor', 'ally'].includes(c.role),
  ),
)

const latestArcPerCharacter = computed(() => {
  const map = new Map<string, CharacterArcEvent>()
  for (const event of arcEvents.value) {
    const existing = map.get(event.characterId)
    if (!existing || new Date(event.createdAt) > new Date(existing.createdAt)) {
      map.set(event.characterId, event)
    }
  }
  return map
})

function getRelationshipsForCharacter(charId: string): CharacterRelationship[] {
  return relationshipStore.relationships.filter(
    r => r.characterAId === charId || r.characterBId === charId,
  )
}

function getOtherCharName(rel: CharacterRelationship, charId: string): string {
  const otherId = rel.characterAId === charId ? rel.characterBId : rel.characterAId
  const other = characterStore.characters.find(c => c.id === otherId)
  return other?.name || '未知'
}

function getArcEventLabel(type: string): string {
  const map: Record<string, string> = {
    goal_shift: '目标转变',
    fear_triggered: '恐惧触发',
    secret_revealed: '秘密揭露',
    relationship_changed: '关系变化',
    belief_changed: '信念变化',
    ability_changed: '能力变化',
    trauma: '创伤',
    victory: '胜利',
    loss: '损失',
  }
  return map[type] || type
}

function getArcEventVariant(type: string): string {
  switch (type) {
    case 'victory': return 'success'
    case 'trauma': case 'loss': return 'error'
    case 'fear_triggered': case 'secret_revealed': return 'warning'
    default: return 'info'
  }
}

function getRoleLabel(role: string | undefined): string {
  const map: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    mentor: '导师',
    ally: '盟友',
    supporting: '配角',
    extra: '龙套',
  }
  return role ? (map[role] || role) : ''
}

function getRoleColor(role: string | undefined): string {
  switch (role) {
    case 'protagonist': return 'text-blue-500 bg-blue-50'
    case 'antagonist': return 'text-red-500 bg-red-50'
    case 'mentor': return 'text-purple-500 bg-purple-50'
    case 'ally': return 'text-green-500 bg-green-50'
    default: return 'text-text-muted bg-bg-subtle'
  }
}

function getStrengthBar(strength: number): string {
  const pct = (strength / 10) * 100
  if (strength >= 7)
    return `width:${pct}%; background: #22c55e`
  if (strength >= 4)
    return `width:${pct}%; background: #eab308`
  return `width:${pct}%; background: #ef4444`
}

async function loadData() {
  if (!props.projectId)
    return
  loading.value = true
  try {
    await Promise.all([
      characterStore.characters.length === 0
        ? characterStore.fetchCharacters(props.projectId)
        : Promise.resolve(),
      relationshipStore.relationships.length === 0
        ? relationshipStore.fetchRelationships(props.projectId)
        : Promise.resolve(),
    ])
    const timeline = await fetchCharacterArcProjectTimeline(props.projectId)
    arcEvents.value = timeline
  }
  catch (err) {
    console.error('Failed to load character data', err)
  }
  finally {
    loading.value = false
  }
}

watch(() => props.refreshTrigger, () => {
  loadData()
})

watch(() => props.projectId, () => {
  loadData()
})

onMounted(() => {
  loadData()
  timer = setInterval(loadData, 15000)
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <div class="autopilot-char-panel h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between border-b border-border-light px-4 py-3">
      <div class="flex items-center gap-2">
        <Users :size="14" class="text-primary" />
        <h3 class="text-xs text-text-muted font-bold tracking-widest uppercase">
          角色与情感
        </h3>
      </div>
      <span class="text-[10px] text-text-muted">
        {{ majorCharacters.length }} 主要角色
      </span>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-3">
      <div v-if="loading && majorCharacters.length === 0" class="py-10 text-center text-xs text-text-muted">
        加载中...
      </div>

      <div v-else-if="majorCharacters.length === 0" class="py-10 text-center text-xs text-text-muted">
        暂无角色数据
      </div>

      <div
        v-for="char in majorCharacters"
        :key="char.id"
        class="border border-border-light rounded-lg bg-bg-surface p-3"
      >
        <!-- Character header -->
        <div class="mb-2 flex items-center gap-2">
          <div
            class="h-7 w-7 flex items-center justify-center rounded-full text-xs font-bold"
            :class="getRoleColor(char.role)"
          >
            {{ char.name?.charAt(0) || '?' }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ char.name }}
            </div>
            <div class="text-[10px] text-text-muted">
              {{ getRoleLabel(char.role) }}
            </div>
          </div>
        </div>

        <!-- Goal -->
        <div v-if="char.goal" class="mb-2 rounded bg-bg-subtle px-2 py-1.5">
          <div class="text-[10px] text-text-muted">
            当前目标
          </div>
          <div class="line-clamp-2 text-xs text-text-secondary">
            {{ char.goal }}
          </div>
        </div>

        <!-- Latest arc event -->
        <div v-if="latestArcPerCharacter.get(char.id)" class="mb-2">
          <div class="mb-1 flex items-center gap-1.5">
            <Heart :size="10" class="text-primary" />
            <span class="text-[10px] text-text-muted">最新状态变化</span>
          </div>
          <div class="flex items-start gap-1.5">
            <NTag size="sm" :variant="getArcEventVariant(latestArcPerCharacter.get(char.id)!.eventType) as any">
              {{ getArcEventLabel(latestArcPerCharacter.get(char.id)!.eventType) }}
            </NTag>
            <span v-if="latestArcPerCharacter.get(char.id)?.afterState" class="line-clamp-2 flex-1 text-[10px] text-text-secondary">
              {{ latestArcPerCharacter.get(char.id)!.afterState }}
            </span>
          </div>
        </div>

        <!-- Relationships -->
        <div v-if="getRelationshipsForCharacter(char.id).length > 0">
          <div class="mb-1 text-[10px] text-text-muted">
            关系
          </div>
          <div class="space-y-1">
            <div
              v-for="rel in getRelationshipsForCharacter(char.id).slice(0, 4)"
              :key="rel.id"
              class="flex items-center gap-2 text-[10px]"
            >
              <span class="shrink-0 text-text-secondary">{{ getOtherCharName(rel, char.id) }}</span>
              <NTag size="sm" variant="default">
                {{ rel.type }}
              </NTag>
              <div class="flex-1">
                <div class="h-1 w-full overflow-hidden rounded-full bg-bg-subtle">
                  <div class="h-full rounded-full" :style="getStrengthBar(rel.strength)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent arc events timeline -->
      <div v-if="arcEvents.length > 0" class="mt-2">
        <div class="mb-2 text-[10px] text-text-muted font-bold tracking-wider uppercase">
          情感变化时间线
        </div>
        <div class="space-y-1.5">
          <div
            v-for="event in arcEvents.slice(0, 8)"
            :key="event.id"
            class="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-subtle"
          >
            <div class="mt-0.5">
              <NTag size="sm" :variant="getArcEventVariant(event.eventType) as any">
                {{ getArcEventLabel(event.eventType) }}
              </NTag>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[10px] font-medium">
                {{ characterStore.characters.find(c => c.id === event.characterId)?.name || '未知' }}
              </div>
              <div v-if="event.afterState" class="line-clamp-1 text-[9px] text-text-muted">
                {{ event.afterState }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
