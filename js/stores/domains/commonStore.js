/**
 * 通用域 Store：培训、通知、用户
 * 由 dataStore 组合调用，不直接暴露给视图层
 */
(function () {
  window.TM = window.TM || {};
  window.TM._domains = window.TM._domains || {};

  window.TM._domains.common = {
    stateKeys: [
      'trainings', 'employeeTrainings', 'users', 'notifications',
    ],
    defaultState() {
      return {
        trainings: [],
        employeeTrainings: [],
        users: [],
        notifications: [],
      };
    },
  };
})();
