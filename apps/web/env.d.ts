/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  // Vue's generic SFC shim requires the component data slot to remain open.
  const component: DefineComponent<object, object, any>
  export default component
}
