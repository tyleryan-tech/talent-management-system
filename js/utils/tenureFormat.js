/**
 * 司龄 / 同职级停留 / 参加工作年限：展示为「X.X年」；缺入职日或职级起始日时按工号等规则生成演示用日期。
 */
(function () {
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function ymdToday() {
    const n = new Date();
    return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
  }

  function parseYmd(ymd) {
    const s = String(ymd || '').slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addMonthsYmd(ymd, delta) {
    const d = parseYmd(ymd);
    if (!d) return String(ymd || '').slice(0, 10);
    d.setMonth(d.getMonth() + delta);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /** 无入职日时：相对「今天」回推若干月，且一般不早于「生日+22 年」 */
  function syntheticHireDate(employeeId, birthday) {
    const id = Math.abs(Number(employeeId)) || 1;
    const today = ymdToday();
    let h = addMonthsYmd(today, -(id % 120));
    const b = String(birthday || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      const minCareer = addMonthsYmd(b, 22 * 12);
      if (h < minCareer) h = minCareer;
    }
    return h;
  }

  /** 无现任职级起始日时：入职后 0～47 个月内的模拟晋升日，且不晚于今天 */
  function syntheticLevelStartYmd(hireYmd, employeeId) {
    const id = Math.abs(Number(employeeId)) || 1;
    let lvl = addMonthsYmd(hireYmd, id % 48);
    const today = ymdToday();
    if (lvl > today) lvl = addMonthsYmd(today, -((id % 36) + 1));
    if (lvl < hireYmd) lvl = hireYmd;
    return lvl;
  }

  function effectiveHireYmd(e) {
    const h = e.hireDate && String(e.hireDate).trim().slice(0, 10);
    if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) return h;
    return syntheticHireDate(e.id, e.birthday);
  }

  /** 无「参加工作日期」时：按生日顺延约 22 年视为本科毕业后从业起点（演示推算） */
  function syntheticCareerStartFromBirthday(birthday) {
    const b = String(birthday || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
    return addMonthsYmd(b, 22 * 12);
  }

  /**
   * 参加工作起点日：优先档案「参加工作日期」；否则生日+22 年；再否则与有效入职日一致（演示兜底）。
   */
  function effectiveCareerStartYmd(e) {
    const c = e.careerStartDate && String(e.careerStartDate).trim().slice(0, 10);
    if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return c;
    const fromBirth = syntheticCareerStartFromBirthday(e.birthday);
    if (fromBirth) return fromBirth;
    return effectiveHireYmd(e);
  }

  function effectiveLevelStartYmd(e) {
    const h = effectiveHireYmd(e);
    const l = e.levelStartDate && String(e.levelStartDate).trim().slice(0, 10);
    if (l && /^\d{4}-\d{2}-\d{2}$/.test(l)) return l;
    return syntheticLevelStartYmd(h, e.id);
  }

  function yearsDecimalBetween(fromYmd, toYmd) {
    const a = parseYmd(fromYmd);
    if (!a) return null;
    const b = toYmd ? parseYmd(toYmd) : parseYmd(ymdToday());
    if (!b) return null;
    let ms = b.getTime() - a.getTime();
    if (ms < 0) ms = 0;
    const y = ms / (365.25 * 86400000);
    return Math.round(y * 10) / 10;
  }

  function formatDecimalYearsBetween(fromYmd, toYmd) {
    const y = yearsDecimalBetween(fromYmd, toYmd);
    if (y == null) return '—';
    return `${y.toFixed(1)} yr`;
  }

  function companyTenureLabel(e) {
    return formatDecimalYearsBetween(effectiveHireYmd(e));
  }

  function levelTenureLabel(e) {
    return formatDecimalYearsBetween(effectiveLevelStartYmd(e));
  }

  /** 司龄（年，数值），供分布图分桶等使用 */
  function companyTenureYears(e) {
    return yearsDecimalBetween(effectiveHireYmd(e), ymdToday()) ?? 0;
  }

  /** 毕业后工作年限（年，数值）：自参加工作起点日至今，非本司司龄 */
  function workExperienceYears(e) {
    return yearsDecimalBetween(effectiveCareerStartYmd(e), ymdToday()) ?? 0;
  }

  function workExperienceLabel(e) {
    return formatDecimalYearsBetween(effectiveCareerStartYmd(e));
  }

  window.TM.tenureFormat = {
    ymdToday,
    effectiveHireYmd,
    effectiveCareerStartYmd,
    effectiveLevelStartYmd,
    syntheticHireDate,
    syntheticLevelStartYmd,
    companyTenureLabel,
    levelTenureLabel,
    companyTenureYears,
    workExperienceYears,
    workExperienceLabel,
    formatDecimalYearsBetween,
  };
})();
