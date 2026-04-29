<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  bordered?: boolean
  padding?: boolean
}

withDefaults(defineProps<Props>(), {
  title: '',
  description: '',
  bordered: true,
  padding: true,
})
</script>

<template>
  <div
    class="rounded-lg bg-bg-surface shadow-sm"
    :class="bordered ? 'border border-border-light' : ''"
  >
    <div
      v-if="title || $slots.header"
      class="flex items-start justify-between gap-4 border-b border-border-light/70 p-4"
    >
      <div>
        <slot name="header">
          <h3 class="text-base text-text-primary font-semibold">
            {{ title }}
          </h3>
          <p v-if="description" class="mt-0.5 text-sm text-text-muted">
            {{ description }}
          </p>
        </slot>
      </div>
      <div v-if="$slots.actions">
        <slot name="actions" />
      </div>
    </div>
    <div :class="padding ? 'p-4' : ''">
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      class="border-t border-border-light p-4 pt-3"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
