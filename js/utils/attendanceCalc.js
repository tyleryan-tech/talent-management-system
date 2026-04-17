/**
 * Shared attendance calculation utilities.
 * Used by Attendance, Roster, and Talent modules.
 *
 * API:
 *   TM.attendance.parsePunchTime(str)       → minutes since midnight
 *   TM.attendance.dailyHours(punches)       → { firstIn, lastOut, hours }
 *   TM.attendance.periodMonths(type, ref?)  → string[] of 'YYYY-MM'
 *   TM.attendance.empAvgHours(records, eid, months) → number|null
 *   TM.attendance.empAvgFromPunches(punches, eid, months) → number|null
 *   TM.attendance.recomputeRecords(punches, employees) → attendanceRecords[]
 */
(function (w) {
  w.TM = w.TM || {};

  function parsePunchTime(str) {
    const s = String(str || '').trim();
    let m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})\s+(\d{1,2}):(\d{2})/);
    if (m) return Number(m[4]) * 60 + Number(m[5]);
    return NaN;
  }

  function dailyHoursFromPunches(punches) {
    if (!punches || !punches.length) return null;
    const mins = punches.map((p) => parsePunchTime(p.time)).filter((m) => !Number.isNaN(m));
    if (mins.length < 2) return null;
    const first = Math.min(...mins);
    const last = Math.max(...mins);
    const hours = Math.round(((last - first) / 60) * 10) / 10;
    return hours > 0 && hours <= 24 ? hours : null;
  }

  /**
   * Get list of YYYY-MM strings for a given period type,
   * always ending at the last complete month before today.
   */
  function periodMonths(type, refDate) {
    const now = refDate || new Date();
    const cutY = now.getFullYear();
    const cutM = now.getMonth(); // 0-based; this IS the previous month in 1-based
    let endYear, endMonth;
    if (cutM === 0) {
      endYear = cutY - 1; endMonth = 12;
    } else {
      endYear = cutY; endMonth = cutM;
    }
    const endYm = `${endYear}-${String(endMonth).padStart(2, '0')}`;

    if (type === 'month') return [endYm];

    if (type === '3month') {
      const months = [];
      let y = endYear, m = endMonth;
      for (let i = 0; i < 3; i++) {
        months.unshift(`${y}-${String(m).padStart(2, '0')}`);
        m--;
        if (m < 1) { m = 12; y--; }
      }
      return months;
    }

    if (type === '6month') {
      const months = [];
      let y = endYear, m = endMonth;
      for (let i = 0; i < 6; i++) {
        months.unshift(`${y}-${String(m).padStart(2, '0')}`);
        m--;
        if (m < 1) { m = 12; y--; }
      }
      return months;
    }

    return [endYm];
  }

  /**
   * Compute average daily work hours for one employee over given months.
   * Accepts either a flat array or a pre-built Map<employeeId, records[]> (from dataStore._attIdx).
   */
  function empAvgHours(attendanceRecordsOrIdx, employeeId, months) {
    const eid = Number(employeeId);
    let recs;
    if (attendanceRecordsOrIdx instanceof Map) {
      recs = attendanceRecordsOrIdx.get(eid) || [];
    } else {
      recs = (attendanceRecordsOrIdx || []).filter((x) => Number(x.employeeId) === eid);
    }
    let totalHours = 0, totalDays = 0;
    months.forEach((ym) => {
      const r = recs.find((x) => x.month === ym);
      if (!r || r.avgDailyHours == null || Number.isNaN(Number(r.avgDailyHours))) return;
      const days = Number(r.workDays) || 0;
      if (days <= 0) return;
      totalHours += Number(r.avgDailyHours) * days;
      totalDays += days;
    });
    if (totalDays === 0) return null;
    return Math.round((totalHours / totalDays) * 10) / 10;
  }

  /**
   * Compute average daily work hours for one employee directly from raw punch records.
   * months: array of 'YYYY-MM'
   * Returns: average of all daily hours within those months.
   */
  function empAvgFromPunches(punchRecords, employeeId, months) {
    const eid = Number(employeeId);
    const ymSet = new Set(months);
    const byDate = {};
    punchRecords.forEach((p) => {
      if (Number(p.employeeId) !== eid) return;
      const d = String(p.date || '').trim();
      if (!d || d.length < 7) return;
      if (!ymSet.has(d.slice(0, 7))) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(p);
    });
    const dailyVals = [];
    Object.values(byDate).forEach((punches) => {
      const h = dailyHoursFromPunches(punches);
      if (h != null) dailyVals.push(h);
    });
    if (!dailyVals.length) return null;
    return Math.round((dailyVals.reduce((a, b) => a + b, 0) / dailyVals.length) * 10) / 10;
  }

  /**
   * Recompute attendanceRecords from raw punchRecords.
   * Groups by employee + month, computing avgDailyHours and workDays.
   */
  function recomputeRecords(punchRecords) {
    const byEmpMonth = {};
    (punchRecords || []).forEach((p) => {
      const eid = Number(p.employeeId);
      const d = String(p.date || '').trim();
      if (!d || d.length < 7 || Number.isNaN(eid)) return;
      const ym = d.slice(0, 7);
      const key = `${eid}||${ym}`;
      if (!byEmpMonth[key]) byEmpMonth[key] = { eid, ym, byDate: {} };
      if (!byEmpMonth[key].byDate[d]) byEmpMonth[key].byDate[d] = [];
      byEmpMonth[key].byDate[d].push(p);
    });

    const records = [];
    let rid = 1;
    Object.values(byEmpMonth).forEach(({ eid, ym, byDate }) => {
      const dailyVals = [];
      Object.values(byDate).forEach((punches) => {
        const h = dailyHoursFromPunches(punches);
        if (h != null) dailyVals.push(h);
      });
      if (!dailyVals.length) return;
      const avg = Math.round((dailyVals.reduce((a, b) => a + b, 0) / dailyVals.length) * 10) / 10;
      records.push({
        id: rid++,
        employeeId: eid,
        month: ym,
        avgDailyHours: avg,
        workDays: dailyVals.length,
      });
    });
    return records;
  }

  /**
   * 5-tier color class for hours value:
   *   <9.5  → deep red    (hours-t1)
   *   9.5–10 → light red  (hours-t2)
   *   10–10.5 → neutral   (no class)
   *   10.5–11 → light green (hours-t4)
   *   >=11   → deep green (hours-t5)
   */
  function hoursClass(val) {
    if (val == null) return '';
    const v = Number(val);
    if (Number.isNaN(v)) return '';
    const T = (w.TM.THRESHOLDS && w.TM.THRESHOLDS.ATTENDANCE_HOURS) || { DEEP_RED: 9.5, LIGHT_RED: 10, NEUTRAL_MAX: 10.5, LIGHT_GREEN: 11 };
    if (v < T.DEEP_RED) return 'hours-t1';
    if (v < T.LIGHT_RED) return 'hours-t2';
    if (v < T.NEUTRAL_MAX) return '';
    if (v < T.LIGHT_GREEN) return 'hours-t4';
    return 'hours-t5';
  }

  w.TM.attendance = {
    parsePunchTime,
    dailyHoursFromPunches,
    periodMonths,
    empAvgHours,
    empAvgFromPunches,
    recomputeRecords,
    hoursClass,
  };
})(window);
