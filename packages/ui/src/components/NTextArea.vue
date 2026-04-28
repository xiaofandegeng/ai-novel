<script setup lang="ts">
import { useId } from 'vue'

interface Props {
  modelValue?: string
  label: string
  placeholder?: string
  error?: string
  disabled?: boolean
  rows?: number
  autoResize?: boolean
  maxHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  error: '',
  disabled: false,
  rows: 3,
  autoResize: true,
  maxHeight: 300,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaRef = defineModel<string>()
const textareaId = useId()

function onInput(event: Event) {
  const el = event.target as HTMLTextAreaElement
  emit('update:modelValue', el.value)

  if (props.autoResize) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, props.maxHeight)}px`
  }
}
</script>

<template>
  <div>
    <label :for="textareaId" class="mb-1 block text-sm text-text-primary font-medium">
      {{ label }}
    </label>
    <textarea
      :id="textareaId"
      ref="textareaRef"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      class="w-full border border-border-light rounded-md bg-bg-surface px-3 py-2 text-sm text-text-primary transition-colors disabled:cursor-not-allowed focus:border-primary placeholder:text-text-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
      :class="[
        { 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/20': error },
        { 'resize-y': !autoResize },
      ]"
      @input="onInput"
    />
    <p v-if="error" class="mt-1 text-xs text-semantic-error">
      {{ error }}
    </p>
  </div>
</template>
