/**
 * Chart visibility preferences & custom chart configs.
 * Per-user (keyed by email/username), persisted in localStorage.
 * Usage: TM.chartPrefs.reload(email) after login, then TM.chartPrefs.isVisible(id).
 */
(function (w) {
  const TM = w.TM || (w.TM = {});
  const { reactive } = Vue;

  const PREFIX = 'tm_chart_prefs_';

  const ALL_CHARTS = [
    { id: 'dash-dept',      label: 'Headcount by department', section: 'Dashboard' },
    { id: 'dash-status',    label: 'Employee status',          section: 'Dashboard' },
    { id: 'anl-trade-hc',  label: '各工种在岗人数',            section: 'Analytics' },
    { id: 'anl-level-hc',  label: '各职级在岗人数',            section: 'Analytics' },
    { id: 'anl-avg-tenure',label: '平均工作年限',               section: 'Analytics' },
    { id: 'anl-work-exp',  label: 'Work experience',           section: 'Analytics' },
    { id: 'anl-dev-qa',    label: 'Dev : QA ratio',            section: 'Analytics' },
    { id: 'anl-hire-year', label: 'Hire year distribution',    section: 'Analytics' },
    { id: 'anl-trend',     label: 'Hires & exits',             section: 'Analytics' },
  ];

  const GROUP_BY_OPTIONS = [
    { value: 'rank',        label: 'Rank / Level' },
    { value: 'team',        label: 'Team / Department' },
    { value: 'status',      label: 'Employment status' },
    { value: 'gender',      label: 'Gender' },
    { value: 'jobFunction', label: 'Job Function' },
    { value: 'potential',   label: 'Potential (9-box)' },
    { value: 'payPosition', label: 'Pay position band' },
  ];

  const CHART_TYPES = [
    { value: 'bar',   label: 'Bar' },
    { value: 'pie',   label: 'Pie' },
    { value: 'donut', label: 'Donut' },
  ];

  const _s = reactive({ uid: '', hidden: [], customCharts: [] });

  function _key(uid) { return `${PREFIX}${uid || 'default'}`; }
  function _load(uid) {
    try { const r = JSON.parse(w.localStorage.getItem(_key(uid))); return r || {}; } catch { return {}; }
  }
  function _save() {
    try {
      w.localStorage.setItem(_key(_s.uid), JSON.stringify({
        version: 1, hidden: _s.hidden, customCharts: _s.customCharts,
      }));
    } catch { /* storage full or private mode */ }
  }

  TM.chartPrefs = {
    ALL_CHARTS,
    GROUP_BY_OPTIONS,
    CHART_TYPES,

    get hidden() { return _s.hidden; },
    get customCharts() { return _s.customCharts; },

    /** Call after login / session restore with the current user's email or username. */
    reload(userId) {
      _s.uid = String(userId || 'default');
      const d = _load(_s.uid);
      _s.hidden = Array.isArray(d.hidden) ? d.hidden : [];
      _s.customCharts = Array.isArray(d.customCharts) ? d.customCharts : [];
    },

    isVisible(id) { return !_s.hidden.includes(id); },

    toggleVisibility(id) {
      _s.hidden = _s.hidden.includes(id)
        ? _s.hidden.filter((x) => x !== id)
        : [..._s.hidden, id];
      _save();
    },

    /** Add a user-defined chart; config: { title, groupBy, chartType, scope } */
    addCustomChart(config) {
      _s.customCharts = [..._s.customCharts, { id: `cc_${Date.now()}`, ...config }];
      _save();
    },

    removeCustomChart(id) {
      _s.customCharts = _s.customCharts.filter((c) => c.id !== id);
      _save();
    },

    resetDefaults() {
      _s.hidden = [];
      _s.customCharts = [];
      _save();
      w.dispatchEvent(new CustomEvent('tm-toast', {
        detail: { message: 'Chart layout reset to defaults', type: 'success' },
      }));
    },
  };
})(window);
