/**
 * 考勤域 Store：考勤规则、考勤记录、打卡记录、请假
 * 由 dataStore 组合调用，不直接暴露给视图层
 */
(function () {
  window.TM = window.TM || {};
  window.TM._domains = window.TM._domains || {};

  window.TM._domains.attendance = {
    stateKeys: [
      'attendanceRules', 'attendanceRecords', 'punchRecords', 'leaveRequests',
    ],
    defaultState() {
      return {
        attendanceRules: {},
        attendanceRecords: [],
        punchRecords: [],
        leaveRequests: [],
      };
    },
  };
})();
