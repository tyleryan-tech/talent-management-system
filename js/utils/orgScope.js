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
  /**
   * Collect all employee IDs in the management subtree (excluding rootId itself).
   */
  w.TM.collectSubtreeIds = function collectSubtreeIds(employees, rootManagerId) {
    const rid = Number(rootManagerId);
    if (!rid || Number.isNaN(rid)) return new Set();
    const ids = new Set();
    const q = [rid];
    while (q.length) {
      const mid = q.shift();
      (employees || []).forEach(function (e) {
        const eid = Number(e.id);
        if (Number(e.managerId) === mid && !ids.has(eid)) {
          ids.add(eid);
          q.push(eid);
        }
      });
    }
    return ids;
  };

  /**
   * Composable: zone-aware data scoping.
   * In manager zone → auto-restrict to reporting subtree.
   * In HRBP zone → returns everything (no restriction).
   */
  w.TM.useZoneScope = function useZoneScope(dataStore) {
    var _Vue = w.Vue, computed = _Vue.computed;
    var route = VueRouter.useRoute();
    var auth = w.TM.useAuthStore();

    var isManagerZone = computed(function () { return route.path.startsWith('/manager'); });

    var teamEmpIds = computed(function () {
      if (!isManagerZone.value) return null;
      var myId = auth.currentUser ? auth.currentUser.employeeId : null;
      if (!myId) return new Set();
      return w.TM.collectSubtreeIds(dataStore.employees, myId);
    });

    var scopedEmployees = computed(function () {
      var set = teamEmpIds.value;
      if (!set) return dataStore.employees;
      return dataStore.employees.filter(function (e) { return set.has(Number(e.id)); });
    });

    var scopedActiveEmployees = computed(function () {
      return scopedEmployees.value.filter(function (e) { return e.status !== 'leave'; });
    });

    function employeeInTeam(emp) {
      var set = teamEmpIds.value;
      if (!set) return true;
      return set.has(Number(emp.id));
    }

    var teamDeptIds = computed(function () {
      var set = teamEmpIds.value;
      if (!set) return null;
      var ids = new Set();
      scopedActiveEmployees.value.forEach(function (e) {
        ids.add(Number(e.departmentId));
      });
      return ids;
    });

    var scopedDepartments = computed(function () {
      var d = teamDeptIds.value;
      if (!d) return dataStore.departments;
      return dataStore.departments.filter(function (dept) { return d.has(Number(dept.id)); });
    });

    return {
      isManagerZone: isManagerZone,
      teamEmpIds: teamEmpIds,
      scopedEmployees: scopedEmployees,
      scopedActiveEmployees: scopedActiveEmployees,
      employeeInTeam: employeeInTeam,
      teamDeptIds: teamDeptIds,
      scopedDepartments: scopedDepartments,
    };
  };
})(window);
