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
      name: 'project-home',
      component: () => import('@/views/ProjectHomeView.vue'),
    },
    {
      path: '/project/:id/bible',
      name: 'story-bible',
      component: () => import('@/views/StoryBibleView.vue'),
    },
    {
      path: '/project/:id/characters',
      name: 'characters',
      component: () => import('@/views/CharactersView.vue'),
    },
    {
      path: '/project/:id/outline',
      name: 'outline',
      component: () => import('@/views/OutlineView.vue'),
    },
    {
      path: '/project/:id/write',
      name: 'write',
      component: () => import('@/views/WritingView.vue'),
    },
    {
      path: '/project/:id/relationships',
      name: 'relationships',
      component: () => import('@/views/RelationshipsView.vue'),
    },
    {
      path: '/project/:id/conflicts',
      name: 'conflicts',
      component: () => import('@/views/ConflictMatrixView.vue'),
    },
    {
      path: '/project/:id/foreshadowing',
      name: 'foreshadowing',
      component: () => import('@/views/ForeshadowingLedgerView.vue'),
    },
    {
      path: '/project/:id/health',
      name: 'project-health',
      component: () => import('@/views/ProjectHealthView.vue'),
    },
    {
      path: '/project/:id/autopilot',
      name: 'writing-job',
      component: () => import('@/views/WritingJobView.vue'),
    },
    {
      path: '/project/:id/knowledge',
      name: 'knowledge',
      component: () => import('@/views/KnowledgeBaseView.vue'),
    },
    {
      path: '/project/:id/versions',
      name: 'versions',
      component: () => import('@/views/VersionHistoryView.vue'),
    },
    {
      path: '/project/:id/quality',
      name: 'quality',
      component: () => import('@/views/QualityReviewView.vue'),
    },
    {
      path: '/project/:id/settings',
      name: 'project-settings',
      component: () => import('@/views/ProjectSettingsView.vue'),
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
      component: () => import('@/views/DataViewer.vue'),
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
