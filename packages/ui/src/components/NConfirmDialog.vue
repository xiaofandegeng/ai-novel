<script setup lang="ts">
import { NButton, NModal } from './'

interface Props {
  modelValue: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'primary',
  loading: false,
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

function handleCancel() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleConfirm() {
  emit('confirm')
}
</script>

<template>
  <NModal
    :model-value="modelValue"
    :title="title"
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <div class="space-y-4">
      <p v-if="description" class="text-sm text-text-secondary leading-relaxed">
        {{ description }}
      </p>
      <div v-else>
        <slot />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <NButton variant="ghost" @click="handleCancel">
          {{ cancelText }}
        </NButton>
        <NButton
          :variant="variant === 'danger' ? 'primary' : variant"
          :class="{ 'bg-semantic-error border-none hover:bg-semantic-error/90': variant === 'danger' }"
          :loading="loading"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
