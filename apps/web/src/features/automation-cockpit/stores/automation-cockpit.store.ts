import type { AutomationCockpitPayload, CockpitChapterDetail } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/automation-cockpit.api'

export const useAutomationCockpitStore = defineStore('automationCockpit', () => {
  const payload = ref<AutomationCockpitPayload | null>(null)
  const chapterDetail = ref<CockpitChapterDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchCockpit(projectId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.fetchAutomationCockpit(projectId)
      payload.value = res
    }
    catch (e: any) {
      error.value = e.message || '拉取驾驶舱数据失败'
      console.error(e)
    }
    finally {
      loading.value = false
    }
  }

  async function fetchChapter(projectId: string, chapterId: string) {
    try {
      const res = await api.fetchCockpitChapterDetail(projectId, chapterId)
      chapterDetail.value = res
    }
    catch (e: any) {
      console.error('拉取章节详情失败', e)
    }
  }

  async function approveItem(projectId: string, changeSetId: string, itemId: string) {
    try {
      await api.approveChangeSetItem(projectId, changeSetId, itemId)
      if (payload.value?.events) {
        const item = payload.value.events.find(e => e.id === itemId)
        if (item)
          item.status = 'auto_applied'
      }
    }
    catch (e: any) {
      console.error('采纳变更失败', e)
    }
  }

  async function rejectItem(projectId: string, changeSetId: string, itemId: string) {
    try {
      await api.rejectChangeSetItem(projectId, changeSetId, itemId)
      if (payload.value?.events) {
        const item = payload.value.events.find(e => e.id === itemId)
        if (item)
          item.status = 'ignored'
      }
    }
    catch (e: any) {
      console.error('拒绝变更失败', e)
    }
  }

  function clearCockpit() {
    payload.value = null
    chapterDetail.value = null
    error.value = null
  }

  return {
    payload,
    chapterDetail,
    loading,
    error,
    fetchCockpit,
    fetchChapter,
    approveItem,
    rejectItem,
    clearCockpit,
  }
})
