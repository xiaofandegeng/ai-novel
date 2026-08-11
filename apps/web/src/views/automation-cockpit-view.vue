<script setup lang="ts">
import { useToast } from '@ai-novel/ui'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useChapterStore } from '@/features/automation-cockpit/stores/chapter.store'
import AutomationControlPanel from '../features/automation-cockpit/components/automation-control-panel.vue'
import ChapterDetailDrawer from '../features/automation-cockpit/components/chapter-detail-drawer.vue'

import ChapterPipelinePanel from '../features/automation-cockpit/components/chapter-pipeline-panel.vue'
// 导入子组件
import CockpitHeader from '../features/automation-cockpit/components/cockpit-header.vue'
import NarrativeEventStream from '../features/automation-cockpit/components/narrative-event-stream.vue'
import NarrativeStateBoard from '../features/automation-cockpit/components/narrative-state-board.vue'
// 导入驾驶舱组合式与轮询函数
import { useAutomationCockpit } from '../features/automation-cockpit/composables/useAutomationCockpit'
import { useCockpitPolling } from '../features/automation-cockpit/composables/useCockpitPolling'

const route = useRoute()
const toast = useToast()
const projectId = route.params.id as string

const {
  project,
  run,
  chapters,
  characters,
  relationships,
  conflicts,
  foreshadowing,
  plotDirection,
  health,
  events,
  chapterDetail,
  loadCockpit,
  loadChapter,
  startRun,
  pauseRun,
  resumeRun,
  abandonRun,
  approveItem,
  rejectItem,
} = useAutomationCockpit(projectId)

useCockpitPolling(projectId, 4000)

const chapterStore = useChapterStore()

// 控制右侧看板 Tab 和章节详情抽屉
const narrativeTabs = ['character', 'relationship', 'conflict', 'foreshadowing', 'plot', 'health'] as const
type NarrativeTab = typeof narrativeTabs[number]
const activeNarrativeTab = ref<NarrativeTab>('character')
const drawerInitialTab = ref<'content' | 'outline' | 'scenes'>('content')

const detailDrawerVisible = ref(false)
const activeChapterId = ref('')

// 监听路由 query 参数，实现深层链接或点击直达
watch(
  () => route.query,
  (query) => {
    if (typeof query.tab === 'string' && narrativeTabs.includes(query.tab as NarrativeTab)) {
      activeNarrativeTab.value = query.tab as NarrativeTab
    }
    if (query.chapter) {
      if (query.tab === 'outline') {
        drawerInitialTab.value = 'outline'
      }
      else {
        drawerInitialTab.value = 'content'
      }
      activeChapterId.value = query.chapter as string
      detailDrawerVisible.value = true
      loadChapter(query.chapter as string)
    }
  },
  { immediate: true },
)

onMounted(async () => {
  if (projectId) {
    await loadCockpit()
  }
})

// 当点击流水线中的章节时打开抽屉并拉取章节详情
async function handleChapterClick(chapterId: string) {
  drawerInitialTab.value = 'content'
  activeChapterId.value = chapterId
  detailDrawerVisible.value = true
  await loadChapter(chapterId)
}

// 采纳写回事件变更
async function handleApproveEvent(eventId: string, changeSetId: string) {
  try {
    await approveItem(changeSetId, eventId)
    toast.add('采纳成功：该变更已成功应用回写至对应档案/正文。', 'success')
  }
  catch {
    toast.add('采纳失败：应用该变更时发生错误。', 'error')
  }
}

// 驳回写回事件变更
async function handleRejectEvent(eventId: string, changeSetId: string) {
  try {
    await rejectItem(changeSetId, eventId)
    toast.add('已驳回：该变更为隔离忽略状态。', 'success')
  }
  catch {
    toast.add('驳回失败：操作过程中发生错误。', 'error')
  }
}

// 抽屉中正文保存修改
async function handleSaveChapter(text: string) {
  if (!projectId || !activeChapterId.value) {
    return
  }
  try {
    await chapterStore.updateChapter(projectId, activeChapterId.value, {
      draft: text,
    })
    toast.add('保存成功：章节正文已更新。', 'success')
    // 保存后重新拉取该章节详情
    await loadChapter(activeChapterId.value)
    // 同时刷新驾驶舱基本数据，以便统计字数等
    await loadCockpit()
  }
  catch {
    toast.add('保存失败：保存正文时发生异常。', 'error')
  }
}
</script>

<template>
  <div class="automation-cockpit-view">
    <!-- 顶部项目概览栏 -->
    <CockpitHeader
      :project="project"
      :loading="false"
      @refresh="loadCockpit"
    />

    <!-- 驾驶舱主操控面板及信息排布区 -->
    <main class="cockpit-content-layout">
      <!-- 左侧：任务控制、流水线与事件流 -->
      <section class="left-control-region">
        <div class="control-card">
          <AutomationControlPanel
            :run="run"
            :loading="false"
            @start="startRun"
            @pause="pauseRun"
            @resume="resumeRun"
            @abandon="abandonRun"
          />
        </div>

        <div class="pipeline-card">
          <div class="card-title-wrap">
            <h2 class="region-title">
              全书章节写作流水线状态
            </h2>
          </div>
          <div class="pipeline-scroll-wrap">
            <ChapterPipelinePanel
              :chapters="chapters"
              @chapter-click="handleChapterClick"
            />
          </div>
        </div>

        <!-- 回写事件流 -->
        <div class="event-stream-container">
          <NarrativeEventStream
            :events="events"
            @approve="handleApproveEvent"
            @reject="handleRejectEvent"
          />
        </div>
      </section>

      <!-- 右侧：六个维度的叙事动态感知看板 -->
      <section class="right-narrative-region">
        <NarrativeStateBoard
          v-model:active-tab="activeNarrativeTab"
          :characters="characters"
          :relationships="relationships"
          :conflicts="conflicts"
          :foreshadowing="foreshadowing"
          :plot-direction="plotDirection"
          :health="health"
          @refresh="loadCockpit"
        />
      </section>
    </main>

    <!-- 章节详情与正文编辑抽屉 -->
    <ChapterDetailDrawer
      v-model="detailDrawerVisible"
      :project-id="projectId"
      :chapter-id="activeChapterId"
      :chapter-detail="chapterDetail"
      :initial-tab="drawerInitialTab"
      @save="handleSaveChapter"
    />
  </div>
</template>

<style lang="scss" scoped>
.automation-cockpit-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-app, #f4f6f8);
  overflow: hidden;

  .cockpit-content-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
    padding: 1rem;
    gap: 1rem;

    .left-control-region {
      flex: 3;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 0; // 防止flex子项溢出
      overflow-y: auto;
      padding-right: 0.25rem; // 细微留白以避开滚动条

      /* 滚动条美化 */
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-thumb {
        background-color: var(--border-light, #e5e7eb);
        border-radius: 3px;
      }

      .control-card {
        flex-shrink: 0;
      }

      .pipeline-card {
        background-color: var(--bg-surface, #ffffff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 0.75rem;
        padding: 1rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        min-height: 280px;
        flex: 1;

        .card-title-wrap {
          margin-bottom: 0.75rem;
          border-bottom: 1px solid var(--border-light, #f3f4f6);
          padding-bottom: 0.5rem;

          .region-title {
            font-size: 0.9375rem;
            font-weight: 700;
            color: var(--text-primary, #111827);
            margin: 0;
          }
        }

        .pipeline-scroll-wrap {
          flex: 1;
          overflow-y: auto;

          /* 滚动条美化 */
          &::-webkit-scrollbar {
            width: 4px;
          }
          &::-webkit-scrollbar-thumb {
            background-color: var(--border-light, #f3f4f6);
            border-radius: 2px;
          }
        }
      }

      .event-stream-container {
        flex-shrink: 0;
        height: 320px;
      }
    }

    .right-narrative-region {
      flex: 2;
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
    }
  }
}
</style>
