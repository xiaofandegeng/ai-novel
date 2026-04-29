import type { QualityReport } from '@ai-novel/shared'
import { computed, ref } from 'vue'

export function useQualityReview() {
  const reports = ref<QualityReport[]>([])
  const selectedReport = ref<QualityReport | null>(null)
  const evaluating = ref(false)

  function selectReport(report: QualityReport) {
    selectedReport.value = report
  }

  const reportIssues = computed(() => {
    if (!selectedReport.value?.issues)
      return []
    try {
      return JSON.parse(selectedReport.value.issues)
    }
    catch {
      return []
    }
  })

  const reportSuggestions = computed(() => {
    if (!selectedReport.value?.suggestions)
      return []
    try {
      return JSON.parse(selectedReport.value.suggestions)
    }
    catch {
      return []
    }
  })

  return { reports, selectedReport, evaluating, selectReport, reportIssues, reportSuggestions }
}
