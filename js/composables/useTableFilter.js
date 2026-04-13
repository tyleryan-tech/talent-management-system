/**
 * 通用表格筛选 Composable (M-1)
 * 可复用于 Roster、Recruitment Pipeline、Performance 等任何表格视图
 */
(function () {
  const { ref, computed, watch } = Vue;

  /**
   * @param {import('vue').Ref<Array>} items - 原始数据列表
   * @param {Object} options
   * @param {Array<string>} options.searchFields - 搜索匹配的字段名
   * @param {number} [options.debounceMs=300] - 搜索防抖时间
   * @returns {{ query, debouncedQuery, filters, filtered, setFilter, clearFilters }}
   */
  function useTableFilter(items, options = {}) {
    const searchFields = options.searchFields || ['name'];
    const debounceMs = options.debounceMs ?? 300;

    const query = ref('');
    const debouncedQuery = ref('');
    let _timer = null;
    watch(query, (v) => {
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(() => { debouncedQuery.value = v; }, debounceMs);
    });

    const filters = ref({});

    function setFilter(key, value) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
        const next = { ...filters.value };
        delete next[key];
        filters.value = next;
      } else {
        filters.value = { ...filters.value, [key]: value };
      }
    }

    function clearFilters() {
      query.value = '';
      debouncedQuery.value = '';
      filters.value = {};
    }

    const filtered = computed(() => {
      let list = items.value || [];

      const q = String(debouncedQuery.value || '').trim().toLowerCase();
      if (q) {
        list = list.filter((item) =>
          searchFields.some((f) => String(item[f] || '').toLowerCase().includes(q)),
        );
      }

      const activeFilters = Object.entries(filters.value);
      for (const [key, val] of activeFilters) {
        if (typeof val === 'function') {
          list = list.filter(val);
        } else if (Array.isArray(val)) {
          list = list.filter((item) => val.includes(item[key]));
        } else {
          list = list.filter((item) => String(item[key]) === String(val));
        }
      }

      return list;
    });

    return { query, debouncedQuery, filters, filtered, setFilter, clearFilters };
  }

  window.TM = window.TM || {};
  window.TM.useTableFilter = useTableFilter;
})();
