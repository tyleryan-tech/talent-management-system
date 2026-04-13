/**
 * 通用分页 Composable (M-1)
 */
(function () {
  const { ref, computed, watch } = Vue;

  /**
   * @param {import('vue').ComputedRef<Array>} items - 完整列表
   * @param {Object} [options]
   * @param {number} [options.defaultPageSize=50]
   * @returns {{ page, pageSize, totalPages, paginated, goToPage, nextPage, prevPage }}
   */
  function usePagination(items, options = {}) {
    const pageSize = ref(options.defaultPageSize || 50);
    const page = ref(1);

    watch(() => items.value?.length, () => {
      if (page.value > Math.ceil((items.value?.length || 0) / pageSize.value)) {
        page.value = 1;
      }
    });

    const totalPages = computed(() => Math.max(1, Math.ceil((items.value?.length || 0) / pageSize.value)));

    const paginated = computed(() => {
      const start = (page.value - 1) * pageSize.value;
      return (items.value || []).slice(start, start + pageSize.value);
    });

    function goToPage(n) {
      page.value = Math.max(1, Math.min(n, totalPages.value));
    }

    function nextPage() {
      goToPage(page.value + 1);
    }

    function prevPage() {
      goToPage(page.value - 1);
    }

    return { page, pageSize, totalPages, paginated, goToPage, nextPage, prevPage };
  }

  window.TM = window.TM || {};
  window.TM.usePagination = usePagination;
})();
