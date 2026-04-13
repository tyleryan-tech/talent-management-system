/**
 * 招聘域 Store：招聘标记、候选人、Pipeline、面试官池、招聘指标
 * 由 dataStore 组合调用，不直接暴露给视图层
 */
(function () {
  window.TM = window.TM || {};
  window.TM._domains = window.TM._domains || {};

  window.TM._domains.recruitment = {
    stateKeys: [
      'positionRecruitTags', 'recruitmentCandidates',
      'recruitmentPositionMetrics', 'recruitmentPipeline', 'interviewerPool',
    ],
    defaultState() {
      return {
        positionRecruitTags: {},
        recruitmentCandidates: [],
        recruitmentPositionMetrics: {},
        recruitmentPipeline: [],
        interviewerPool: [],
      };
    },
  };
})();
