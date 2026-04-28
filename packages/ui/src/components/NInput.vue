<script setup lang="ts">
import { useId } from 'vue'

interface Props {
  modelValue?: string
  label: string
  placeholder?: string
  error?: string
  disabled?: boolean
  type?: 'text' | 'password' | 'email' | 'number'
  id?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  error: '',
  disabled: false,
  type: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputId = props.id ?? useId()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div>
    <label :for="inputId" class="mb-1 block text-sm text-text-primary font-medium">
      {{ label }}
    </label>
    <input
      :id="inputId"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="h-10 w-full border border-border-light rounded-md bg-bg-surface px-3 text-sm text-text-primary transition-colors disabled:cursor-not-allowed focus:border-primary placeholder:text-text-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
      :class="{ 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/20': error }"
      @input="onInput"
    >
    <p v-if="error" class="mt-1 text-xs text-semantic-error">
      {{ error }}
    </p>
  </div>
</template>
