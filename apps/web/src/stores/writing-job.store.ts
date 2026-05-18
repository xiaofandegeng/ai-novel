import type { CreateWritingJobInput, WritingJob, WritingJobStep } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/writing-jobs'

export const useWritingJobStore = defineStore('writingJob', () => {
  const job = ref<WritingJob | null>(null)
  const steps = ref<WritingJobStep[]>([])

  async function fetchJob(projectId: string) {
    job.value = await api.fetchWritingJob(projectId)
    if (job.value) {
      steps.value = await api.fetchJobSteps(projectId, job.value.id)
    }
    else {
      steps.value = []
    }
  }

  async function createJob(projectId: string, data: CreateWritingJobInput) {
    job.value = await api.createWritingJob(projectId, data)
    if (job.value) {
      steps.value = await api.fetchJobSteps(projectId, job.value.id)
    }
    return job.value
  }

  async function startJob(projectId: string) {
    if (!job.value)
      return
    job.value = await api.startWritingJob(projectId, job.value.id)
    steps.value = await api.fetchJobSteps(projectId, job.value.id)
  }

  async function pauseJob(projectId: string) {
    if (!job.value)
      return
    job.value = await api.pauseWritingJob(projectId, job.value.id)
  }

  async function continueJob(projectId: string) {
    if (!job.value)
      return
    job.value = await api.continueWritingJob(projectId, job.value.id)
  }

  async function deleteJob(projectId: string) {
    if (!job.value)
      return
    await api.deleteWritingJob(projectId, job.value.id)
    job.value = null
    steps.value = []
  }

  async function retryStep(projectId: string, stepId: string) {
    if (!job.value)
      return
    const result = await api.retryStep(projectId, job.value.id, stepId)
    job.value = result.job
    steps.value = result.steps
  }

  return {
    job,
    steps,
    fetchJob,
    createJob,
    startJob,
    pauseJob,
    continueJob,
    deleteJob,
    retryStep,
  }
})
