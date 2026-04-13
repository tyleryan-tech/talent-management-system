/**
 * 通用表格排序 Composable (M-1)
 */
(function () {
  const { ref, computed } = Vue;

  /**
   * @param {import('vue').ComputedRef<Array>} items - 已筛选的数据列表
   * @returns {{ sortKey, sortOrder, sorted, toggleSort }}
   */
  function useTableSort(items) {
    const sortKey = ref('');
    const sortOrder = ref('asc');

    function toggleSort(key) {
      if (sortKey.value === key) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey.value = key;
        sortOrder.value = 'asc';
      }
    }

    const sorted = computed(() => {
      const list = [...(items.value || [])];
      if (!sortKey.value) return list;

      const key = sortKey.value;
      const dir = sortOrder.value === 'asc' ? 1 : -1;

      list.sort((a, b) => {
        let va = a[key];
        let vb = b[key];

        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        if (typeof va === 'number' && typeof vb === 'number') {
          return (va - vb) * dir;
        }

        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return 0;
      });

      return list;
    });

    return { sortKey, sortOrder, sorted, toggleSort };
  }

  window.TM = window.TM || {};
  window.TM.useTableSort = useTableSort;
})();
