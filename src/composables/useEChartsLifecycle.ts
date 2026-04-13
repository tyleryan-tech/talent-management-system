import { ref, onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue'

interface EChartsOptions {
  render: (echarts: any, container: HTMLElement) => any
  trigger?: Ref<any>
}

export function useEChartsLifecycle(options: EChartsOptions) {
  const containerRef = ref<HTMLElement | null>(null)
  let chartInstance: any = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function dispose() {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  }

  function redraw() {
    if (!containerRef.value) return
    dispose()
    const echarts = (window as any).echarts
    if (!echarts) return
    chartInstance = options.render(echarts, containerRef.value)
  }

  function debouncedResize() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      chartInstance?.resize?.()
    }, 200)
  }

  onMounted(() => {
    window.addEventListener('resize', debouncedResize)
    nextTick(redraw)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', debouncedResize)
    if (debounceTimer) clearTimeout(debounceTimer)
    dispose()
  })

  if (options.trigger) {
    watch(options.trigger, () => nextTick(redraw))
  }

  return { containerRef, getChart: () => chartInstance, redraw }
}
