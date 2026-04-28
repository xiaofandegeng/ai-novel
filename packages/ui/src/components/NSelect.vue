<script setup lang="ts">
import { useId } from 'vue'

interface SelectOption {
  label: string
  value: string | number
}

interface Props {
  modelValue?: string | number
  label: string
  options?: SelectOption[]
  placeholder?: string
  error?: string
  disabled?: boolean
}

const _props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  options: () => [],
  placeholder: '',
  error: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectId = useId()

function onChange(event: Event) {
  const el = event.target as HTMLSelectElement
  const val = el.value
  const numericVal = Number(val)
  emit('update:modelValue', Number.isNaN(numericVal) ? val : numericVal)
}
</script>

<template>
  <div>
    <label :for="selectId" class="mb-1 block text-sm text-text-primary font-medium">
      {{ label }}
    </label>
    <div class="relative">
      <select
        :id="selectId"
        :value="modelValue"
        :disabled="disabled"
        class="h-10 w-full appearance-none border border-border-light rounded-md bg-bg-surface px-3 pr-9 text-sm text-text-primary transition-colors disabled:cursor-not-allowed focus:border-primary disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        :class="{ 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/20': error }"
        @change="onChange"
      >
        <option v-if="placeholder" value="" disabled>
          {{ placeholder }}
        </option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <svg
        class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 text-text-muted -translate-y-1/2"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </div>
    <p v-if="error" class="mt-1 text-xs text-semantic-error">
      {{ error }}
    </p>
  </div>
</template>
