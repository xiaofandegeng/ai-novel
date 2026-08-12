<script setup lang="ts">
import type { AutonomousExceptionAction, AutonomousRunException } from '@ai-novel/shared'
import { NButton, NConfirmDialog } from '@ai-novel/ui'
import { AlertTriangle } from 'lucide-vue-next'
import { computed, ref } from 'vue'

defineProps<{
  exceptions: AutonomousRunException[]
  busyId?: string | null
}>()

const emit = defineEmits<{
  action: [exceptionId: string, action: AutonomousExceptionAction]
}>()

const stopExceptionId = ref<string | null>(null)
const stopDialogOpen = computed({
  get: () => Boolean(stopExceptionId.value),
  set: (open: boolean) => {
    if (!open)
      stopExceptionId.value = null
  },
})

function submitStop() {
  if (!stopExceptionId.value)
    return
  emit('action', stopExceptionId.value, 'stop_run')
  stopExceptionId.value = null
}
</script>

<template>
  <section class="exception-center" aria-labelledby="exception-center-title">
    <header class="exception-header">
      <div>
        <p class="eyebrow">
          人工处置
        </p>
        <h2 id="exception-center-title">
          异常中心
        </h2>
      </div>
      <span class="exception-count">{{ exceptions.filter(item => item.status === 'open').length }} 项待处理</span>
    </header>

    <div v-if="!exceptions.length" class="empty-state">
      当前运行没有异常，自动写作链路保持畅通。
    </div>

    <template v-else>
      <article
        v-for="item in exceptions"
        :key="item.id"
        class="exception-card"
        :class="`severity-${item.severity}`"
      >
        <div class="exception-title-row">
          <AlertTriangle :size="17" />
          <strong>{{ item.title }}</strong>
          <span class="status-chip">{{ item.status === 'open' ? '待处理' : '已处理' }}</span>
        </div>
        <p class="exception-reason">
          {{ item.description || '工作流未提供更多错误说明。' }}
        </p>
        <dl class="exception-links">
          <div><dt>Run</dt><dd>{{ item.runId }}</dd></div>
          <div><dt>章节</dt><dd>{{ item.chapterId || '未关联' }}</dd></div>
          <div><dt>步骤</dt><dd>{{ item.stepId || '未关联' }}</dd></div>
          <div><dt>ChangeSet</dt><dd>{{ item.changeSetId || '未关联' }}</dd></div>
        </dl>
        <p class="impact">
          内容影响：未批准或未应用的正文与领域变更保持隔离，不会覆盖作者内容。
        </p>

        <div v-if="item.status === 'open'" class="exception-actions">
          <NButton size="sm" variant="primary" :loading="busyId === item.id" @click="emit('action', item.id, 'retry_step')">
            重试当前步骤
          </NButton>
          <NButton size="sm" :disabled="busyId === item.id" @click="emit('action', item.id, 'skip_chapter')">
            跳过章节
          </NButton>
          <NButton size="sm" :disabled="busyId === item.id" @click="emit('action', item.id, 'isolate_chapter')">
            隔离章节
          </NButton>
          <NButton size="sm" variant="danger" :disabled="busyId === item.id" @click="stopExceptionId = item.id">
            终止本轮
          </NButton>
        </div>
      </article>
    </template>

    <NConfirmDialog
      v-model="stopDialogOpen"
      title="终止本轮自动写作？"
      description="未完成章节会被跳过，所有未处理异常会关闭；已应用的事件不会回滚。"
      confirm-text="确认终止"
      cancel-text="继续处理"
      variant="danger"
      @confirm="submitStop"
    />
  </section>
</template>

<style scoped>
.exception-center {
  padding: 1rem;
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  background: var(--bg-surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
}
.exception-header,
.exception-title-row,
.exception-actions {
  display: flex;
  align-items: center;
}
.exception-header {
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.875rem;
}
.exception-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.95rem;
}
.eyebrow {
  margin: 0 0 0.15rem;
  color: var(--semantic-error);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.exception-count,
.status-chip {
  border-radius: 999px;
  background: var(--bg-subtle);
  padding: 0.25rem 0.55rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.empty-state {
  padding: 1rem;
  border: 1px dashed var(--border-light);
  border-radius: 0.6rem;
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
}
.exception-card {
  margin-top: 0.75rem;
  padding: 0.875rem;
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--semantic-warning);
  border-radius: 0.65rem;
}
.exception-card.severity-critical {
  border-left-color: var(--semantic-error);
}
.exception-title-row {
  gap: 0.45rem;
  color: var(--text-primary);
}
.status-chip {
  margin-left: auto;
}
.exception-reason,
.impact {
  margin: 0.65rem 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.5;
}
.impact {
  color: var(--text-muted);
}
.exception-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 0.75rem;
  margin: 0;
}
.exception-links div {
  min-width: 0;
}
.exception-links dt {
  color: var(--text-muted);
  font-size: 0.68rem;
}
.exception-links dd {
  margin: 0.1rem 0 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exception-actions {
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
@media (max-width: 640px) {
  .exception-links {
    grid-template-columns: 1fr;
  }
  .exception-actions :deep(button) {
    flex: 1 1 calc(50% - 0.5rem);
  }
}
</style>
