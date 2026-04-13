/**
 * ECharts 生命周期管理 Composable (M-1)
 * 统一处理 ECharts 实例创建、resize、销毁，防止内存泄漏
 */
(function () {
  const { ref, onMounted, onUnmounted, nextTick, watch } = Vue;

  /**
   * @param {Object} options
   * @param {Function} options.render - 接收 (echarts, container) => chartInstance，在 mounted 后调用
   * @param {import('vue').Ref} [options.trigger] - 当此 ref 变化时重新渲染
   * @returns {{ containerRef, chartInstance, redraw }}
   */
  function useEChartsLifecycle(options = {}) {
    const containerRef = ref(null);
    let chartInstance = null;
    let resizeHandler = null;
    let _debounceTimer = null;

    function dispose() {
      if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
      }
    }

    function redraw() {
      if (!containerRef.value) return;
      dispose();
      if (typeof options.render === 'function') {
        const echarts = window.echarts;
        if (!echarts) return;
        chartInstance = options.render(echarts, containerRef.value);
      }
    }

    function debouncedResize() {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        if (chartInstance && !chartInstance.isDisposed?.()) {
          chartInstance.resize();
        }
      }, 200);
    }

    onMounted(() => {
      resizeHandler = debouncedResize;
      window.addEventListener('resize', resizeHandler);
      nextTick(redraw);
    });

    onUnmounted(() => {
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      if (_debounceTimer) clearTimeout(_debounceTimer);
      dispose();
    });

    if (options.trigger) {
      watch(options.trigger, () => nextTick(redraw));
    }

    return { containerRef, getChart: () => chartInstance, redraw };
  }

  window.TM = window.TM || {};
  window.TM.useEChartsLifecycle = useEChartsLifecycle;
})();
