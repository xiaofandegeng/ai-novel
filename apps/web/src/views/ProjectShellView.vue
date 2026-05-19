<script setup lang="ts">
import { NAppLayout } from '@ai-novel/ui'
import { computed, onMounted, provide, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb.vue'
import { useProjectStore } from '@/stores/project.store'

const route = useRoute()
const projectStore = useProjectStore()

provide('project-shell-active', true)

const projectId = computed(() => route.params.id as string)

async function loadProject() {
  if (!projectId.value)
    return

  if (projectStore.currentProject?.id === projectId.value)
    return

  await projectStore.fetchProject(projectId.value)
}

onMounted(loadProject)

watch(projectId, () => {
  loadProject()
})
</script>

<template>
  <NAppLayout
    :project-name="projectStore.currentProject?.title || '加载中...'"
    :project-id="projectId"
  >
    <template #topbar-left>
      <ProjectBreadcrumb
        :title="projectStore.currentProject?.title"
        title-fallback="加载中..."
        :title-to="`/project/${projectId}`"
      />
    </template>

    <template #nav>
      <AppSidebar :project-id="projectId" />
    </template>

    <RouterView />
  </NAppLayout>
</template>
