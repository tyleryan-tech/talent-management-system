(function (w) {
  'use strict';
  w.TM = w.TM || {};

  w.TM.THRESHOLDS = {
    ATTENDANCE_HOURS: {
      DEEP_RED:    9.5,
      LIGHT_RED:   10,
      NEUTRAL_MAX: 10.5,
      LIGHT_GREEN: 11,
    },

    FLIGHT_RISK: {
      TENURE_MIN_YEARS: 3,
      TENURE_MAX_YEARS: 5,
      RANK_STALE_YEARS: 2,
      HIGH_SCORE: 2,
      MEDIUM_SCORE: 1,
    },

    TOAST_DURATION_MS: 4200,
    PERSIST_DEBOUNCE_MS: 500,
  };
})(window);
