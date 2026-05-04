import type { CreateWritingJobInput, WritingJob } from '@ai-novel/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/writing-jobs'

export const useWritingJobStore = defineStore('writingJob', () => {
  const job = ref<WritingJob | null>(null)

  async function fetchJob(projectId: string) {
    job.value = await api.fetchWritingJob(projectId)
  }

  async function createJob(projectId: string, data: CreateWritingJobInput) {
    job.value = await api.createWritingJob(projectId, data)
    return job.value
  }

  async function startJob(projectId: string) {
    if (!job.value)
      return
    job.value = await api.startWritingJob(projectId, job.value.id)
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
  }

  return { job, fetchJob, createJob, startJob, pauseJob, continueJob, deleteJob }
})
