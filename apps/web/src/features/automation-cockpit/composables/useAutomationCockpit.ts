import type { AutonomousExceptionAction, CreateAutonomousRunInput } from '@ai-novel/shared'
import { computed } from 'vue'
import * as runsApi from '../api/autonomous-runs.api'
import { useAutomationCockpitStore } from '../stores/automation-cockpit.store'

export function useAutomationCockpit(projectId: string) {
  const store = useAutomationCockpitStore()

  const project = computed(() => store.payload?.project || null)
  const run = computed(() => store.payload?.run || null)
  const chapters = computed(() => store.payload?.chapters || [])
  const characters = computed(() => store.payload?.characters || [])
  const relationships = computed(() => store.payload?.relationships || [])
  const conflicts = computed(() => store.payload?.conflicts || [])
  const foreshadowing = computed(() => store.payload?.foreshadowing || [])
  const plotDirection = computed(() => store.payload?.plotDirection || null)
  const health = computed(() => store.payload?.health || null)
  const events = computed(() => store.payload?.events || [])
  const exceptions = computed(() => store.payload?.exceptions || [])
  const chapterDetail = computed(() => store.chapterDetail)

  async function loadCockpit() {
    if (!projectId)
      return
    await store.fetchCockpit(projectId)
  }

  async function loadChapter(chapterId: string) {
    if (!projectId || !chapterId)
      return
    await store.fetchChapter(projectId, chapterId)
  }

  async function startRun(input: CreateAutonomousRunInput) {
    if (!projectId)
      return
    const runId = run.value?.status === 'idle'
      ? run.value.id
      : (await runsApi.createAutonomousRun(projectId, input)).id
    await runsApi.startAutonomousRun(projectId, runId)
    await loadCockpit()
  }

  async function pauseRun() {
    if (!projectId || !run.value)
      return
    await runsApi.pauseAutonomousRun(projectId, run.value.id)
    await loadCockpit()
  }

  async function resumeRun() {
    if (!projectId || !run.value)
      return
    await runsApi.resumeAutonomousRun(projectId, run.value.id)
    await loadCockpit()
  }

  async function abandonRun() {
    if (!projectId || !run.value)
      return
    await runsApi.abandonAutonomousRun(projectId, run.value.id)
    await loadCockpit()
  }

  async function approveItem(changeSetId: string, itemId: string) {
    if (!projectId)
      return
    await store.approveItem(projectId, changeSetId, itemId)
    await loadCockpit() // 同步重新加载状态以在看板反映最新档案
  }

  async function rejectItem(changeSetId: string, itemId: string) {
    if (!projectId)
      return
    await store.rejectItem(projectId, changeSetId, itemId)
    await loadCockpit()
  }

  async function resolveException(exceptionId: string, action: AutonomousExceptionAction) {
    if (!projectId || !run.value)
      return
    await runsApi.resolveAutonomousException(projectId, run.value.id, exceptionId, action)
    await loadCockpit()
  }

  return {
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
    exceptions,
    chapterDetail,
    loadCockpit,
    loadChapter,
    startRun,
    pauseRun,
    resumeRun,
    abandonRun,
    approveItem,
    rejectItem,
    resolveException,
  }
}
