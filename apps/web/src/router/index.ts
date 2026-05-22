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
          path: 'bible',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'characters',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'outline',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'write',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'relationships',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'conflicts',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'foreshadowing',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'health',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'autopilot',
          redirect: to => `/project/${to.params.id}`,
        },
        {
          path: 'writing-job',
          redirect: to => `/project/${to.params.id}`,
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
