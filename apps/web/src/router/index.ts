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
          component: () => import('@/views/automation-cockpit-view.vue'),
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
