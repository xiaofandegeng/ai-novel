<script setup lang="ts">
import type { ReferenceTrainingSet, WritingPersona } from '@ai-novel/shared'
import {
  NAppLayout,
  NButton,
  NModal,
  NPanel,
  NTag,
  useToast,
} from '@ai-novel/ui'
import {
  Brain,
  Layers,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as personaApi from '../api/persona'

const router = useRouter()
const toast = useToast()

const trainingSets = ref<ReferenceTrainingSet[]>([])
const personas = ref<WritingPersona[]>([])
const loading = ref(true)

const showCreateSet = ref(false)
const newSetName = ref('')
const newSetGenre = ref('')

const showCreatePersona = ref(false)
const newPersonaName = ref('')
const newPersonaGenre = ref('')

onMounted(async () => {
  try {
    const [sets, pers] = await Promise.all([
      personaApi.listTrainingSets(),
      personaApi.listPersonas(),
    ])
    trainingSets.value = sets
    personas.value = pers
  }
  catch {
    toast.add('加载写作人格库失败', 'error')
  }
  finally {
    loading.value = false
  }
})

async function handleCreateSet() {
  if (!newSetName.value.trim())
    return
  try {
    const row = await personaApi.createTrainingSet({ name: newSetName.value.trim(), genre: newSetGenre.value.trim() || undefined })
    trainingSets.value.unshift(row)
    showCreateSet.value = false
    newSetName.value = ''
    newSetGenre.value = ''
    toast.add('训练集已创建', 'success')
  }
  catch {
    toast.add('创建训练集失败', 'error')
  }
}

async function handleDeleteSet(id: string) {
  try {
    await personaApi.deleteTrainingSet(id)
    trainingSets.value = trainingSets.value.filter(s => s.id !== id)
    toast.add('训练集已删除', 'success')
  }
  catch {
    toast.add('删除失败', 'error')
  }
}

async function handleCreatePersona() {
  if (!newPersonaName.value.trim())
    return
  try {
    const row = await personaApi.createPersona({ name: newPersonaName.value.trim(), genre: newPersonaGenre.value.trim() || undefined })
    personas.value.unshift(row)
    showCreatePersona.value = false
    newPersonaName.value = ''
    newPersonaGenre.value = ''
    toast.add('人格已创建', 'success')
  }
  catch {
    toast.add('创建人格失败', 'error')
  }
}

async function handleDeletePersona(id: string) {
  try {
    await personaApi.deletePersona(id)
    personas.value = personas.value.filter(p => p.id !== id)
    toast.add('人格已删除', 'success')
  }
  catch {
    toast.add('删除失败', 'error')
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = { draft: '草稿', analyzing: '分析中', ready: '就绪', failed: '失败', published: '已发布', archived: '已归档', uploaded: '已上传', splitting: '拆分中', completed: '已完成' }
  return map[status] || status
}

function statusVariant(status: string) {
  if (['ready', 'completed', 'published'].includes(status))
    return 'success'
  if (['failed'].includes(status))
    return 'error'
  if (['analyzing', 'splitting'].includes(status))
    return 'warning'
  return 'info'
}
</script>

<template>
  <NAppLayout project-name="写作人格库">
    <template #topbar-left>
      <div class="flex items-center gap-2">
        <Brain :size="22" class="text-primary" />
        <h1 class="text-lg text-text-primary font-bold">
          写作人格库
        </h1>
      </div>
    </template>

    <template #topbar-right>
      <div class="flex items-center gap-2">
        <NButton variant="secondary" size="sm" @click="showCreateSet = true">
          <Plus :size="15" />
          新建训练集
        </NButton>
        <NButton variant="primary" size="sm" @click="showCreatePersona = true">
          <Sparkles :size="15" />
          新建人格
        </NButton>
      </div>
    </template>

    <div class="mx-auto max-w-6xl p-8 space-y-8">
      <div v-if="loading" class="py-20 text-center text-text-muted">
        加载中...
      </div>

      <template v-else>
        <NPanel title="训练集" padding>
          <template #actions>
            <NButton variant="ghost" size="sm" @click="showCreateSet = true">
              <Plus :size="14" />
              新建
            </NButton>
          </template>
          <div v-if="trainingSets.length === 0" class="py-10 text-center text-sm text-text-muted">
            尚无训练集。创建训练集并上传参考网文来训练写作人格。
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="set in trainingSets"
              :key="set.id"
              class="flex cursor-pointer items-center justify-between border border-border-light rounded-lg p-4 transition-colors hover:border-primary/30 hover:bg-bg-subtle"
              @click="router.push(`/persona/training-set/${set.id}`)"
            >
              <div class="flex items-center gap-4">
                <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Layers :size="20" />
                </div>
                <div>
                  <div class="text-sm text-text-primary font-semibold">
                    {{ set.name }}
                  </div>
                  <div class="mt-1 text-xs text-text-muted">
                    {{ set.genre || '未设定类型' }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <NTag :variant="statusVariant(set.status)" size="sm">
                  {{ statusLabel(set.status) }}
                </NTag>
                <button
                  class="p-1 text-text-muted transition-colors hover:text-semantic-error"
                  @click.stop="handleDeleteSet(set.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </NPanel>

        <NPanel title="写作人格" padding>
          <template #actions>
            <NButton variant="ghost" size="sm" @click="showCreatePersona = true">
              <Plus :size="14" />
              新建
            </NButton>
          </template>
          <div v-if="personas.length === 0" class="py-10 text-center text-sm text-text-muted">
            尚无写作人格。从训练集生成或手动创建。
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="persona in personas"
              :key="persona.id"
              class="flex cursor-pointer items-center justify-between border border-border-light rounded-lg p-4 transition-colors hover:border-primary/30 hover:bg-bg-subtle"
              @click="router.push(`/persona/${persona.id}`)"
            >
              <div class="flex items-center gap-4">
                <div class="h-10 w-10 flex items-center justify-center rounded-lg bg-ai-soft text-ai">
                  <Brain :size="20" />
                </div>
                <div>
                  <div class="text-sm text-text-primary font-semibold">
                    {{ persona.name }}
                  </div>
                  <div class="mt-1 text-xs text-text-muted">
                    {{ persona.genre || '未设定类型' }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <NTag :variant="statusVariant(persona.status)" size="sm">
                  {{ statusLabel(persona.status) }}
                </NTag>
                <button
                  class="p-1 text-text-muted transition-colors hover:text-semantic-error"
                  @click.stop="handleDeletePersona(persona.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </NPanel>
      </template>
    </div>

    <NModal v-model="showCreateSet" title="新建训练集">
      <form class="space-y-4" @submit.prevent="handleCreateSet">
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">训练集名称</label>
          <input v-model="newSetName" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="例如：都市反杀型训练集">
        </div>
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">题材（可选）</label>
          <input v-model="newSetGenre" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="例如：都市、玄幻">
        </div>
        <div class="flex justify-end gap-2">
          <NButton variant="ghost" size="sm" @click="showCreateSet = false">
            取消
          </NButton>
          <NButton variant="primary" size="sm" :disabled="!newSetName.trim()" @click="handleCreateSet">
            创建
          </NButton>
        </div>
      </form>
    </NModal>

    <NModal v-model="showCreatePersona" title="新建写作人格">
      <form class="space-y-4" @submit.prevent="handleCreatePersona">
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">人格名称</label>
          <input v-model="newPersonaName" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="例如：都市高压反杀型">
        </div>
        <div>
          <label class="mb-1 block text-sm text-text-secondary font-medium">题材（可选）</label>
          <input v-model="newPersonaGenre" class="w-full border border-border-light rounded-lg bg-bg-surface px-3 py-2 text-sm" placeholder="例如：都市">
        </div>
        <div class="flex justify-end gap-2">
          <NButton variant="ghost" size="sm" @click="showCreatePersona = false">
            取消
          </NButton>
          <NButton variant="primary" size="sm" :disabled="!newPersonaName.trim()" @click="handleCreatePersona">
            创建
          </NButton>
        </div>
      </form>
    </NModal>
  </NAppLayout>
</template>
