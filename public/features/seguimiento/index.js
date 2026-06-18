import { attachSeguimientoController } from './controllers/seguimiento.controller.js';
import { request } from '../../core/api/index.js';
import { getRcmWeekInfo } from '../../core/rcm/index.js';
import { fetchCatalogs } from '../catalogos/data/catalogos.repository.js';
import { getCellMembers } from '../catalogos/models/catalogs-state.js';
import { fetchSeguimientoReport, fetchSeguimientoReports, fetchFriendTracking } from './data/seguimiento.repository.js';

// ── Helpers portados del legacy (normalización de visitantes / proceso) ──────

function normalizeVisitorKind(value) {
  return String(value || '').toLowerCase() === 'visita' ? 'visita' : 'amigo';
}

function normalizeVisitorName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVisitorProcessEntry(value, kind = 'amigo', fallback = {}) {
  if (normalizeVisitorKind(kind) !== 'amigo') return 'none';
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'none' || raw === 'noted' || raw === 'late') return raw;
  if (fallback?.lateRegistration) return 'late';
  return 'none';
}

function normalizeVisitors(savedVisitors = []) {
  if (!Array.isArray(savedVisitors)) return [];
  return savedVisitors.map((visitor) => {
    const kind = normalizeVisitorKind(visitor?.kind);
    const processEntry = normalizeVisitorProcessEntry(visitor?.processEntry, kind, {
      lateRegistration: Boolean(visitor?.lateRegistration),
    });
    return {
      name: visitor?.name || '',
      kind,
      invitedBy: visitor?.invitedBy || '',
      reachAttended: Boolean(visitor?.reachAttended),
      lateRegistration: kind === 'amigo' ? processEntry === 'late' : false,
      sundayAttended: Boolean(visitor?.sundayAttended),
      processEntry,
      eventAttended: Boolean(visitor?.eventAttended),
      converted: kind === 'visita' ? false : Boolean(visitor?.converted),
    };
  });
}

function formatTrackingDateLabel(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatTrackingRangeLabel(start, end) {
  const startLabel = formatTrackingDateLabel(start);
  const endLabel = formatTrackingDateLabel(end);
  if (!startLabel && !endLabel) return 'Sin fechas';
  if (!endLabel || startLabel === endLabel) return startLabel || endLabel;
  return `${startLabel} — ${endLabel}`;
}

function buildProcessControlEntries(scopedReports = [], friends = []) {
  const friendsByName = new Map(
    (Array.isArray(friends) ? friends : []).map((friend) => [normalizeVisitorName(friend.name), friend]),
  );
  const processMap = new Map();

  scopedReports.forEach((report) => {
    const cellNumber = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
    const sector = String(report?.sector || report?.formData?.sector || '').trim();
    const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
    const weekNumber = parseInt(String(report?.week || report?.formData?.week || '0'), 10) || 0;
    const weekMeta = getRcmWeekInfo(weekNumber);

    normalizeVisitors(report?.formData?.visitors).forEach((visitor) => {
      if (normalizeVisitorKind(visitor.kind) !== 'amigo') return;
      const normalizedName = normalizeVisitorName(visitor.name);
      if (!normalizedName) return;
      const key = `${cellNumber}::${normalizedName}`;
      const previous = processMap.get(key) || {
        key, name: String(visitor.name || '').trim(), cellNumber, sector,
        invitedBy: '', noted: false, lateEntry: false, notedWeek: 0, notedDate: '',
        levantate: false, levantateWeek: 0, levantateDate: '',
        restauracion: false, restauracionWeek: 0, restauracionDate: '',
        currentWeek: 0, firstReportDate: '', lastReportDate: '',
        totalReports: 0, reachCount: 0, sundayCount: 0,
      };

      const processEntry = normalizeVisitorProcessEntry(visitor.processEntry, visitor.kind, {
        lateRegistration: Boolean(visitor.lateRegistration),
      });
      previous.name = previous.name || String(visitor.name || '').trim();
      previous.cellNumber = previous.cellNumber || cellNumber;
      previous.sector = previous.sector || sector;
      previous.invitedBy = String(visitor.invitedBy || previous.invitedBy || '').trim();
      previous.noted = previous.noted || processEntry === 'noted' || processEntry === 'late';
      previous.lateEntry = previous.lateEntry || processEntry === 'late';
      if ((processEntry === 'noted' || processEntry === 'late') && (!previous.notedWeek || (weekNumber && weekNumber < previous.notedWeek))) {
        previous.notedWeek = weekNumber;
        previous.notedDate = reportDate;
      }
      previous.currentWeek = Math.max(previous.currentWeek || 0, weekNumber || 0);
      previous.totalReports += 1;
      if (visitor.reachAttended) previous.reachCount += 1;
      if (visitor.sundayAttended) previous.sundayCount += 1;
      if (weekMeta?.rcmKey === 'levantate' && visitor.eventAttended) {
        previous.levantate = true;
        if (!previous.levantateWeek || (weekNumber && weekNumber < previous.levantateWeek)) {
          previous.levantateWeek = weekNumber;
          previous.levantateDate = reportDate;
        }
      }
      if (weekMeta?.rcmKey === 'restauracion' && visitor.eventAttended) {
        previous.restauracion = true;
        if (!previous.restauracionWeek || (weekNumber && weekNumber < previous.restauracionWeek)) {
          previous.restauracionWeek = weekNumber;
          previous.restauracionDate = reportDate;
        }
      }
      if (!previous.firstReportDate || (reportDate && reportDate < previous.firstReportDate)) previous.firstReportDate = reportDate;
      if (!previous.lastReportDate || (reportDate && reportDate >= previous.lastReportDate)) previous.lastReportDate = reportDate;
      processMap.set(key, previous);
    });
  });

  return [...processMap.values()]
    .map((entry) => {
      const backendFriend = friendsByName.get(normalizeVisitorName(entry.name));
      const cycleClosed = Boolean(backendFriend?.completed) || (entry.currentWeek || 0) >= 16;
      const outsideCohort = !entry.noted && (entry.levantate || entry.restauracion || cycleClosed);
      const complete = entry.noted && entry.levantate && entry.restauracion && cycleClosed;
      const pendingSteps = [];
      if (!entry.noted) pendingSteps.push('Anotar');
      if (!entry.levantate) pendingSteps.push('Levántate');
      if (!entry.restauracion) pendingSteps.push('Restauración');
      if (!cycleClosed) pendingSteps.push('Cierre semana 16');
      let statusKey = 'pending';
      let statusLabel = 'Pendiente';
      let statusDetail = pendingSteps.length ? `Pendiente: ${pendingSteps.join(', ')}` : 'Sin pendientes detectados.';
      if (complete) { statusKey = 'complete'; statusLabel = 'Trayecto completo'; }
      else if (outsideCohort) { statusKey = 'outside'; statusLabel = 'Sin cohorte inicial'; }
      else if (entry.noted && (entry.levantate || entry.restauracion || cycleClosed)) {
        statusKey = 'progress';
        statusLabel = cycleClosed ? 'Cierre parcial' : 'En seguimiento';
      }
      if (complete) {
        statusDetail = 'Cohorte anotada y hitos principales cubiertos dentro del ciclo.';
      } else if (outsideCohort) {
        statusDetail = 'Aparece en hitos del proceso, pero no viene de la cohorte anotada.';
      } else if (entry.noted && (entry.levantate || entry.restauracion || cycleClosed)) {
        statusDetail = cycleClosed
          ? `Cerró ciclo, pero le faltó: ${pendingSteps.filter((step) => step !== 'Cierre semana 16').join(', ') || 'revisión manual'}`
          : `Avance detectado; falta: ${pendingSteps.join(', ')}`;
      }
      return {
        ...entry,
        processCount: Number(backendFriend?.processCount || 0),
        backendOutcome: String(backendFriend?.outcome || ''),
        backendStatus: String(backendFriend?.status || ''),
        cycleClosed,
        outsideCohort,
        complete,
        pendingSteps,
        statusKey,
        statusLabel,
        statusDetail,
      };
    })
    .filter((entry) => entry.noted || entry.levantate || entry.restauracion || entry.cycleClosed)
    .sort((left, right) => {
      const w = { complete: 4, progress: 3, outside: 2, pending: 1 };
      const diff = (w[right.statusKey] || 0) - (w[left.statusKey] || 0);
      if (diff !== 0) return diff;
      return String(right.lastReportDate || '').localeCompare(String(left.lastReportDate || ''));
    });
}
import {
  buildSeguimientoDetail,
  createSeguimientoState,
  getPreferredAccessScope,
  saveSeguimientoScope,
  selectSeguimientoCellOptions,
  selectSeguimientoCards,
  selectSeguimientoSummary,
} from './models/seguimiento-state.js';
import { renderSeguimientoShell } from './views/seguimiento-shell.js';

const SEGUIMIENTO_SHOW_OFFERING_STORAGE_KEY = 'segTotals.showOffering';

async function fetchSeguimientoApprovals(deps = {}) {
  const requestFn = deps.requestFn || request;
  try {
    const payload = await requestFn('/api/approvals');
    return Array.isArray(payload?.approvals) ? payload.approvals : [];
  } catch {
    return [];
  }
}

async function saveSeguimientoApproval(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  const result = await requestFn('/api/approvals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result?.approval || null;
}

function findApproval(approvals, sector, week, year, quarter) {
  return (Array.isArray(approvals) ? approvals : []).find((entry) => (
    String(entry?.sector || '') === String(sector || '')
    && String(entry?.week || '') === String(week || '')
    && String(entry?.year || '') === String(year || '')
    && String(entry?.quarter || '') === String(quarter || '')
  )) || null;
}

function canUserViewAllCells(user) {
  return Boolean(user?.isAdmin);
}

function canSeeSeguimientoTab(user) {
  return Boolean(user?.assignedCellNumber || user?.isAdmin || user?.isSupervisor);
}

function canSeeSupervisorTab(user) {
  return Boolean(user?.isAdmin || user?.isSupervisor);
}

function getSeguimientoTabs(user) {
  return [
    canSeeSeguimientoTab(user) ? { key: 'seguimiento', label: 'Seguimiento' } : null,
    canSeeSupervisorTab(user) ? { key: 'supervisor', label: 'Consolidado semanal' } : null,
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'goals', label: 'Metas' },
  ].filter(Boolean);
}

function getDefaultSeguimientoTab(user) {
  return canSeeSeguimientoTab(user) ? 'seguimiento' : 'dashboard';
}

function buildScopeTabs(user) {
  const tabs = [];
  const myCell = String(user?.assignedCellNumber || '').trim();
  const mySector = String(user?.supervisedSector || '').trim();
  if (myCell) tabs.push({ key: 'cell', label: 'Mi célula', sublabel: `Célula ${myCell}` });
  if (mySector) tabs.push({ key: 'sector', label: 'Mi sector', sublabel: `Sector ${mySector}` });
  if (canUserViewAllCells(user)) tabs.push({ key: 'all', label: 'Todas las células', sublabel: 'todos los sectores' });
  return tabs;
}

function getVisibleSupervisors(catalogs, currentUser) {
  const supervisors = (Array.isArray(catalogs?.people) ? catalogs.people : [])
    .filter((person) => String(person?.supervisorSector || '').trim())
    .map((person) => ({
      name: String(person?.name || '').trim(),
      sector: String(person?.supervisorSector || '').trim(),
    }))
    .filter((entry) => entry.name && entry.sector);
  if (currentUser?.isAdmin) return supervisors;
  if (currentUser?.isSupervisor && currentUser?.supervisedSector) {
    return supervisors.filter((entry) => entry.sector === String(currentUser.supervisedSector || '').trim());
  }
  return [];
}

function getCellsForSupervisor(catalogs, supervisor) {
  if (!supervisor) return [];
  return (Array.isArray(catalogs?.cells) ? catalogs.cells : [])
    .filter((cell) => String(cell?.sector || '').trim() === String(supervisor?.sector || '').trim())
    .sort((left, right) => Number(left?.cellNumber || 0) - Number(right?.cellNumber || 0));
}

function loadShowOffering() {
  try {
    return localStorage.getItem(SEGUIMIENTO_SHOW_OFFERING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveShowOffering(value) {
  const nextValue = Boolean(value);
  try {
    localStorage.setItem(SEGUIMIENTO_SHOW_OFFERING_STORAGE_KEY, nextValue ? '1' : '0');
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

function getReportSector(report) {
  return String(report?.sector || report?.formData?.sector || '').trim();
}

function isDraftReport(report) {
  return report?.formData?._draft === true || report?.formData?._draft === 'true';
}

function matchesAccessScope(cellOrReport, currentUser, accessScope, isCell = false) {
  const activeScope = accessScope || 'cell';
  const cellNumber = isCell ? String(cellOrReport?.cellNumber || '').trim() : getReportCellNumber(cellOrReport);
  const sector = isCell ? String(cellOrReport?.sector || '').trim() : getReportSector(cellOrReport);
  const myCell = String(currentUser?.assignedCellNumber || '').trim();
  const mySector = String(currentUser?.supervisedSector || '').trim();
  if (activeScope === 'cell') return cellNumber && cellNumber === myCell;
  if (activeScope === 'sector') return sector && sector === mySector;
  if (activeScope === 'all') return canUserViewAllCells(currentUser);
  return false;
}

function getScopedCells(catalogs, currentUser, accessScope) {
  return (Array.isArray(catalogs?.cells) ? catalogs.cells : [])
    .filter((cell) => matchesAccessScope(cell, currentUser, accessScope, true))
    .sort((left, right) => Number(left?.cellNumber || 0) - Number(right?.cellNumber || 0));
}

function getCurrentQuarter(settings, referenceDate = new Date()) {
  const source = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const year = String(source.getFullYear());
  const month = source.getMonth();
  return {
    year,
    quarter: month <= 3 ? '1' : month <= 7 ? '2' : '3',
    cycleStartDate: String(settings?.cycle_start_date || '').trim(),
  };
}

function isCurrentQuarterReport(report, settings) {
  const reportDate = getReportDate(report);
  if (!reportDate) return false;
  const cycleStartDate = String(settings?.cycle_start_date || '').trim();
  if (cycleStartDate) return reportDate >= cycleStartDate;
  const month = Number(reportDate.slice(5, 7));
  const quarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
  const currentQuarter = getCurrentQuarter(settings);
  return reportDate.slice(0, 4) === currentQuarter.year && quarter === currentQuarter.quarter;
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
      return Math.max(1, Math.min(16, Math.floor((diffDays - daysToFirst) / 7) + 2));
    }
  }

  const month = sourceDate.getMonth();
  const quarterStartMonth = month <= 3 ? 0 : month <= 7 ? 4 : 8;
  const quarterStart = new Date(sourceDate.getFullYear(), quarterStartMonth, 1);
  quarterStart.setHours(0, 0, 0, 0);
  const current = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate());
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current - quarterStart) / 86400000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
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

function getScopedReports(state) {
  return state.reports.filter((report) => {
    if (!matchesAccessScope(report, state.currentUser, state.accessScope, false)) return false;
    if (state.scope === 'all') return true;
    return isCurrentQuarterReport(report, state.settings);
  });
}

function getWeekContext(state) {
  // Match the legacy Seguimiento rule: the context strip uses the real
  // configured week, not the grace-adjusted capture week.
  const baseWeek = getQuarterWeekNumber(state.settings);
  const weekOffset = baseWeek <= 1 ? 0 : (state.weekOffset === 0 ? 0 : -1);
  const effectiveWeek = Math.max(1, Math.min(16, baseWeek + weekOffset));
  const quarter = getCurrentQuarter(state.settings);
  const weeklyReports = getScopedReports(state)
    .filter((report) => {
      const reportDate = getReportDate(report);
      const month = Number(reportDate.slice(5, 7));
      const reportQuarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
      return getReportWeek(report) === effectiveWeek && reportDate.slice(0, 4) === quarter.year && reportQuarter === quarter.quarter;
    })
    .sort((left, right) => Number(getReportCellNumber(left)) - Number(getReportCellNumber(right)));

  const reportedCells = new Set(weeklyReports.map((report) => getReportCellNumber(report)));
  const pendingCells = getScopedCells(state.catalogs, state.currentUser, state.accessScope)
    .filter((cell) => !reportedCells.has(String(cell?.cellNumber || '').trim()));
  const activeScope = state.scopeTabs.find((tab) => tab.key === state.accessScope) || null;

  return {
    baseWeek,
    effectiveWeek,
    weekOffset,
    showWeekOffsetTabs: baseWeek > 1,
    currentVerb: getRcmWeekInfo(baseWeek)?.verb || `Semana ${baseWeek}`,
    previousVerb: getRcmWeekInfo(Math.max(1, baseWeek - 1))?.verb || `Semana ${Math.max(1, baseWeek - 1)}`,
    isPreviousWeek: weekOffset === -1,
    scopeLabel: activeScope?.label || '',
    pendingCells,
    weeklyReports,
  };
}

function aggregateMetrics(reportsList) {
  const memberSet = new Set();
  const friendSet = new Set();
  const lateFriendSet = new Set();
  const restorSet = new Set();
  const kidCellSet = new Set();
  const kidVisitSet = new Set();
  const planAbsMap = new Map();
  const reachAbsMap = new Map();
  const sundayAbsMap = new Map();
  const metrics = {
    planningPresent: 0,
    planningAbsent: 0,
    reachMembers: 0,
    reachPrivileged: 0,
    reachVisitors: 0,
    reachKids: 0,
    reachFriends: 0,
    reachRestor: 0,
    reachKidsCell: 0,
    reachKidsVisit: 0,
    reachConversions: 0,
    sundayMembers: 0,
    sundayVisitors: 0,
    sundayFriends: 0,
    sundayRestor: 0,
    sundayKidsCell: 0,
    sundayKidsVisit: 0,
    sundayKids: 0,
    sundayTotal: 0,
    absent: 0,
    justified: 0,
    rosterSlots: 0,
    planningJustEv: 0,
    reachJustEv: 0,
    sundayJustEv: 0,
    lateFriends: 0,
    offering: 0,
  };

  (Array.isArray(reportsList) ? reportsList : []).forEach((report) => {
    const formData = report?.formData || {};
    const summary = formData.attendanceSummary || {};
    const cellNumber = String(report?.cellNumber || formData?.cellNumber || '').trim();
    metrics.planningPresent += Number(summary.planningMembersPresent || 0);
    metrics.planningAbsent += Number(summary.planningMembersAbsent || 0);
    metrics.reachMembers += Number(summary.reachMembersPresent || 0);
    metrics.reachPrivileged += Number(summary.reachPrivilegedMembers || 0);
    metrics.reachVisitors += Number(summary.reachFriendsPresent || summary.visitors || 0);
    metrics.reachKids += Number(summary.reachKidsPresent || 0);
    metrics.reachConversions += Number(summary.reachConversions || 0);
    metrics.absent += Number(summary.absent || 0);
    metrics.justified += Number(summary.justified || 0);
    metrics.sundayMembers += Number(summary.sundayMembersPresent || 0);
    metrics.sundayVisitors += Number(summary.sundayFriendsPresent || 0);
    metrics.sundayKids += Number(summary.sundayKidsPresent || 0);
    metrics.sundayTotal += Number(summary.sundayTotal || 0) || (Number(summary.sundayMembersPresent || 0) + Number(summary.sundayFriendsPresent || 0) + Number(summary.sundayKidsPresent || 0));
    metrics.rosterSlots += Number(summary.totalMembers || (Array.isArray(formData.memberAttendance) ? formData.memberAttendance.length : 0));
    metrics.offering += Number(summary.reachOffering || formData.reachOffering || 0);

    (Array.isArray(formData.memberAttendance) ? formData.memberAttendance : []).forEach((member) => {
      const name = String(member?.name || member?.memberName || '').trim();
      if (name) memberSet.add(`${cellNumber}|${name.toLowerCase()}`);
      if (String(member?.planningStatus || '').toLowerCase() === 'justified') metrics.planningJustEv += 1;
      if (String(member?.reachStatus || '').toLowerCase() === 'justified') metrics.reachJustEv += 1;
      if (String(member?.sundayStatus || '').toLowerCase() === 'justified') metrics.sundayJustEv += 1;
      if (!name) return;
      const key = name.toLowerCase();
      const bump = (map) => {
        const prev = map.get(key) || { name, count: 0 };
        prev.name = name;
        prev.count += 1;
        map.set(key, prev);
      };
      if (!member?.planningAttended) bump(planAbsMap);
      if (!member?.reachAttended) bump(reachAbsMap);
      if (!member?.sundayAttended) bump(sundayAbsMap);
    });

    (Array.isArray(formData.visitors) ? formData.visitors : []).forEach((visitor) => {
      const name = String(visitor?.name || '').trim();
      if (!name) return;
      const key = `${cellNumber}|${name.toLowerCase()}`;
      if (String(visitor?.kind || 'amigo').toLowerCase() === 'visita') {
        restorSet.add(key);
        if (visitor.reachAttended) metrics.reachRestor += 1;
        if (visitor.sundayAttended) metrics.sundayRestor += 1;
      } else {
        friendSet.add(key);
        if (visitor.lateRegistration) {
          lateFriendSet.add(key);
          metrics.lateFriends += 1;
        }
        if (visitor.reachAttended) metrics.reachFriends += 1;
        if (visitor.sundayAttended) metrics.sundayFriends += 1;
      }
    });

    (Array.isArray(formData.kids) ? formData.kids : []).forEach((kid) => {
      const name = String(kid?.name || '').trim();
      if (!name) return;
      const key = `${cellNumber}|${name.toLowerCase()}`;
      if (String(kid?.source || '').toLowerCase() === 'catalog') {
        kidCellSet.add(key);
        if (kid.reachAttended) metrics.reachKidsCell += 1;
        if (kid.sundayAttended) metrics.sundayKidsCell += 1;
      } else {
        kidVisitSet.add(key);
        if (kid.reachAttended) metrics.reachKidsVisit += 1;
        if (kid.sundayAttended) metrics.sundayKidsVisit += 1;
      }
    });
  });

  metrics.cellMembersUnique = memberSet.size;
  metrics.friendsUnique = friendSet.size;
  metrics.lateFriendsUnique = lateFriendSet.size;
  metrics.restorUnique = restorSet.size;
  metrics.kidsCellUnique = kidCellSet.size;
  metrics.kidsVisitUnique = kidVisitSet.size;
  const sortAbs = (map) => [...map.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  metrics.planningAbsentList = sortAbs(planAbsMap);
  metrics.reachAbsentList = sortAbs(reachAbsMap);
  metrics.sundayAbsentList = sortAbs(sundayAbsMap);
  metrics.reachAbsentMembers = Math.max(0, metrics.cellMembersUnique - metrics.reachMembers);
  metrics.sundayAbsentMembers = Math.max(0, metrics.cellMembersUnique - metrics.sundayMembers);
  return metrics;
}

function getReportYear(report) {
  const reportDate = getReportDate(report);
  return reportDate ? reportDate.slice(0, 4) : String(new Date().getFullYear());
}

function getReportQuarter(report) {
  const reportDate = getReportDate(report);
  const month = Number(reportDate.slice(5, 7));
  if (month >= 1 && month <= 4) return '1';
  if (month >= 5 && month <= 8) return '2';
  return '3';
}

function getReportPeriodKey(report) {
  const year = getReportYear(report);
  const quarter = getReportQuarter(report);
  const week = String(getReportWeek(report)).padStart(2, '0');
  return `${year}-Q${quarter}-W${week}`;
}

function isNextPeriod(previousKey, currentKey) {
  const prev = String(previousKey || '').match(/^(\d{4})-Q([123])-W(\d{2})$/);
  const curr = String(currentKey || '').match(/^(\d{4})-Q([123])-W(\d{2})$/);
  if (!prev || !curr) return false;
  const prevYear = Number(prev[1]);
  const prevQuarter = Number(prev[2]);
  const prevWeek = Number(prev[3]);
  const currYear = Number(curr[1]);
  const currQuarter = Number(curr[2]);
  const currWeek = Number(curr[3]);
  if (prevYear === currYear && prevQuarter === currQuarter) {
    return currWeek === prevWeek + 1;
  }
  if (currYear === prevYear && currQuarter === prevQuarter + 1) {
    return prevWeek === 16 && currWeek === 1;
  }
  if (currYear === prevYear + 1 && prevQuarter === 3 && currQuarter === 1) {
    return prevWeek === 16 && currWeek === 1;
  }
  return false;
}

function countBaptisms(reportsList) {
  return (Array.isArray(reportsList) ? reportsList : []).reduce((total, report) => {
    const entries = Array.isArray(report?.formData?.baptisms) ? report.formData.baptisms : [];
    return total + entries.filter((entry) => String(entry?.name || '').trim()).length;
  }, 0);
}

function getDashboardBaptismsData(scopedReports) {
  const byYearQuarterCell = {};
  const setMax = (year, quarter, cell, value) => {
    const num = Number(value || 0);
    if (!num) return;
    if (!byYearQuarterCell[year]) byYearQuarterCell[year] = {};
    if (!byYearQuarterCell[year][quarter]) byYearQuarterCell[year][quarter] = {};
    if (!byYearQuarterCell[year][quarter][cell]) byYearQuarterCell[year][quarter][cell] = 0;
    byYearQuarterCell[year][quarter][cell] = Math.max(byYearQuarterCell[year][quarter][cell], num);
  };

  (Array.isArray(scopedReports) ? scopedReports : []).forEach((report) => {
    const formData = report?.formData || {};
    const reportDate = String(formData.reportDate || report?.reportDate || '');
    const year = reportDate.slice(0, 4) || '?';
    const cell = String(report?.cellNumber || formData?.cellNumber || '?');

    const baptisms = Array.isArray(formData.baptisms)
      ? formData.baptisms.filter((entry) => String(entry?.name || '').trim())
      : [];
    if (baptisms.length) {
      const buckets = {};
      baptisms.forEach((entry) => {
        const baptismDate = String(entry?.baptismDate || '').trim() || reportDate;
        const baptismYear = baptismDate.slice(0, 4) || year;
        const month = Number(baptismDate.slice(5, 7));
        const quarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
        const key = `${baptismYear}|${quarter}`;
        buckets[key] = Number(buckets[key] || 0) + 1;
      });
      Object.entries(buckets).forEach(([key, count]) => {
        const [baptismYear, quarter] = key.split('|');
        setMax(baptismYear, quarter, cell, count);
      });
    }

    setMax(year, '1', cell, Number(formData.baptismFirstQuarter || 0));
    setMax(year, '2', cell, Number(formData.baptismSecondQuarter || 0));
    setMax(year, '3', cell, Number(formData.baptismThirdQuarter || 0));
  });

  const years = Object.keys(byYearQuarterCell).sort((left, right) => right.localeCompare(left));
  let total = 0;
  const yearBlocks = years.map((year) => {
    const quarterKeys = Object.keys(byYearQuarterCell[year]).sort((left, right) => left.localeCompare(right));
    const quarters = quarterKeys.map((quarter) => {
      const cellsMap = byYearQuarterCell[year][quarter] || {};
      const cells = Object.entries(cellsMap)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([cellNum, count]) => ({ cellNum, count: Number(count || 0) }));
      const quarterTotal = cells.reduce((sum, row) => sum + row.count, 0);
      return { quarter, total: quarterTotal, cells };
    });
    const yearTotal = quarters.reduce((sum, quarter) => sum + quarter.total, 0);
    total += yearTotal;
    return { year, total: yearTotal, quarters };
  });

  return { total, years: yearBlocks };
}

function buildDashboardPeriodOptions(state, scopedReports, timeScope) {
  const currentQuarter = getCurrentQuarter(state.settings);
  const currentWeek = String(getQuarterWeekNumber(state.settings)).padStart(2, '0');
  const optionsMap = new Map();

  (Array.isArray(scopedReports) ? scopedReports : []).forEach((report) => {
    const year = getReportYear(report);
    const quarter = getReportQuarter(report);
    const week = String(getReportWeek(report)).padStart(2, '0');
    if (timeScope === 'year') {
      optionsMap.set(year, { value: year, label: year });
      return;
    }
    if (timeScope === 'quarter') {
      const value = `${year}-Q${quarter}`;
      optionsMap.set(value, { value, label: `Q${quarter} ${year}` });
      return;
    }
    const value = `${year}-Q${quarter}-W${week}`;
    const info = getRcmWeekInfo(String(Number(week)));
    optionsMap.set(value, { value, label: `Sem. ${Number(week)}${info?.verb ? ` · ${info.verb}` : ''}` });
  });

  if (timeScope === 'year') {
    optionsMap.set(currentQuarter.year, { value: currentQuarter.year, label: currentQuarter.year });
  } else if (timeScope === 'quarter') {
    const value = `${currentQuarter.year}-Q${currentQuarter.quarter}`;
    optionsMap.set(value, { value, label: `Q${currentQuarter.quarter} ${currentQuarter.year}` });
  } else {
    const value = `${currentQuarter.year}-Q${currentQuarter.quarter}-W${currentWeek}`;
    const info = getRcmWeekInfo(String(Number(currentWeek)));
    optionsMap.set(value, { value, label: `Sem. ${Number(currentWeek)}${info?.verb ? ` · ${info.verb}` : ''}` });
  }

  return [...optionsMap.values()].sort((left, right) => right.value.localeCompare(left.value));
}

function parseDashboardPeriodKey(periodKey, timeScope, settings) {
  const currentQuarter = getCurrentQuarter(settings);
  const currentWeek = String(getQuarterWeekNumber(settings));
  const key = String(periodKey || '').trim();
  if (timeScope === 'year') {
    return { year: key || currentQuarter.year, quarter: currentQuarter.quarter, week: currentWeek };
  }
  if (timeScope === 'quarter') {
    const match = key.match(/^(\d{4})-Q([123])$/);
    if (match) return { year: match[1], quarter: match[2], week: currentWeek };
    return { year: currentQuarter.year, quarter: currentQuarter.quarter, week: currentWeek };
  }
  const match = key.match(/^(\d{4})-Q([123])-W(\d{2})$/);
  if (match) return { year: match[1], quarter: match[2], week: String(Number(match[3])) };
  return { year: currentQuarter.year, quarter: currentQuarter.quarter, week: currentWeek };
}

function getDashboardScopeLabel(state) {
  const activeScope = (Array.isArray(state.scopeTabs) ? state.scopeTabs : []).find((tab) => tab.key === state.accessScope) || null;
  return activeScope?.sublabel || activeScope?.label || '';
}

function getDashboardAlertsData(scopedReports, filteredReports, timeScope, selectedPeriod) {
  const reportsForStreaks = timeScope === 'week'
    ? (Array.isArray(scopedReports) ? scopedReports : []).filter((report) => getReportPeriodKey(report) <= String(selectedPeriod || ''))
    : (Array.isArray(filteredReports) ? filteredReports : []);
  const sortedReports = [...reportsForStreaks].sort((left, right) => getReportPeriodKey(left).localeCompare(getReportPeriodKey(right)));
  const eventDefs = [
    { key: 'planning', letter: 'P', statusField: 'planningStatus', attendedField: 'planningAttended' },
    { key: 'reach', letter: 'A', statusField: 'reachStatus', attendedField: 'reachAttended' },
    { key: 'sunday', letter: 'C', statusField: 'sundayStatus', attendedField: 'sundayAttended' },
  ];
  const streaks = new Map();

  sortedReports.forEach((report) => {
    const periodKey = getReportPeriodKey(report);
    const cellNum = String(report?.cellNumber || report?.formData?.cellNumber || '');
    const leaderNm = String(report?.leaderName || report?.formData?.leaderName || '');
    const entries = Array.isArray(report?.formData?.memberAttendance) ? report.formData.memberAttendance : [];
    entries.forEach((entry) => {
      const key = String(entry?.personId || entry?.name || '');
      if (!key) return;
      if (!streaks.has(key)) streaks.set(key, { name: String(entry?.name || ''), cellNum, leaderNm, perEvent: {}, totalMissed: 0 });
      const rec = streaks.get(key);
      rec.name = String(entry?.name || rec.name || '');
      if (cellNum) rec.cellNum = cellNum;
      if (leaderNm) rec.leaderNm = leaderNm;
      let missedHere = false;
      eventDefs.forEach((eventDef) => {
        const status = String(entry?.[eventDef.statusField] || '').toLowerCase();
        const attended = entry?.[eventDef.attendedField] === true;
        const current = rec.perEvent[eventDef.key] || { streak: 0, last: '', justified: false, total: 0 };
        if (!attended) {
          current.streak = (current.last && isNextPeriod(current.last, periodKey)) ? current.streak + 1 : 1;
          current.last = periodKey;
          current.justified = status === 'justified';
          current.total += 1;
          missedHere = true;
        } else {
          current.streak = 0;
          current.last = periodKey;
          current.justified = false;
        }
        rec.perEvent[eventDef.key] = current;
      });
      if (missedHere) rec.totalMissed += 1;
    });
  });

  const toAlertEntry = (entry) => {
    const maxStreak = entry.events.reduce((max, eventEntry) => Math.max(max, eventEntry.streak), 0);
    const severity = maxStreak >= 4 ? 'high' : maxStreak >= 3 ? 'medium' : 'soft';
    const severityLabel = maxStreak >= 4 ? 'Critica' : maxStreak >= 3 ? 'Alta' : maxStreak >= 2 ? 'Seguimiento' : 'Nueva';
    return {
      ...entry,
      maxStreak,
      severity,
      severityLabel,
    };
  };

  if (timeScope === 'week') {
    const weekKeys = new Set();
    const weekAlerts = [];
    (Array.isArray(filteredReports) ? filteredReports : []).forEach((report) => {
      const cellNum = String(report?.cellNumber || report?.formData?.cellNumber || '');
      const leaderNm = String(report?.leaderName || report?.formData?.leaderName || '');
      const entries = Array.isArray(report?.formData?.memberAttendance) ? report.formData.memberAttendance : [];
      entries.forEach((entry) => {
        const events = [];
        eventDefs.forEach((eventDef) => {
          const status = String(entry?.[eventDef.statusField] || '').toLowerCase();
          const attended = entry?.[eventDef.attendedField] === true;
          if (!attended) {
            const key = String(entry?.personId || entry?.name || '');
            const streak = streaks.get(key)?.perEvent[eventDef.key]?.streak || 1;
            events.push({ letter: eventDef.letter, streak, justified: status === 'justified' });
          }
        });
        if (!events.length) return;
        const key = String(entry?.personId || entry?.name || '');
        if (!key) return;
        weekKeys.add(key);
        const rec = streaks.get(key);
        weekAlerts.push(toAlertEntry({
          key,
          name: String(entry?.name || ''),
          cellNum,
          leaderNm,
          totalMissed: rec?.totalMissed || 1,
          events,
        }));
      });
    });
    weekAlerts.sort((left, right) => right.maxStreak - left.maxStreak || right.events.length - left.events.length);

    const previousStreaks = Array.from(streaks.entries()).map(([key, rec]) => {
      const events = [];
      eventDefs.forEach((eventDef) => {
        const current = rec.perEvent[eventDef.key];
        if (current && current.streak >= 2) {
          events.push({ letter: eventDef.letter, streak: current.streak, justified: current.justified });
        }
      });
      return toAlertEntry({
        key,
        name: rec.name,
        cellNum: rec.cellNum,
        leaderNm: rec.leaderNm,
        totalMissed: rec.totalMissed,
        events,
      });
    }).filter((entry) => entry.maxStreak >= 2 && !weekKeys.has(entry.key))
      .sort((left, right) => right.maxStreak - left.maxStreak)
      .slice(0, 5);

    return {
      current: weekAlerts,
      previous: previousStreaks,
      emptyMessage: 'Sin faltas registradas esta semana.',
    };
  }

  const periodAlerts = Array.from(streaks.values()).map((rec) => {
    const events = [];
    eventDefs.forEach((eventDef) => {
      const current = rec.perEvent[eventDef.key];
      if (current && current.total > 0) {
        events.push({ letter: eventDef.letter, streak: current.total, justified: current.justified });
      }
    });
    return toAlertEntry({
      name: rec.name,
      cellNum: rec.cellNum,
      leaderNm: rec.leaderNm,
      totalMissed: rec.totalMissed,
      events,
    });
  }).filter((entry) => entry.totalMissed > 0)
    .sort((left, right) => right.totalMissed - left.totalMissed || right.events.length - left.events.length)
    .slice(0, 25);

  return {
    current: periodAlerts,
    previous: [],
    emptyMessage: 'Sin alertas para el período seleccionado.',
  };
}

function getDashboardData(state) {
  const scopedReports = getScopedReports(state);
  const scopedCells = getScopedCells(state.catalogs, state.currentUser, state.accessScope);
  const timeScope = String(state.dashboardTimeScope || 'week');
  const periodOptions = buildDashboardPeriodOptions(state, scopedReports, timeScope);
  const selectedPeriod = periodOptions.some((option) => option.value === state.dashboardPeriod)
    ? state.dashboardPeriod
    : (periodOptions[0]?.value || '');
  state.dashboardPeriod = selectedPeriod;

  const selectedMeta = parseDashboardPeriodKey(selectedPeriod, timeScope, state.settings);
  const filteredReports = scopedReports.filter((report) => {
    const year = getReportYear(report);
    const quarter = getReportQuarter(report);
    const week = String(getReportWeek(report));
    if (timeScope === 'year') return year === selectedMeta.year;
    if (timeScope === 'quarter') return year === selectedMeta.year && quarter === selectedMeta.quarter;
    return year === selectedMeta.year && quarter === selectedMeta.quarter && week === selectedMeta.week;
  });

  const periodMetrics = aggregateMetrics(filteredReports);
  const baptisms = countBaptisms(filteredReports);
  const baptismsData = getDashboardBaptismsData(scopedReports);
  const reportedCells = new Set(filteredReports.map((report) => getReportCellNumber(report)).filter(Boolean));
  const reportedCellsCount = reportedCells.size;
  const pendingCells = timeScope === 'week'
    ? scopedCells.filter((cell) => !reportedCells.has(String(cell?.cellNumber || '').trim()))
    : [];
  const recentReports = [...filteredReports]
    .sort((left, right) => getReportDate(right).localeCompare(getReportDate(left)) || Number(right?.id || 0) - Number(left?.id || 0))
    .slice(0, 8);

  const totalReach = (periodMetrics.reachMembers || 0) + (periodMetrics.reachVisitors || 0) + (periodMetrics.reachKids || 0);
  const totalSunday = (periodMetrics.sundayMembers || 0) + (periodMetrics.sundayVisitors || 0) + (periodMetrics.sundayKids || 0);
  const visitsTotal = (periodMetrics.reachVisitors || 0) + (periodMetrics.sundayVisitors || 0);
  let summaryCards = [];
  let quarterBreakdown = [];
  let title = 'Semana en curso';
  let chip = selectedPeriod;
  const alerts = getDashboardAlertsData(scopedReports, filteredReports, timeScope, selectedPeriod);

  if (timeScope === 'quarter') {
    title = `Cuatrimestre Q${selectedMeta.quarter} ${selectedMeta.year}`;
    chip = `Q${selectedMeta.quarter} ${selectedMeta.year}`;
    summaryCards = [
      { label: 'Reportes', value: filteredReports.length, hint: 'capturados en el cuatrimestre' },
      { label: 'Células activas', value: reportedCellsCount, hint: 'con al menos un reporte' },
      { label: 'Prom. alcance', value: reportedCellsCount ? Math.round(totalReach / Math.max(1, reportedCellsCount)) : 0, hint: 'promedio por célula', accent: 'accent-success' },
      { label: 'Prom. culto', value: reportedCellsCount ? Math.round(totalSunday / Math.max(1, reportedCellsCount)) : 0, hint: 'promedio por célula', accent: 'accent-success' },
      { label: 'Conversiones', value: periodMetrics.reachConversions || 0, hint: 'decisiones de fe', accent: 'accent-faith' },
      { label: 'Bautismos', value: baptisms, hint: 'registrados en el período', accent: 'accent-faith' },
      { label: 'Planeación', value: periodMetrics.planningPresent || 0, hint: 'asistencia acumulada' },
      { label: 'Visitas', value: visitsTotal, hint: 'alcance + culto' },
    ];
  } else if (timeScope === 'year') {
    title = `Año ${selectedMeta.year}`;
    chip = selectedMeta.year;
    quarterBreakdown = ['1', '2', '3'].map((quarter) => {
      const reports = scopedReports.filter((report) => getReportYear(report) === selectedMeta.year && getReportQuarter(report) === quarter);
      const metrics = aggregateMetrics(reports);
      return {
        quarter,
        reports: reports.length,
        cells: new Set(reports.map((report) => getReportCellNumber(report)).filter(Boolean)).size,
        conversions: metrics.reachConversions || 0,
        baptisms: countBaptisms(reports),
        avgReach: reports.length ? Math.round(((metrics.reachMembers || 0) + (metrics.reachVisitors || 0)) / Math.max(1, reports.length)) : 0,
      };
    });
    summaryCards = [
      { label: 'Reportes', value: filteredReports.length, hint: 'capturados en el año' },
      { label: 'Células activas', value: reportedCellsCount, hint: 'con al menos un reporte' },
      { label: 'Conversiones', value: periodMetrics.reachConversions || 0, hint: 'decisiones de fe', accent: 'accent-faith' },
      { label: 'Bautismos', value: baptisms, hint: 'registrados en el año', accent: 'accent-faith' },
    ];
  } else {
    const weekInfo = getRcmWeekInfo(selectedMeta.week);
    title = weekInfo?.verb ? `Semana ${selectedMeta.week} · ${weekInfo.verb}` : `Semana ${selectedMeta.week}`;
    chip = `Sem. ${selectedMeta.week}`;
    summaryCards = [
      { label: 'Reportes', value: filteredReports.length, hint: 'capturados esta semana' },
      { label: 'Células', value: reportedCellsCount, hint: 'con reporte' },
      { label: 'Pendientes', value: pendingCells.length, hint: 'sin reporte esta semana' },
      { label: 'Planeación', value: periodMetrics.planningPresent || 0, hint: 'hermanos asistentes' },
      { label: 'Alcance', value: totalReach, hint: 'hermanos + amigos + niños', accent: 'accent-success' },
      { label: 'Culto', value: totalSunday, hint: 'total de asistentes', accent: 'accent-success' },
      { label: 'Faltas', value: (periodMetrics.absent || 0) + (periodMetrics.justified || 0), hint: 'ausentes + justificados' },
      { label: 'Visitas', value: visitsTotal, hint: 'alcance + culto' },
    ];
  }

  return {
    timeScope,
    periodOptions,
    selectedPeriod,
    selectedMeta,
    title,
    chip,
    scopeLabel: getDashboardScopeLabel(state),
    summaryCards,
    pendingCells,
    recentReports,
    quarterBreakdown,
    filteredReports,
    periodMetrics,
    baptisms,
    baptismYears: baptismsData.years,
    baptismTotal: baptismsData.total,
    alerts,
    isEmpty: filteredReports.length === 0,
  };
}

function buildTotalsGroupHtml(group, showOffering) {
  const aggregate = group.aggregate;
  const roster = Number(group.roster || 0);
  const memberMax = roster && roster > 0
    ? roster
    : Math.max(aggregate.cellMembersUnique || 0, aggregate.planningPresent || 0, aggregate.reachMembers || 0, aggregate.sundayMembers || 0, 1);
  const otherMax = Math.max(
    aggregate.reachFriends || 0,
    aggregate.reachRestor || 0,
    aggregate.reachKidsCell || 0,
    aggregate.reachKidsVisit || 0,
    aggregate.sundayFriends || 0,
    aggregate.sundayRestor || 0,
    aggregate.sundayKidsCell || 0,
    aggregate.sundayKidsVisit || 0,
    aggregate.sundayTotal || 0,
    aggregate.reachConversions || 0,
    aggregate.absent || 0,
    1,
  );
  const row = (label, value, color, hint = '', denominator = 0) => {
    const max = denominator && denominator > 0 ? denominator : otherMax;
    const width = Math.min(100, Math.round((value / max) * 100));
    const display = denominator > 0 ? `${value}/${denominator}` : String(value);
    const pct = denominator > 0 ? ` <span class="tot-row-pct">(${Math.round((value / denominator) * 100)}%)</span>` : '';
    return `<div class="tot-row-wrap"><div class="tot-row"><span class="tot-row-label">${label}</span><div class="tot-bar-track"><div class="tot-bar" style="width:${width}%;background:${color}"></div></div><strong class="tot-row-val">${display}${pct}</strong></div>${hint ? `<span class="tot-row-hint">${hint}</span>` : ''}</div>`;
  };
  const rowMembers = (label, value, color, denominator = 0, hint = '') => {
    if (!denominator || denominator <= 0) return row(label, value, color, hint, 0);
    if (value > denominator) {
      const extra = value - denominator;
      const pct = Math.round((denominator / value) * 100);
      const histHint = `+${extra} histórico${extra !== 1 ? 's' : ''} · aparecen en reportes pero ya no están en el roster`;
      const fullHint = hint ? `${hint} · ${histHint}` : histHint;
      return `<div class="tot-row-wrap"><div class="tot-row"><span class="tot-row-label">${label}</span><div class="tot-bar-track"><div class="tot-bar" style="width:${pct}%;background:${color}"></div></div><strong class="tot-row-val">${denominator}/${value} <span class="tot-row-pct">(${pct}%)</span></strong></div><span class="tot-row-hint">${fullHint}</span></div>`;
    }
    return row(label, value, color, hint, denominator);
  };
  const planningMissText = aggregate.planningAbsent ? `${aggregate.planningAbsent} no fueron a planeación` : '';
  const reachMissParts = [];
  if (aggregate.reachPrivileged) reachMissParts.push(`★ ${aggregate.reachPrivileged} con privilegio${aggregate.reachPrivileged !== 1 ? 's' : ''}`);
  if (aggregate.reachAbsentMembers > 0) reachMissParts.push(`${aggregate.reachAbsentMembers} no fueron al alcance`);
  const sundayMissText = aggregate.sundayAbsentMembers > 0 ? `${aggregate.sundayAbsentMembers} no fueron al culto` : '';
  return `
    <div class="tot-group">
      <p class="tot-group-label">${group.label}${roster ? ` · <span class="tot-roster-hint">de ${roster} hermanos asignados</span>` : ''}</p>
      <div class="tot-rows">
        <div class="tot-section-label">Hermanos de la célula</div>
        ${rowMembers('Miembros únicos', aggregate.cellMembersUnique || 0, '#5063b8', roster)}
        <div class="tot-section-label">Planeación</div>
        ${rowMembers('Asistieron', aggregate.planningPresent || 0, 'var(--brand)', roster, planningMissText)}
        <div class="tot-section-label">Alcance</div>
        ${rowMembers('Hermanos', aggregate.reachMembers || 0, '#2d8a55', roster, reachMissParts.join(' · '))}
        ${row('Amigos', aggregate.reachFriends || 0, '#1565c0', aggregate.friendsUnique ? `${aggregate.friendsUnique} únic.` : '')}
        ${row('Restauración', aggregate.reachRestor || 0, '#6a1b9a', aggregate.restorUnique ? `${aggregate.restorUnique} únic.` : '')}
        ${row('Niños célula', aggregate.reachKidsCell || 0, '#8e44ad', aggregate.kidsCellUnique ? `${aggregate.kidsCellUnique} únic.` : '')}
        ${row('Niños visit.', aggregate.reachKidsVisit || 0, '#a367d9', aggregate.kidsVisitUnique ? `${aggregate.kidsVisitUnique} únic.` : '')}
        ${aggregate.reachConversions ? row('Conversiones', aggregate.reachConversions || 0, '#e0872a') : ''}
        <div class="tot-section-label">Culto</div>
        ${rowMembers('Hermanos', aggregate.sundayMembers || 0, '#3a7bd5', roster, sundayMissText)}
        ${row('Amigos', aggregate.sundayFriends || 0, '#1565c0')}
        ${row('Restauración', aggregate.sundayRestor || 0, '#6a1b9a')}
        ${row('Niños célula', aggregate.sundayKidsCell || 0, '#8e44ad')}
        ${row('Niños visit.', aggregate.sundayKidsVisit || 0, '#a367d9')}
        ${row('Total', aggregate.sundayTotal || 0, '#0f3a91', `${aggregate.sundayMembers || 0} hmnos · ${aggregate.sundayVisitors || 0} visit. · ${aggregate.sundayKids || 0} niños`)}
        ${showOffering ? `<div class="tot-row-wrap"><div class="tot-row tot-row-offering"><span class="tot-row-label">Ofrenda</span><div class="tot-bar-track"><div class="tot-bar" style="width:${aggregate.offering > 0 ? 100 : 0}%;background:#1f8a4d"></div></div><strong class="tot-row-val">$${Math.round(aggregate.offering || 0).toLocaleString('es-MX')}</strong></div></div>` : ''}
      </div>
    </div>
  `;
}

function getTotalsData(state) {
  const weeklyReports = state.weekContext?.weeklyReports || [];
  if (!weeklyReports.length) return null;

  const scopedCells = getScopedCells(state.catalogs, state.currentUser, state.accessScope);
  const availableScopes = state.accessScope === 'all'
    ? (state.currentUser?.isAdmin ? ['total', 'sector', 'cell'] : ['sector', 'cell'])
    : state.accessScope === 'sector'
      ? ['sector', 'cell']
      : ['cell'];
  const selectedScope = availableScopes.includes(state.totalsScope) ? state.totalsScope : availableScopes[0];
  const rosterForCell = (cellNumber) => {
    const cell = scopedCells.find((entry) => String(entry?.cellNumber || '').trim() === String(cellNumber || '').trim());
    return cell ? getCellMembers(cell).length : 0;
  };
  const rosterForSector = (sector) => scopedCells
    .filter((cell) => String(cell?.sector || '').trim() === String(sector || '').trim())
    .reduce((total, cell) => total + getCellMembers(cell).length, 0);
  const rosterForTotal = () => scopedCells.reduce((total, cell) => total + getCellMembers(cell).length, 0);
  const snapshotMaxForCell = (cellNumber) => {
    let maxSnapshot = 0;
    weeklyReports.forEach((report) => {
      const reportCell = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
      if (reportCell !== String(cellNumber || '').trim()) return;
      const count = Number(report?.formData?.attendanceSummary?.totalMembers || 0);
      if (count > maxSnapshot) maxSnapshot = count;
    });
    return maxSnapshot;
  };
  const isCurrentWeekScope = state.weekContext?.weekOffset === 0;
  const effectiveRosterForCell = (cellNumber) => {
    if (isCurrentWeekScope) return rosterForCell(cellNumber);
    const snapshot = snapshotMaxForCell(cellNumber);
    return snapshot > 0 ? snapshot : rosterForCell(cellNumber);
  };
  const effectiveRosterForSector = (sector) => scopedCells
    .filter((cell) => String(cell?.sector || '').trim() === String(sector || '').trim())
    .reduce((total, cell) => total + effectiveRosterForCell(cell?.cellNumber), 0);
  const effectiveRosterForTotal = () => scopedCells.reduce((total, cell) => total + effectiveRosterForCell(cell?.cellNumber), 0);

  let groups = [];
  if (selectedScope === 'total') {
    groups = [{
      label: `${weeklyReports.length} reporte${weeklyReports.length !== 1 ? 's' : ''} esta semana`,
      roster: effectiveRosterForTotal(),
      aggregate: aggregateMetrics(weeklyReports),
    }];
  } else if (selectedScope === 'sector') {
    const sectors = [...new Set(scopedCells.map((cell) => String(cell?.sector || '?').trim() || '?'))].sort();
    groups = sectors.map((sector) => {
      const reports = weeklyReports.filter((report) => String(report?.formData?.sector || report?.sector || '').trim() === sector);
      const sectorCells = scopedCells.filter((cell) => String(cell?.sector || '').trim() === sector).length;
      return {
        label: `Sector ${sector} · ${reports.length}/${sectorCells} célula${sectorCells !== 1 ? 's' : ''} reportó`,
        roster: effectiveRosterForSector(sector),
        aggregate: aggregateMetrics(reports),
      };
    });
  } else {
    groups = scopedCells.map((cell) => {
      const cellNumber = String(cell?.cellNumber || '').trim();
      const reports = weeklyReports.filter((report) => getReportCellNumber(report) === cellNumber);
      const leaderName = state.cards.find((card) => String(card.cellNumber || '').trim() === cellNumber)?.leaderName || '';
      return {
        label: `Célula ${cellNumber}${leaderName ? ` · ${leaderName}` : ''}${reports.length ? '' : ' · sin reporte'}`,
        roster: effectiveRosterForCell(cellNumber),
        aggregate: aggregateMetrics(reports),
      };
    });
  }

  return {
    availableScopes,
    selectedScope,
    groups: groups.map((group) => ({ ...group, html: buildTotalsGroupHtml(group, state.showOffering) })),
  };
}

function getSupervisorWeeklyData(state) {
  const supervisors = getVisibleSupervisors(state.catalogs, state.currentUser);
  if (!supervisors.length) {
    return {
      supervisors: [],
      selectedSupervisorName: '',
      selectedWeek: '',
      weekOptions: [],
      cells: [],
      visibleReports: [],
      totalMetrics: null,
      verbLabel: '',
      quarter: getCurrentQuarter(state.settings),
    };
  }

  if (!state.supervisorName || !supervisors.some((entry) => entry.name === state.supervisorName)) {
    state.supervisorName = supervisors[0].name;
  }

  const totalWeeks = 16;
  const currentWeekNum = Math.max(1, Math.min(totalWeeks, getQuarterWeekNumber(state.settings)));
  const lastSelectable = Math.max(1, currentWeekNum - 1);
  if (!state.supervisorWeek || Number(state.supervisorWeek) > lastSelectable) {
    state.supervisorWeek = String(lastSelectable);
  }

  const selectedSupervisor = supervisors.find((entry) => entry.name === state.supervisorName) || supervisors[0];
  const quarter = getCurrentQuarter(state.settings);
  const weekOptions = Array.from({ length: lastSelectable }, (_unused, index) => {
    const week = String(index + 1);
    const info = getRcmWeekInfo(week);
    return {
      value: week,
      label: `Sem. ${week}${info?.verb ? ` · ${info.verb}` : ''}`,
    };
  });

  const cells = getCellsForSupervisor(state.catalogs, selectedSupervisor);
  const cellSet = new Set(cells.map((cell) => String(cell?.cellNumber || '').trim()));
  const visibleReports = state.reports.filter((report) => {
    const reportCell = getReportCellNumber(report);
    if (!cellSet.has(reportCell)) return false;
    if (String(getReportWeek(report)) !== String(state.supervisorWeek)) return false;
    if (!isCurrentQuarterReport(report, state.settings)) return false;
    const reportDate = getReportDate(report);
    const month = Number(reportDate.slice(5, 7));
    const reportQuarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
    return reportDate.slice(0, 4) === quarter.year && reportQuarter === quarter.quarter;
  });

  const perCellMetrics = cells.map((cell) => {
    const cellNumber = String(cell?.cellNumber || '').trim();
    const report = visibleReports.find((entry) => getReportCellNumber(entry) === cellNumber) || null;
    return report ? aggregateMetrics([report]) : null;
  });

  const approval = findApproval(
    state.approvals,
    selectedSupervisor?.sector,
    state.supervisorWeek,
    quarter.year,
    quarter.quarter,
  );
  const approvalState = String(approval?.state || 'pendiente');
  const isAdmin = Boolean(state.currentUser?.isAdmin);
  const isSupervisor = Boolean(
    state.currentUser?.isSupervisor
    && String(state.currentUser?.supervisedSector || '').trim() === String(selectedSupervisor?.sector || '').trim(),
  );
  const isCoordinatorOnly = isAdmin && !isSupervisor;

  return {
    supervisors,
    selectedSupervisorName: selectedSupervisor?.name || '',
    selectedWeek: String(state.supervisorWeek || ''),
    weekOptions,
    selectedSupervisor,
    cells,
    visibleReports,
    perCellMetrics,
    totalMetrics: aggregateMetrics(visibleReports),
    verbLabel: getRcmWeekInfo(String(state.supervisorWeek || ''))?.verb || '—',
    quarter,
    approval,
    approvalState,
    isAdmin,
    isSupervisor,
    isCoordinatorOnly,
    hideDetailForCoordinator: isCoordinatorOnly && approvalState === 'pendiente',
  };
}

function buildSupervisorWhatsAppText(state) {
  const data = state.supervisorData;
  if (!data?.selectedSupervisor) return '';
  const supervisor = data.selectedSupervisor;
  const totals = data.totalMetrics || {};
  const reported = Array.isArray(data.visibleReports) ? data.visibleReports.length : 0;
  const totalCells = Array.isArray(data.cells) ? data.cells.length : 0;
  const week = String(data.selectedWeek || '');
  const lines = [];
  lines.push(`📊 *Reporte semanal · Sector ${supervisor.sector}*`);
  lines.push(`Supervisor: ${supervisor.name}`);
  lines.push(`Semana ${week}${data.verbLabel ? ` · ${data.verbLabel}` : ''}`);
  lines.push(`Células reportadas: ${reported}/${totalCells}`);
  lines.push('');
  lines.push('*PLANEACIÓN*');
  lines.push(`• Miembros bautizados: ${totals.cellMembersUnique || 0}`);
  lines.push(`• Miembros asistentes: ${totals.planningPresent || 0}`);
  lines.push(`• Miembros ausentes: ${totals.planningAbsent || 0}`);
  lines.push('');
  lines.push('*ALCANCE*');
  lines.push(`• Miembros asistentes: ${totals.reachMembers || 0}`);
  lines.push(`• Con privilegios: ${totals.reachPrivileged || 0}`);
  lines.push(`• Amigos: ${totals.reachFriends || 0}`);
  lines.push(`• En restauración: ${totals.reachRestor || 0}`);
  lines.push(`• Niños: ${totals.reachKids || 0}`);
  lines.push(`• Ofrenda: $${Number(totals.offering || 0).toFixed(2)}`);
  lines.push('');
  lines.push('*CULTO INSPIRADOR*');
  lines.push(`• Miembros: ${totals.sundayMembers || 0}`);
  lines.push(`• Amigos: ${totals.sundayFriends || 0}`);
  lines.push(`• En restauración: ${totals.sundayRestor || 0}`);
  lines.push(`• Niños: ${totals.sundayKids || 0}`);
  return lines.join('\n');
}

function buildReportWhatsAppText(report) {
  const formData = report?.formData || {};
  const cell = String(report?.cellNumber || formData?.cellNumber || '—');
  const week = String(formData?.week || report?.week || '—');
  const leader = String(formData?.leaderName || report?.leaderName || '').trim();
  const totals = aggregateMetrics([report]);
  const lines = [];
  lines.push(`📋 *Reporte célula ${cell} · Semana ${week}*`);
  if (leader) lines.push(`Líder: ${leader}`);
  lines.push('');
  lines.push('*PLANEACIÓN*');
  lines.push(`• Miembros bautizados: ${totals.cellMembersUnique || 0}`);
  lines.push(`• Asistentes: ${totals.planningPresent || 0}`);
  lines.push(`• Ausentes: ${totals.planningAbsent || 0}`);
  lines.push('');
  lines.push('*ALCANCE*');
  lines.push(`• Miembros: ${totals.reachMembers || 0}`);
  lines.push(`• Con privilegios: ${totals.reachPrivileged || 0}`);
  lines.push(`• Amigos: ${totals.reachFriends || 0}`);
  lines.push(`• En restauración: ${totals.reachRestor || 0}`);
  lines.push(`• Niños: ${totals.reachKids || 0}`);
  lines.push(`• Ofrenda: $${Number(totals.offering || 0).toFixed(2)}`);
  lines.push('');
  lines.push('*CULTO INSPIRADOR*');
  lines.push(`• Miembros: ${totals.sundayMembers || 0}`);
  lines.push(`• Amigos: ${totals.sundayFriends || 0}`);
  lines.push(`• En restauración: ${totals.sundayRestor || 0}`);
  lines.push(`• Niños: ${totals.sundayKids || 0}`);
  return lines.join('\n');
}

export function createSeguimientoFeature(options = {}) {
  const state = {
    ...createSeguimientoState(),
    settings: options.settings || {},
    currentUser: options.currentUser || null,
    catalogs: { cells: [], people: [] },
    scopeTabs: buildScopeTabs(options.currentUser || null),
    segTabs: getSeguimientoTabs(options.currentUser || null),
    cards: [],
    cellOptions: [],
    summary: selectSeguimientoSummary([]),
    activeTab: getDefaultSeguimientoTab(options.currentUser || null),
    weekOffset: -1,
    totalsScope: 'cell',
    showOffering: loadShowOffering(),
    weekContext: null,
    totals: null,
    dashboardTimeScope: 'week',
    dashboardPeriod: '',
    dashboardAttendanceTab: 'hermanos',
    dashboardData: null,
    previewReport: null,
    previewMode: 'default',
    isPreviewOpen: false,
    supervisorName: '',
    supervisorWeek: '',
    supervisorData: null,
    approvals: [],
    message: '',
    isError: false,
    // Metas tab state
    metasData: null,
    metasLoading: false,
    metasCellFilter: '',
    metasCells: [],
    processControlEntries: [],
    controlDetailKey: '',
    controlDetailEntry: null,
    isControlDetailOpen: false,
  };

  state.accessScope = getPreferredAccessScope(state.currentUser, state.scopeTabs);

  let currentRoot = null;

  function syncDerivedState() {
    state.scopeTabs = buildScopeTabs(state.currentUser);
    state.segTabs = getSeguimientoTabs(state.currentUser);
    if (!state.segTabs.some((tab) => tab.key === state.activeTab)) {
      state.activeTab = getDefaultSeguimientoTab(state.currentUser);
    }
    state.cards = selectSeguimientoCards(state, state.currentUser, state.settings);
    state.cellOptions = selectSeguimientoCellOptions(state.cards);
    state.summary = selectSeguimientoSummary(state.cards);
    state.weekContext = getWeekContext(state);
    state.totals = getTotalsData(state);
    state.dashboardData = getDashboardData(state);
    state.supervisorData = getSupervisorWeeklyData(state);
    if (state.totals?.selectedScope) {
      state.totalsScope = state.totals.selectedScope;
    }
    if (state.detail?.cardKey) {
      const currentCard = state.cards.find((card) => card.key === state.detail.cardKey);
      state.detail = currentCard ? buildSeguimientoDetail(currentCard) : null;
    }
  }

  async function load() {
    const [reports, catalogs, approvals] = await Promise.all([
      fetchSeguimientoReports({ requestFn: options.requestFn }),
      fetchCatalogs({ requestFn: options.requestFn }),
      fetchSeguimientoApprovals({ requestFn: options.requestFn }),
    ]);
    state.reports = reports;
    state.catalogs = catalogs;
    state.approvals = approvals;
    syncDerivedState();
  }

  async function changeFilters(formData) {
    state.scope = saveSeguimientoScope(formData.get('scope'));
    state.cellFilter = String(formData.get('cell_filter') || '').trim();
    syncDerivedState();
    render();
  }

  function changeTab(tabKey) {
    const nextTab = String(tabKey || '').trim();
    if (!nextTab || nextTab === state.activeTab) return;
    state.activeTab = nextTab;
    render();
    if (nextTab === 'goals' && !state.metasData && !state.metasLoading) {
      loadMetas();
    }
  }

  function changeAccessScope(scopeKey) {
    const nextScope = String(scopeKey || '').trim();
    if (!nextScope || nextScope === state.accessScope) return;
    state.accessScope = nextScope;
    state.cellFilter = '';
    syncDerivedState();
    render();
  }

  function changeWeekOffset(offset) {
    state.weekOffset = Number(offset) === 0 ? 0 : -1;
    syncDerivedState();
    render();
  }

  function buildMetasApiParams(cellFilter) {
    const user = state.currentUser;
    const accessScope = state.accessScope;
    const params = {};
    const cell = String(cellFilter || '').trim();
    if (cell) {
      params.cellNumber = cell;
    } else if (accessScope === 'cell') {
      params.cellNumber = String(user?.assignedCellNumber || '').trim();
    } else if (accessScope === 'sector') {
      params.sector = String(user?.supervisedSector || '').trim();
    }
    // 'all' scope passes no filter — returns all cells
    return params;
  }

  function buildMetasCells() {
    const user = state.currentUser;
    const accessScope = state.accessScope;
    const cells = Array.isArray(state.catalogs?.cells) ? state.catalogs.cells : [];
    let filtered = cells;
    if (accessScope === 'cell') {
      const myCell = String(user?.assignedCellNumber || '').trim();
      filtered = myCell ? cells.filter((cell) => String(cell?.cellNumber || '').trim() === myCell) : [];
    } else if (accessScope === 'sector') {
      const mySector = String(user?.supervisedSector || '').trim();
      filtered = mySector ? cells.filter((cell) => String(cell?.sector || '').trim() === mySector) : [];
    }
    return filtered
      .map((cell) => String(cell?.cellNumber || '').trim())
      .filter(Boolean)
      .sort((left, right) => Number(left) - Number(right));
  }

  async function loadMetas() {
    state.metasCells = buildMetasCells();
    state.metasLoading = true;
    render();
    try {
      const params = buildMetasApiParams(state.metasCellFilter);
      const payload = await fetchFriendTracking(params, { requestFn: options.requestFn });
      state.metasData = payload || null;
      // Compute process control entries from local reports filtered to same scope
      const scope = payload?.scope || {};
      const scopedReports = state.reports.filter((report) => {
        const cellNumber = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
        const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
        const year = reportDate.slice(0, 4);
        const month = Number(reportDate.slice(5, 7));
        const quarter = month <= 4 ? '1' : month <= 8 ? '2' : '3';
        if (scope.cellNumber && cellNumber !== scope.cellNumber) return false;
        if (scope.sector) {
          const reportSector = String(report?.sector || report?.formData?.sector || '').trim();
          if (reportSector !== scope.sector) return false;
        }
        if (scope.year && year !== scope.year) return false;
        if (scope.quarter && quarter !== scope.quarter) return false;
        return true;
      });
      const friends = Array.isArray(payload?.friends) ? payload.friends : [];
      state.processControlEntries = buildProcessControlEntries(scopedReports, friends);
      if (state.controlDetailKey) {
        state.controlDetailEntry = state.processControlEntries.find((entry) => entry.key === state.controlDetailKey) || null;
        if (!state.controlDetailEntry) {
          state.isControlDetailOpen = false;
          state.controlDetailKey = '';
        }
      }
    } catch {
      state.metasData = null;
      state.processControlEntries = [];
      state.controlDetailEntry = null;
      state.controlDetailKey = '';
      state.isControlDetailOpen = false;
    } finally {
      state.metasLoading = false;
    }
    render();
  }

  async function changeMetasCellFilter(cellNumber) {
    const nextCell = String(cellNumber || '').trim();
    if (nextCell === state.metasCellFilter) return;
    state.metasCellFilter = nextCell;
    await loadMetas();
  }

  function openControlDetail(controlKey) {
    const key = String(controlKey || '').trim();
    if (!key) return;
    const entry = state.processControlEntries.find((item) => item.key === key);
    if (!entry) return;
    state.controlDetailKey = key;
    state.controlDetailEntry = entry;
    state.isControlDetailOpen = true;
    render();
  }

  function closeControlDetail() {
    state.isControlDetailOpen = false;
    state.controlDetailEntry = null;
    state.controlDetailKey = '';
    render();
  }

  function changeTotalsScope(scopeKey) {
    state.totalsScope = String(scopeKey || '').trim() || 'cell';
    syncDerivedState();
    render();
  }

  function changeDashboardTimeScope(scopeKey) {
    const nextScope = ['week', 'quarter', 'year'].includes(String(scopeKey || '').trim()) ? String(scopeKey || '').trim() : 'week';
    if (nextScope === state.dashboardTimeScope) return;
    state.dashboardTimeScope = nextScope;
    state.dashboardPeriod = '';
    state.dashboardAttendanceTab = 'hermanos';
    syncDerivedState();
    render();
  }

  function changeDashboardAttendanceTab(tabKey) {
    const nextTab = String(tabKey || '').trim() === 'amigos' ? 'amigos' : 'hermanos';
    if (nextTab === state.dashboardAttendanceTab) return;
    state.dashboardAttendanceTab = nextTab;
    render();
  }

  function changeDashboardPeriod(periodKey) {
    const nextPeriod = String(periodKey || '').trim();
    if (!nextPeriod || nextPeriod === state.dashboardPeriod) return;
    state.dashboardPeriod = nextPeriod;
    syncDerivedState();
    render();
  }

  function changeSupervisor(supervisorName) {
    const nextValue = String(supervisorName || '').trim();
    if (!nextValue || nextValue === state.supervisorName) return;
    state.supervisorName = nextValue;
    syncDerivedState();
    render();
  }

  function changeSupervisorWeek(week) {
    const nextValue = String(week || '').trim();
    if (!nextValue || nextValue === state.supervisorWeek) return;
    state.supervisorWeek = nextValue;
    syncDerivedState();
    render();
  }

  function toggleShowOffering(checked) {
    state.showOffering = saveShowOffering(checked);
    state.totals = getTotalsData(state);
    render();
  }

  function gotoCell(cellNumber) {
    const nextCell = String(cellNumber || '').trim();
    if (!nextCell || !currentRoot) return;
    const card = currentRoot.querySelector(`#seguimiento-cycles-list [data-cell-number="${nextCell}"]`);
    if (!(card instanceof HTMLElement)) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    card.classList.add('cycle-card-highlight');
    window.setTimeout(() => card.classList.remove('cycle-card-highlight'), 1800);
  }

  async function selectCardDetail(cardKey) {
    const card = state.cards.find((entry) => entry.key === cardKey);
    if (!card?.latestReport?.id) return;
    await selectReportDetail(card.key, String(card.latestReport.id || ''));
  }

  async function selectReportDetail(cardKey, reportId) {
    const card = state.cards.find((entry) => entry.key === cardKey);
    if (!card) return;
    const cachedReport = card.reports.find((entry) => String(entry.id || '') === String(reportId || '')) || null;
    const report = reportId
      ? (await fetchSeguimientoReport(reportId, { requestFn: options.requestFn }).catch(() => cachedReport))
      : cachedReport;
    state.detail = buildSeguimientoDetail(card, report);
    state.previewReport = report;
    state.previewMode = 'default';
    state.isPreviewOpen = Boolean(report);
    render();
  }

  async function openSupervisorReport(reportId) {
    const nextReportId = String(reportId || '').trim();
    if (!nextReportId) return;
    const cachedReport = state.reports.find((entry) => String(entry?.id || '') === nextReportId) || null;
    const report = await fetchSeguimientoReport(nextReportId, { requestFn: options.requestFn }).catch(() => cachedReport);
    if (!report) return;
    state.previewReport = report;
    state.previewMode = 'supervisor';
    state.isPreviewOpen = true;
    render();
  }

  async function submitApprovalAction(action, sector, week) {
    const nextAction = String(action || '').trim();
    const nextSector = String(sector || '').trim();
    const nextWeek = String(week || '').trim();
    if (!nextAction || !nextSector || !nextWeek) return;
    const actor = String(
      state.currentUser?.displayName
      || state.currentUser?.name
      || state.currentUser?.username
      || ''
    ).trim();
    try {
      const approval = await saveSeguimientoApproval({
        sector: nextSector,
        year: state.supervisorData?.quarter?.year || getCurrentQuarter(state.settings).year,
        quarter: state.supervisorData?.quarter?.quarter || getCurrentQuarter(state.settings).quarter,
        week: nextWeek,
        action: nextAction,
        actor,
        notes: '',
      }, { requestFn: options.requestFn });
      if (approval?.id) {
        const index = state.approvals.findIndex((entry) => String(entry?.id || '') === String(approval.id));
        if (index >= 0) state.approvals[index] = approval;
        else state.approvals.push(approval);
      } else {
        state.approvals = await fetchSeguimientoApprovals({ requestFn: options.requestFn });
      }
      state.message = '';
      state.isError = false;
      syncDerivedState();
      render();
    } catch (error) {
      state.message = error?.message || 'Error al actualizar aprobación.';
      state.isError = true;
      render();
    }
  }

  function getSupervisorSharePayload() {
    const data = state.supervisorData;
    if (!data?.selectedSupervisor) return null;
    return {
      text: buildSupervisorWhatsAppText(state),
      filename: `reporte-${String(data.selectedSupervisor.sector || 'supervisor').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 60)}-S${String(data.selectedWeek || '')}.png`,
    };
  }

  function getPreviewSharePayload() {
    if (!state.previewReport) return null;
    const formData = state.previewReport.formData || {};
    const cell = String(state.previewReport.cellNumber || formData.cellNumber || 'reporte');
    const week = String(formData.week || state.previewReport.week || '');
    return {
      text: buildReportWhatsAppText(state.previewReport),
      filename: `reporte-celula${cell}-S${week}.png`,
    };
  }

  function closePreview() {
    state.isPreviewOpen = false;
    state.previewReport = null;
    state.previewMode = 'default';
    render();
  }

  async function openCapture(context) {
    state.message = '';
    state.isError = false;
    if (typeof options.onNavigate === 'function') {
      await options.onNavigate('reporte', {
        mode: 'capture',
        cellNumber: context.cellNumber,
        week: context.week,
      });
      return;
    }
    state.message = 'No se pudo abrir la captura modular.';
    state.isError = true;
    render();
  }

  function render() {
    if (!currentRoot) return;
    if (state.controlDetailKey) {
      state.controlDetailEntry = state.processControlEntries.find((entry) => entry.key === state.controlDetailKey) || null;
      if (!state.controlDetailEntry) {
        state.isControlDetailOpen = false;
        state.controlDetailKey = '';
      }
    }
    currentRoot.innerHTML = renderSeguimientoShell(state);
    attachSeguimientoController(currentRoot, {
      changeFilters,
      changeTab,
      changeAccessScope,
      changeWeekOffset,
      changeTotalsScope,
      changeDashboardTimeScope,
      changeDashboardPeriod,
      changeDashboardAttendanceTab,
      changeSupervisor,
      changeSupervisorWeek,
      toggleShowOffering,
      gotoCell,
      selectCardDetail,
      selectReportDetail,
      openSupervisorReport,
      submitApprovalAction,
      getSupervisorSharePayload,
      getPreviewSharePayload,
      openCapture,
      closePreview,
      changeMetasCellFilter,
      openControlDetail,
      closeControlDetail,
    });
    const previewDialog = currentRoot.querySelector('#seguimiento-report-preview-dialog');
    if (previewDialog instanceof HTMLDialogElement) {
      if (state.isPreviewOpen && !previewDialog.open) {
        previewDialog.showModal();
      } else if (!state.isPreviewOpen && previewDialog.open) {
        previewDialog.close();
      }
    }
    const controlDialog = currentRoot.querySelector('#seguimiento-control-detail-dialog');
    if (controlDialog instanceof HTMLDialogElement) {
      if (state.isControlDetailOpen && !controlDialog.open) {
        controlDialog.showModal();
      } else if (!state.isControlDetailOpen && controlDialog.open) {
        controlDialog.close();
      }
    }
  }

  return {
    async mount(root) {
      currentRoot = root || null;
      try {
        await load();
        state.message = '';
        state.isError = false;
      } catch (error) {
        state.message = error.message;
        state.isError = true;
      }
      render();
      if (state.activeTab === 'goals') {
        loadMetas();
      }
    },
    unmount(root) {
      currentRoot = null;
      if (root) {
        root.innerHTML = '';
      }
    },
  };
}
