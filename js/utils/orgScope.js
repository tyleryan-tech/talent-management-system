/**
 * 组织范围：选定部门及其全部子部门
 */
(function (w) {
  w.TM = w.TM || {};

  /**
   * @param {number|null|undefined} rootDeptId  null/0 → 产品线（全部部门）
   * @param {Array<{id:number,parentId?:number|null}>} departments
   * @returns {Set<number>|null} null 表示不限制；否则为范围内部门 id 集合
   */
  w.TM.deptIdsInOrgScope = function deptIdsInOrgScope(rootDeptId, departments) {
    const rid = rootDeptId == null || rootDeptId === '' ? null : Number(rootDeptId);
    if (rid === null || Number.isNaN(rid) || rid === 0) return null;
    const deps = departments || [];
    if (!deps.some((d) => Number(d.id) === rid)) return new Set();
    const byParent = new Map();
    deps.forEach((d) => {
      const pid = d.parentId == null ? '__root__' : Number(d.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(d);
    });
    const out = new Set();
    const walk = (id) => {
      out.add(Number(id));
      (byParent.get(Number(id)) || []).forEach((c) => walk(c.id));
    };
    walk(rid);
    return out;
  };

  w.TM.flatDepartmentsForSelect = function flatDepartmentsForSelect(departments) {
    const list = departments || [];
    const byParent = (pid) => list
      .filter((d) => (pid == null ? d.parentId == null : Number(d.parentId) === Number(pid)))
      .sort((a, b) => String(a.name).localeCompare(b.name, 'zh-Hans-CN'));
    const out = [];
    const walk = (pid, depth) => {
      byParent(pid).forEach((d) => {
        const prefix = depth ? `${'　'.repeat(depth)}└ ` : '';
        out.push({ id: d.id, label: prefix + d.name });
        walk(d.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  };

  /**
   * Pinia data 门店 + hrScope 门店，生成各页共用的计算属性与方法
   */
  w.TM.createOrgScopeBindings = function createOrgScopeBindings(dataStore, hrScopeStore) {
    const { computed } = w.Vue;
    const scopeDeptIds = computed(() =>
      w.TM.deptIdsInOrgScope(hrScopeStore.scopeRootDepartmentId, dataStore.departments),
    );
    const scopeRootDeptUi = computed({
      get() {
        return hrScopeStore.scopeRootDepartmentId == null ? 0 : Number(hrScopeStore.scopeRootDepartmentId);
      },
      set(v) {
        const n = v === 0 || v === '0' || v == null || v === '' ? null : Number(v);
        hrScopeStore.setScopeRootDepartmentId(Number.isNaN(n) ? null : n);
      },
    });
    const deptScopeOptions = computed(() => w.TM.flatDepartmentsForSelect(dataStore.departments));
    const scopeHint = computed(() => {
      if (hrScopeStore.scopeRootDepartmentId == null) {
        return '当前为产品线；以下列表、统计与操作均针对全部部门。';
      }
      const d = dataStore.departments.find((x) => x.id === hrScopeStore.scopeRootDepartmentId);
      const nm = d?.name || '所选部门';
      return `含「${nm}」及其下属子部门内的员工；配置类数据（如考勤规则）仍为产品线共用。`;
    });
    function employeeInScope(emp) {
      const set = scopeDeptIds.value;
      if (set == null) return true;
      return set.has(Number(emp.departmentId));
    }
    function positionDeptInScope(positionId) {
      const set = scopeDeptIds.value;
      if (set == null) return true;
      const p = dataStore.positions.find((x) => x.id === positionId);
      return p && set.has(Number(p.departmentId));
    }
    return {
      scopeDeptIds,
      scopeRootDeptUi,
      deptScopeOptions,
      scopeHint,
      employeeInScope,
      positionDeptInScope,
    };
  };
})(window);
