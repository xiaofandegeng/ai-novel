<script setup lang="ts">
import { NAppLayout } from '@ai-novel/ui'
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb.vue'
import { useProjectStore } from '@/stores/project.store'
import ProjectShellOutlet from './project-shell-outlet.vue'

const route = useRoute()
const projectStore = useProjectStore()

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

    <ProjectShellOutlet />
  </NAppLayout>
</template>
