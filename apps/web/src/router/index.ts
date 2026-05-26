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
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'bible' } }),
        },
        {
          path: 'characters',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'character' } }),
        },
        {
          path: 'outline',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'outline' } }),
        },
        {
          path: 'write',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query } }),
        },
        {
          path: 'relationships',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'relationship' } }),
        },
        {
          path: 'conflicts',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'conflict' } }),
        },
        {
          path: 'foreshadowing',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'foreshadowing' } }),
        },
        {
          path: 'health',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'health' } }),
        },
        {
          path: 'autopilot',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query, tab: 'health' } }),
        },
        {
          path: 'writing-job',
          redirect: to => ({ path: `/project/${to.params.id}`, query: { ...to.query } }),
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
