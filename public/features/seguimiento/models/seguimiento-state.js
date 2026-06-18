import { getRcmTotalWeeks, getRcmWeekInfo } from '../../../core/rcm/index.js';

const SEGUIMIENTO_SCOPE_STORAGE_KEY = 'seguimientoScope';

export function createSeguimientoState() {
  return {
    reports: [],
    scope: loadSeguimientoScope(),
    accessScope: null,
    cellFilter: '',
    detail: null,
  };
}

export function canUserViewAllCells(user) {
  return !!(user && user.isAdmin);
}

export function getUserScopeTabs(user) {
  const tabs = [];
  if (!user) return tabs;
  const myCell = String(user.assignedCellNumber || '').trim();
  const mySector = String(user.supervisedSector || '').trim();
  if (myCell) tabs.push({ key: 'cell', label: 'Mi celula' });
  if (mySector) tabs.push({ key: 'sector', label: 'Mi sector' });
  if (canUserViewAllCells(user)) tabs.push({ key: 'all', label: 'Todas las celulas' });
  return tabs;
}

export function getPreferredAccessScope(user, tabs = getUserScopeTabs(user)) {
  const availableScopes = new Set((tabs || []).map((tab) => tab.key));
  if (availableScopes.has('all')) return 'all';
  if (availableScopes.has('sector')) return 'sector';
  if (availableScopes.has('cell')) return 'cell';
  return null;
}

export function loadSeguimientoScope() {
  try {
    const storedValue = localStorage.getItem(SEGUIMIENTO_SCOPE_STORAGE_KEY);
    return storedValue === 'all' ? 'all' : 'current';
  } catch {
    return 'current';
  }
}

export function saveSeguimientoScope(value) {
  const nextValue = value === 'all' ? 'all' : 'current';
  try {
    localStorage.setItem(SEGUIMIENTO_SCOPE_STORAGE_KEY, nextValue);
  } catch {
    // ignore storage failures in local preview mode
  }
  return nextValue;
}

function getReportDate(report) {
  return String(report?.reportDate || report?.formData?.reportDate || '').trim();
}

function getReportCellNumber(report) {
  return String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
}

function getReportWeek(report) {
  return parseInt(String(report?.week || report?.formData?.week || ''), 10) || 0;
}

function isDraftReport(report) {
  return report?.formData?._draft === true || report?.formData?._draft === 'true';
}

function getCurrentQuarterMeta(referenceDate = new Date()) {
  const year = String(referenceDate.getFullYear());
  const month = referenceDate.getMonth();
  return {
    year,
    quarter: month <= 3 ? '1' : month <= 7 ? '2' : '3',
  };
}

function getCurrentQuarterBounds(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startMonth = month <= 3 ? 0 : month <= 7 ? 4 : 8;
  return {
    year,
    startMonth,
    endMonth: startMonth + 3,
  };
}

function isCurrentQuarterReport(report, cycleStartDate) {
  const reportDate = getReportDate(report);
  if (!reportDate) return false;

  if (cycleStartDate) {
    return reportDate >= cycleStartDate;
  }

  const { year, startMonth, endMonth } = getCurrentQuarterBounds();
  const reportYear = Number(reportDate.slice(0, 4));
  const reportMonth = Number(reportDate.slice(5, 7)) - 1;
  return reportYear === year && reportMonth >= startMonth && reportMonth <= endMonth;
}

function canAccessCell(currentUser, cellNumber) {
  if (!cellNumber) return false;
  if (currentUser?.isAdmin) return true;
  if (String(currentUser?.assignedCellNumber || '') === cellNumber) return true;
  if (currentUser?.isSupervisor) return true;
  return false;
}

function getReportSector(report) {
  return String(report?.sector || report?.formData?.sector || '').trim();
}

function matchesAccessScope(report, currentUser, accessScope) {
  const activeScope = accessScope || getPreferredAccessScope(currentUser);
  const reportCellNumber = getReportCellNumber(report);
  const myCell = String(currentUser?.assignedCellNumber || '').trim();
  const mySector = String(currentUser?.supervisedSector || '').trim();

  if (activeScope === 'cell') return reportCellNumber && reportCellNumber === myCell;
  if (activeScope === 'sector') return getReportSector(report) && getReportSector(report) === mySector;
  if (activeScope === 'all') return canUserViewAllCells(currentUser);
  return canAccessCell(currentUser, reportCellNumber);
}

function matchesCellAccessScope(cell, currentUser, accessScope) {
  const activeScope = accessScope || getPreferredAccessScope(currentUser);
  const cellNumber = String(cell?.cellNumber || '').trim();
  const cellSector = String(cell?.sector || '').trim();
  const myCell = String(currentUser?.assignedCellNumber || '').trim();
  const mySector = String(currentUser?.supervisedSector || '').trim();

  if (activeScope === 'cell') return cellNumber && cellNumber === myCell;
  if (activeScope === 'sector') return cellSector && cellSector === mySector;
  if (activeScope === 'all') return canUserViewAllCells(currentUser);
  return canAccessCell(currentUser, cellNumber);
}

function getVisibleCatalogCells(catalogs, currentUser, accessScope) {
  const cells = Array.isArray(catalogs?.cells) ? catalogs.cells : [];
  return cells.filter((cell) => matchesCellAccessScope(cell, currentUser, accessScope));
}

function getCellLeaderName(catalogs, cell) {
  if (!cell) return '';
  const people = Array.isArray(catalogs?.people) ? catalogs.people : [];
  const leader = people.find((person) => String(person.id || '') === String(cell.leaderPersonId || ''));
  return String(leader?.name || '').trim();
}

function getQuarterWeekNumber(settings, dateValue = '') {
  const sourceDate = String(dateValue || '').trim() ? new Date(`${dateValue}T12:00:00`) : new Date();
  if (Number.isNaN(sourceDate.getTime())) return 1;

  const cycleStartStr = settings?.cycle_start_date;
  if (cycleStartStr && /^\d{4}-\d{2}-\d{2}$/.test(cycleStartStr)) {
    const cycleStart = new Date(`${cycleStartStr}T00:00:00`);
    if (!Number.isNaN(cycleStart.getTime())) {
      const ref = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
      ref.setHours(0, 0, 0, 0);
      cycleStart.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((ref - cycleStart) / 86400000);
      if (diffDays < 0) return 1;

      const weekStartDay = (settings?.week_start_day !== undefined && settings?.week_start_day !== '')
        ? parseInt(settings.week_start_day, 10)
        : cycleStart.getDay();

      const startDow = cycleStart.getDay();
      let daysToFirst = (weekStartDay - startDow + 7) % 7;
      if (daysToFirst === 0) daysToFirst = 7;

      if (diffDays < daysToFirst) return 1;
      return Math.max(1, Math.min(getRcmTotalWeeks(), Math.floor((diffDays - daysToFirst) / 7) + 2));
    }
  }

  const month = sourceDate.getMonth();
  const quarterStartMonth = month <= 3 ? 0 : month <= 7 ? 4 : 8;
  const quarterStart = new Date(sourceDate.getFullYear(), quarterStartMonth, 1);
  quarterStart.setHours(0, 0, 0, 0);
  const current = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current - quarterStart) / 86400000);
  return Math.max(1, Math.min(getRcmTotalWeeks(), Math.floor(diffDays / 7) + 1));
}

function getCurrentWeekNumber(settings) {
  const graceHours = parseInt(settings?.report_grace_hours ?? '0', 10) || 0;
  if (graceHours > 0) {
    const now = new Date();
    const weekStartDay = parseInt(settings?.week_start_day ?? '0', 10);
    const rollover = new Date(now);
    rollover.setHours(0, 0, 0, 0);
    const diff = (rollover.getDay() - weekStartDay + 7) % 7;
    rollover.setDate(rollover.getDate() - diff);
    const hoursElapsed = (now.getTime() - rollover.getTime()) / 3600000;
    if (hoursElapsed < graceHours) {
      const refDay = new Date(rollover);
      refDay.setDate(refDay.getDate() - 1);
      const year = refDay.getFullYear();
      const month = String(refDay.getMonth() + 1).padStart(2, '0');
      const day = String(refDay.getDate()).padStart(2, '0');
      return Math.max(1, getQuarterWeekNumber(settings, `${year}-${month}-${day}`));
    }
  }
  return getQuarterWeekNumber(settings);
}

export function selectSeguimientoCards(state, currentUser, settings) {
  const visibleCells = getVisibleCatalogCells(state.catalogs, currentUser, state.accessScope);
  const visibleCellsByNumber = new Map(visibleCells.map((cell) => [String(cell.cellNumber || '').trim(), cell]));
  const visibleReports = state.reports.filter((report) => {
    const cellNumber = getReportCellNumber(report);
    if (!canAccessCell(currentUser, cellNumber)) return false;
    if (!matchesAccessScope(report, currentUser, state.accessScope)) return false;
    if (state.scope === 'all') return true;
    return isCurrentQuarterReport(report, settings?.cycle_start_date || '');
  });

  const groups = new Map();
  visibleReports.forEach((report) => {
    const cellNumber = getReportCellNumber(report);
    const reportDate = getReportDate(report);
    const year = reportDate.slice(0, 4) || '?';
    const month = Number(reportDate.slice(5, 7));
    const quarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
    const cell = visibleCellsByNumber.get(cellNumber) || null;
    const groupKey = `${cellNumber}::${year}::${quarter}`;
    const existing = groups.get(groupKey) || {
      key: groupKey,
      cellNumber,
      year,
      quarter,
      sector: String(cell?.sector || '').trim(),
      leaderName: getCellLeaderName(state.catalogs, cell),
      reports: [],
      weeks: new Set(),
      latestReportDate: '',
    };
    existing.reports.push(report);
    const week = getReportWeek(report);
    if (week > 0) existing.weeks.add(week);
    if (!existing.latestReportDate || reportDate > existing.latestReportDate) {
      existing.latestReportDate = reportDate;
    }
    groups.set(groupKey, existing);
  });

  if (state.scope !== 'all') {
    const currentQuarter = getCurrentQuarterMeta();
    visibleCells.forEach((cell) => {
      const cellNumber = String(cell?.cellNumber || '').trim();
      if (!cellNumber) return;
      const groupKey = `${cellNumber}::${currentQuarter.year}::${currentQuarter.quarter}`;
      if (groups.has(groupKey)) return;
      groups.set(groupKey, {
        key: groupKey,
        cellNumber,
        year: currentQuarter.year,
        quarter: currentQuarter.quarter,
        sector: String(cell?.sector || '').trim(),
        leaderName: getCellLeaderName(state.catalogs, cell),
        reports: [],
        weeks: new Set(),
        latestReportDate: '',
      });
    });
  }

  const currentWeek = getCurrentWeekNumber(settings);

  return [...groups.values()]
    .map((entry) => {
      const completedWeeks = [...entry.weeks].sort((left, right) => left - right);
      const weekLookup = new Map();
      entry.reports.forEach((report) => {
        const week = getReportWeek(report);
        if (week > 0 && !weekLookup.has(week)) {
          weekLookup.set(week, report);
        }
      });

      const weekChips = Array.from({ length: getRcmTotalWeeks() }, (_value, index) => {
        const weekNumber = index + 1;
        const info = getRcmWeekInfo(weekNumber);
        const report = weekLookup.get(weekNumber) || null;
        const canCapture = Boolean(currentUser?.isAdmin || String(currentUser?.assignedCellNumber || '') === String(entry.cellNumber));
        const isCapturable = !report && canCapture && weekNumber === currentWeek;
        return {
          week: weekNumber,
          verb: info?.verb || '',
          phase: String(info?.phase || 'GANAR').toLowerCase(),
          phaseLabel: info?.phaseLabel || 'Ganar',
          isEventWeek: Boolean(info?.isEventWeek),
          reportDate: getReportDate(report),
          reportId: report?.id ? String(report.id) : '',
          state: report ? (isDraftReport(report) ? 'draft' : 'done') : isCapturable ? 'capturable' : 'pending',
        };
      });

      return {
        ...entry,
        totalReports: entry.reports.length,
        completedWeeks,
        completedWeeksCount: completedWeeks.length,
        progressPercent: Math.round((completedWeeks.length / getRcmTotalWeeks()) * 100),
        weekChips,
        latestReport: entry.reports.slice().sort((left, right) => String(getReportDate(right)).localeCompare(String(getReportDate(left))))[0] || null,
      };
    })
    .filter((entry) => !state.cellFilter || entry.cellNumber === state.cellFilter)
    .sort((left, right) => {
      const cellDiff = Number(left.cellNumber || 0) - Number(right.cellNumber || 0);
      if (cellDiff !== 0) return cellDiff;
      const yearDiff = String(right.year).localeCompare(String(left.year));
      if (yearDiff !== 0) return yearDiff;
      return String(right.quarter).localeCompare(String(left.quarter));
    });
}

export function selectSeguimientoSummary(cards) {
  const latestReportDate = cards.reduce((latest, card) => {
    if (!card.latestReportDate) return latest;
    return !latest || card.latestReportDate > latest ? card.latestReportDate : latest;
  }, '');

  return {
    cardsCount: cards.length,
    totalReports: cards.reduce((total, card) => total + card.totalReports, 0),
    avgProgress: cards.length
      ? Math.round(cards.reduce((total, card) => total + card.progressPercent, 0) / cards.length)
      : 0,
    latestReportDate,
  };
}

export function formatSeguimientoDate(value) {
  if (!value) return 'Sin fecha';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-');
    return `${day}/${month}/${year}`;
  }
  return String(value);
}

export function formatQuarterLabel(quarter, year) {
  const label = quarter === '1' ? 'Ene-Abr' : quarter === '2' ? 'May-Ago' : 'Sep-Dic';
  return `Q${quarter} ${year} · ${label}`;
}

export function selectSeguimientoCellOptions(cards) {
  return [...new Set(cards.map((card) => card.cellNumber).filter(Boolean))]
    .sort((left, right) => Number(left) - Number(right));
}

export function buildSeguimientoDetail(card, report = null) {
  if (!card) return null;
  const sourceReport = report || card.latestReport || null;
  const formData = sourceReport?.formData || {};
  const visitors = Array.isArray(formData.visitors) ? formData.visitors.length : 0;
  const members = Array.isArray(formData.memberAttendance) ? formData.memberAttendance.length : 0;

  return {
    cardKey: card.key,
    cellNumber: card.cellNumber,
    quarter: card.quarter,
    year: card.year,
    reportId: sourceReport?.id ? String(sourceReport.id) : '',
    reportDate: getReportDate(sourceReport),
    week: sourceReport ? getReportWeek(sourceReport) : '',
    notes: String(sourceReport?.notes || formData.notes || '').trim(),
    leaderName: String(sourceReport?.leaderName || formData.leaderName || card?.leaderName || '').trim(),
    members,
    visitors,
  };
}