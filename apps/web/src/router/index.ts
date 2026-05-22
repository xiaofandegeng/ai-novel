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
          redirect: to => `/project/${to.params.id}/write?mode=autopilot`,
        },
        {
          path: 'writing-job',
          redirect: to => `/project/${to.params.id}/write?mode=autopilot`,
        },
        {
          path: 'settings',
          name: 'project-settings',
          component: () => import('@/views/project-settings-view.vue'),
        },
      ],
    },
  ],
})

export default router
