<script setup lang="ts">
defineProps<{
  placeholder?: string
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <input
    v-model="model"
    aria-label="章节标题"
    :placeholder="placeholder || '章节标题'"
    class="w-full border-none bg-transparent p-0 text-2xl text-text-primary font-bold focus-visible:rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
  >
</template>
