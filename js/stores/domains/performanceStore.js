/**
 * 绩效域 Store：绩效评估、绩效周期、KPI、人才矩阵、继任计划
 * 由 dataStore 组合调用，不直接暴露给视图层
 */
(function () {
  window.TM = window.TM || {};
  window.TM._domains = window.TM._domains || {};

  window.TM._domains.performance = {
    stateKeys: [
      'performanceReviews', 'performanceCycles', 'kpiLibrary',
      'talentMatrix', 'successionPlans',
    ],
    defaultState() {
      return {
        performanceReviews: [],
        performanceCycles: [],
        kpiLibrary: [],
        talentMatrix: [],
        successionPlans: [],
      };
    },
  };
})();
