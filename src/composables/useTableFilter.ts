import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

interface FilterOptions {
  searchFields?: string[]
  debounceMs?: number
}

export function useTableFilter<T extends Record<string, any>>(
  items: Ref<T[]> | ComputedRef<T[]>,
  options: FilterOptions = {},
) {
  const searchFields = options.searchFields ?? ['name']
  const debounceMs = options.debounceMs ?? 300

  const query = ref('')
  const debouncedQuery = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(query, (v) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { debouncedQuery.value = v }, debounceMs)
  })

  const filters = ref<Record<string, any>>({})

  function setFilter(key: string, value: any) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
      const next = { ...filters.value }
      delete next[key]
      filters.value = next
    } else {
      filters.value = { ...filters.value, [key]: value }
    }
  }

  function clearFilters() {
    query.value = ''
    debouncedQuery.value = ''
    filters.value = {}
  }

  const filtered = computed(() => {
    let list = items.value ?? []
    const q = debouncedQuery.value.trim().toLowerCase()
    if (q) {
      list = list.filter((item) =>
        searchFields.some((f) => String(item[f] ?? '').toLowerCase().includes(q)),
      )
    }
    for (const [key, val] of Object.entries(filters.value)) {
      if (typeof val === 'function') {
        list = list.filter(val)
      } else if (Array.isArray(val)) {
        list = list.filter((item) => val.includes(item[key]))
      } else {
        list = list.filter((item) => String(item[key]) === String(val))
      }
    }
    return list
  })

  return { query, debouncedQuery, filters, filtered, setFilter, clearFilters }
}
