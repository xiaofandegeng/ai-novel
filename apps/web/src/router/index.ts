import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'projects',
      component: () => import('@/views/project-list-view.vue'),
    },
    {
      path: '/project/:id',
      component: () => import('@/views/project-shell-view.vue'),
      children: [
        {
          path: '',
          name: 'project-home',
          component: () => import('@/views/project-home-view.vue'),
        },
        {
          path: 'bible',
          name: 'story-bible',
          component: () => import('@/views/story-bible-view.vue'),
        },
        {
          path: 'characters',
          name: 'characters',
          component: () => import('@/views/characters-view.vue'),
        },
        {
          path: 'outline',
          name: 'outline',
          component: () => import('@/views/outline-view.vue'),
        },
        {
          path: 'write',
          name: 'write',
          component: () => import('@/views/writing-view.vue'),
        },
        {
          path: 'relationships',
          name: 'relationships',
          component: () => import('@/views/relationships-view.vue'),
        },
        {
          path: 'conflicts',
          name: 'conflicts',
          component: () => import('@/views/conflict-matrix-view.vue'),
        },
        {
          path: 'foreshadowing',
          name: 'foreshadowing',
          component: () => import('@/views/foreshadowing-ledger-view.vue'),
        },
        {
          path: 'health',
          name: 'project-health',
          component: () => import('@/views/project-health-view.vue'),
        },
        {
          path: 'autopilot',
          name: 'autopilot',
          component: () => import('@/views/autopilot-view.vue'),
        },
        {
          path: 'writing-job',
          redirect: to => `/project/${to.params.id}/autopilot`,
        },
        {
          path: 'system/writing-job-debug',
          name: 'writing-job-debug',
          component: () => import('@/views/writing-job-view.vue'),
        },
        {
          path: 'suggestions',
          name: 'postprocess-suggestions',
          component: () => import('@/views/post-chapter-analysis-view.vue'),
        },
        {
          path: 'context-snapshots',
          name: 'context-snapshots',
          component: () => import('@/views/ai-context-snapshots-view.vue'),
        },
        {
          path: 'knowledge',
          name: 'knowledge',
          component: () => import('@/views/knowledge-base-view.vue'),
        },
        {
          path: 'versions',
          name: 'versions',
          component: () => import('@/views/version-history-view.vue'),
        },
        {
          path: 'quality',
          name: 'quality',
          component: () => import('@/views/quality-review-view.vue'),
        },
        {
          path: 'settings',
          name: 'project-settings',
          component: () => import('@/views/project-settings-view.vue'),
        },
        {
          path: 'weekly-report',
          name: 'weekly-report',
          component: () => import('@/views/authoring-weekly-report-view.vue'),
        },
      ],
    },
    {
      path: '/persona',
      name: 'persona-library',
      component: () => import('@/views/persona-library-view.vue'),
    },
    {
      path: '/persona/training-set/:id',
      name: 'training-set-detail',
      component: () => import('@/views/training-set-detail-view.vue'),
    },
    {
      path: '/persona/work/:workId',
      name: 'reference-work-detail',
      component: () => import('@/views/reference-work-detail-view.vue'),
    },
    {
      path: '/persona/:id',
      name: 'persona-detail',
      component: () => import('@/views/persona-detail-view.vue'),
    },
    {
      path: '/debug',
      name: 'debug',
      component: () => import('@/features/devtools/components/data-viewer-page.vue'),
    },
    {
      path: '/health',
      name: 'health',
      component: () => import('@/views/health-check.vue'),
    },
    {
      path: '/design-system',
      name: 'design-system',
      component: () => import('@/views/design-system-preview.vue'),
    },
  ],
})

export default router
