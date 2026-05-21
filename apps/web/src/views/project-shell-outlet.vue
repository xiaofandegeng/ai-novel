<script setup lang="ts">
import { provide } from 'vue'
import { RouterView } from 'vue-router'

provide('project-shell-active', true)
</script>

<template>
  <RouterView />
</template>
