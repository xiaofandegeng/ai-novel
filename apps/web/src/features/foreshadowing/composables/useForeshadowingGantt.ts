import type { ForeshadowingItem } from '@ai-novel/shared'
import { useToast } from '@ai-novel/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChapterStore } from '@/stores/chapter.store'
import { useForeshadowingStore } from '@/stores/foreshadowing.store'
import { useProjectStore } from '@/stores/project.store'

export function useForeshadowingGantt(projectId: string) {
  const toast = useToast()
  const router = useRouter()
  const projectStore = useProjectStore()
  const foreshadowingStore = useForeshadowingStore()
  const chapterStore = useChapterStore()

  const loading = ref(true)
  const selectedItem = ref<ForeshadowingItem | null>(null)
  const statusFilter = ref<string>('all')

  const chapters = computed(() => chapterStore.chapters)
  const items = computed(() => foreshadowingStore.items)

  const filteredItems = computed(() => {
    if (statusFilter.value === 'all')
      return items.value
    return items.value.filter(i => i.status === statusFilter.value)
  })

  const chapterNumbers = computed(() => {
    return chapters.value.map(c => c.chapterNumber).sort((a, b) => a - b)
  })

  const maxChapter = computed(() => {
    const nums = chapterNumbers.value
    return nums.length > 0 ? nums[nums.length - 1] : 0
  })

  interface GanttBar {
    item: ForeshadowingItem
    start: number
    end: number
    color: string
  }

  const ganttBars = computed<GanttBar[]>(() => {
    const chapterMap = new Map(chapters.value.map(c => [c.id, c.chapterNumber]))

    const statusColor: Record<string, string> = {
      open: '#3b82f6',
      progressing: '#f59e0b',
      paid_off: '#10b981',
      abandoned: '#9ca3af',
    }

    return filteredItems.value.map((item) => {
      const startNum = item.setupChapterId ? (chapterMap.get(item.setupChapterId) || 1) : 1
      const endNum = item.payoffChapterId
        ? (chapterMap.get(item.payoffChapterId) || startNum)
        : item.expectedPayoffChapterId
          ? (chapterMap.get(item.expectedPayoffChapterId) || startNum)
          : startNum + 5

      return {
        item,
        start: startNum,
        end: Math.max(endNum, startNum),
        color: statusColor[item.status] || '#6b7280',
      }
    })
  })

  function selectItem(id: string) {
    selectedItem.value = items.value.find(i => i.id === id) || null
  }

  function navigateToChapter(_chapterId: string) {
    router.push(`/project/${projectId}/outline`)
  }

  onMounted(async () => {
    try {
      await Promise.all([
        projectStore.fetchProject(projectId),
        chapterStore.fetchChapters(projectId),
        foreshadowingStore.fetchItems(projectId),
      ])
    }
    catch {
      toast.add('加载伏笔数据失败', 'error')
    }
    finally {
      loading.value = false
    }
  })

  return {
    loading,
    selectedItem,
    statusFilter,
    chapters,
    ganttBars,
    chapterNumbers,
    maxChapter,
    selectItem,
    navigateToChapter,
    projectStore,
    foreshadowingStore,
  }
}
