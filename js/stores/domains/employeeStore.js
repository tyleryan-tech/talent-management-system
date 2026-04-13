/**
 * 员工域 Store：员工、部门、岗位、组织设置、组织变更
 * 由 dataStore 组合调用，不直接暴露给视图层
 */
(function () {
  window.TM = window.TM || {};
  window.TM._domains = window.TM._domains || {};

  window.TM._domains.employee = {
    stateKeys: [
      'employees', 'departments', 'positions',
      'orgSettings', 'orgChangeRequests', 'rosterColumnSettings',
    ],
    defaultState() {
      return {
        employees: [],
        departments: [],
        positions: [],
        orgSettings: { productLineOwnerEmployeeId: null },
        orgChangeRequests: [],
        rosterColumnSettings: null,
      };
    },
  };
})();
