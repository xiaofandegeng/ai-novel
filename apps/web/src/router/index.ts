import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'projects',
      component: () => import('@/views/ProjectListView.vue'),
    },
    {
      path: '/project/:id',
      component: () => import('@/views/ProjectShellView.vue'),
      children: [
        {
          path: '',
          name: 'project-home',
          component: () => import('@/views/ProjectHomeView.vue'),
        },
        {
          path: 'bible',
          name: 'story-bible',
          component: () => import('@/views/StoryBibleView.vue'),
        },
        {
          path: 'characters',
          name: 'characters',
          component: () => import('@/views/CharactersView.vue'),
        },
        {
          path: 'outline',
          name: 'outline',
          component: () => import('@/views/OutlineView.vue'),
        },
        {
          path: 'write',
          name: 'write',
          component: () => import('@/views/WritingView.vue'),
        },
        {
          path: 'relationships',
          name: 'relationships',
          component: () => import('@/views/RelationshipsView.vue'),
        },
        {
          path: 'conflicts',
          name: 'conflicts',
          component: () => import('@/views/ConflictMatrixView.vue'),
        },
        {
          path: 'foreshadowing',
          name: 'foreshadowing',
          component: () => import('@/views/ForeshadowingLedgerView.vue'),
        },
        {
          path: 'health',
          name: 'project-health',
          component: () => import('@/views/ProjectHealthView.vue'),
        },
        {
          path: 'autopilot',
          name: 'autopilot',
          component: () => import('@/views/AutopilotView.vue'),
        },
        {
          path: 'suggestions',
          name: 'postprocess-suggestions',
          component: () => import('@/views/PostChapterAnalysisView.vue'),
        },
        {
          path: 'context-snapshots',
          name: 'context-snapshots',
          component: () => import('@/views/AIContextSnapshotsView.vue'),
        },
        {
          path: 'knowledge',
          name: 'knowledge',
          component: () => import('@/views/KnowledgeBaseView.vue'),
        },
        {
          path: 'versions',
          name: 'versions',
          component: () => import('@/views/VersionHistoryView.vue'),
        },
        {
          path: 'quality',
          name: 'quality',
          component: () => import('@/views/QualityReviewView.vue'),
        },
        {
          path: 'settings',
          name: 'project-settings',
          component: () => import('@/views/ProjectSettingsView.vue'),
        },
        {
          path: 'weekly-report',
          name: 'weekly-report',
          component: () => import('@/views/AuthoringWeeklyReportView.vue'),
        },
      ],
    },
    {
      path: '/persona',
      name: 'persona-library',
      component: () => import('@/views/PersonaLibraryView.vue'),
    },
    {
      path: '/persona/training-set/:id',
      name: 'training-set-detail',
      component: () => import('@/views/TrainingSetDetailView.vue'),
    },
    {
      path: '/persona/work/:workId',
      name: 'reference-work-detail',
      component: () => import('@/views/ReferenceWorkDetailView.vue'),
    },
    {
      path: '/persona/:id',
      name: 'persona-detail',
      component: () => import('@/views/PersonaDetailView.vue'),
    },
    {
      path: '/debug',
      name: 'debug',
      component: () => import('@/features/devtools/components/DataViewerPage.vue'),
    },
    {
      path: '/health',
      name: 'health',
      component: () => import('@/views/HealthCheck.vue'),
    },
    {
      path: '/design-system',
      name: 'design-system',
      component: () => import('@/views/DesignSystemPreview.vue'),
    },
  ],
})

export default router
