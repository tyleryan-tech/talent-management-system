/**
 * Vite 入口 — 渐进式迁移
 *
 * 当前阶段：仅作为 Vite 开发服务器入口，演示 SFC + TypeScript 工作。
 * 生产环境仍使用 index.html + IIFE 脚本。
 * 后续迁移路线：逐步将 js/views/*.js → src/views/*.vue
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

app.config.errorHandler = (err, _vm, info) => {
  console.error('[Vue Error]', err, info)
}

app.mount('#app')
