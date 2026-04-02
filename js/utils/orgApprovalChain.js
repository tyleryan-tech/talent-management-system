/**
 * 组织调整逐级审批链：自事发部门向上收集部门负责人，最后为产品线负责人。
 */
(function (TM) {
  function dedupeIds(arr) {
    const seen = new Set();
    const out = [];
    (arr || []).forEach((id) => {
      if (id == null || id === '') return;
      const n = Number(id);
      if (Number.isNaN(n)) return;
      if (seen.has(n)) return;
      seen.add(n);
      out.push(n);
    });
    return out;
  }

  /** 从 startDeptId 起沿 parent 链向上，依次收集各部门 managerId（先近后远） */
  function managersPathUpwards(departments, startDeptId) {
    const ids = [];
    const seen = new Set();
    let cur = (departments || []).find((d) => d.id === startDeptId);
    while (cur) {
      if (cur.managerId != null) {
        const m = Number(cur.managerId);
        if (!Number.isNaN(m) && !seen.has(m)) {
          seen.add(m);
          ids.push(m);
        }
      }
      cur = cur.parentId != null ? (departments || []).find((d) => d.id === cur.parentId) : null;
    }
    return ids;
  }

  function ownerId(store) {
    const o = store.orgSettings?.productLineOwnerEmployeeId;
    if (o == null || o === '') return null;
    const n = Number(o);
    return Number.isNaN(n) ? null : n;
  }

  /** 中间审批人去重后，产品线负责人固定排在最后一位且只出现一次 */
  function finalizeChain(bodyIds, own) {
    const ownN = own != null && !Number.isNaN(Number(own)) ? Number(own) : null;
    const body = dedupeIds((bodyIds || []).filter((id) => ownN == null || Number(id) !== ownN));
    if (ownN != null) body.push(ownN);
    return body;
  }

  /**
   * @param {object} store Pinia data store
   * @param {string} type dept_create|dept_delete|dept_update|position_create|position_delete|position_update
   * @param {object} payload 与各 apply 分支一致
   */
  TM.buildOrgApprovalChain = function buildOrgApprovalChain(store, type, payload) {
    const departments = store.departments || [];
    const own = ownerId(store);
    let body = [];

    if (type === 'dept_create') {
      const pid = payload.parentId;
      if (pid == null) body = [];
      else body = managersPathUpwards(departments, pid);
    } else if (type === 'dept_delete') {
      body = managersPathUpwards(departments, payload.id);
    } else if (type === 'dept_update') {
      body = managersPathUpwards(departments, payload.id);
      if (payload.patch && payload.patch.parentId !== undefined) {
        const oldP = payload.prevParentId;
        const newP = payload.patch.parentId;
        if (oldP != null) {
          managersPathUpwards(departments, oldP).forEach((id) => {
            if (!body.includes(id)) body.push(id);
          });
        }
        if (newP != null) {
          managersPathUpwards(departments, newP).forEach((id) => {
            if (!body.includes(id)) body.push(id);
          });
        }
      }
    } else if (type === 'position_create') {
      body = managersPathUpwards(departments, Number(payload.departmentId));
    } else if (type === 'position_delete') {
      const p = (store.positions || []).find((x) => x.id === payload.id);
      if (p) body = managersPathUpwards(departments, Number(p.departmentId));
    } else if (type === 'position_update') {
      const p = (store.positions || []).find((x) => x.id === payload.id);
      if (p) {
        const depOld = Number(p.departmentId);
        const depNew = payload.patch?.departmentId != null ? Number(payload.patch.departmentId) : depOld;
        body = managersPathUpwards(departments, depOld);
        if (depNew !== depOld) {
          managersPathUpwards(departments, depNew).forEach((id) => {
            if (!body.includes(id)) body.push(id);
          });
        }
      }
    }

    return finalizeChain(body, own);
  };
})(window.TM);
