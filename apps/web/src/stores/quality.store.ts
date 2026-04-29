import type { QualityReport } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as qualityApi from '../api/quality'

export const useQualityStore = defineStore('quality', () => {
  const reports = ref<QualityReport[]>([])
  const currentReport = ref<QualityReport | null>(null)

  async function fetchReports(projectId: string) {
    reports.value = await qualityApi.fetchReports(projectId)
  }

  async function runQualityCheck(projectId: string, chapterId: string) {
    const report = await qualityApi.runQualityCheck(projectId, chapterId)
    reports.value.unshift(report)
    currentReport.value = report
    return report
  }

  async function fetchReport(projectId: string, reportId: string) {
    currentReport.value = await qualityApi.getReport(projectId, reportId)
    return currentReport.value
  }

  return { reports, currentReport, fetchReports, runQualityCheck, fetchReport }
})
