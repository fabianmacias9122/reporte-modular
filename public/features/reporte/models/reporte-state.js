import { getRcmTotalWeeks, getRcmWeekInfo } from '../../../core/rcm/index.js';
import { createEmptyCatalogs, findCellByNumber, getCellKids, getCellMembers } from '../../catalogos/models/catalogs-state.js';

function buildReportRcmSnapshot(weekValue) {
  const info = getRcmWeekInfo(weekValue);
  const weekNumber = parseInt(String(weekValue || '0'), 10) || 0;
  return {
    week: weekNumber,
    phase: String(info?.phase || '').trim(),
    phaseLabel: String(info?.phaseLabel || '').trim(),
    verb: String(info?.verb || '').trim(),
    event: String(info?.event || '').trim(),
    rcmKey: String(info?.rcmKey || '').trim(),
    isEventWeek: Boolean(info?.isEventWeek && info?.event),
  };
}

export function createReporteState(initialContext = null) {
  return {
    context: initialContext,
    activeStage: 'encabezado',
    lastSavedStage: '',
    isDraftReport: true,
    previewReport: null,
    previewVisitorsOpen: false,
    catalogs: createEmptyCatalogs(),
    settings: {},
    currentUser: null,
    report: null,
    reportId: '',
    form: createReportFormData(),
    canEditCell: false,
    canEditCurrentReport: false,
    graceBannerDismissed: false,
    message: '',
    isError: false,
    visitorInlineMessage: '',
  };
}

export function normalizeReporteContext(context) {
  if (!context || typeof context !== 'object') return null;
  return {
    mode: context.mode === 'view' ? 'view' : 'capture',
    cellNumber: String(context.cellNumber || '').trim(),
    week: String(context.week || '').trim(),
    reportId: context.reportId ? String(context.reportId) : '',
    report: context.report || null,
  };
}

export function createReportFormData() {
  return {
    week: '',
    cellNumber: '',
    sector: '',
    leaderName: '',
    assistantName: '',
    hostName: '',
    reportDate: '',
    networkName: '',
    zoneName: '',
    districtName: '',
    address: '',
    notes: '',
    phaseLabel: '',
    phaseVerb: '',
    reachOffering: '0',
    supervisionNetwork: '0',
    supervisionSector: '0',
    supervisionZone: '0',
    supervisionRegion: '0',
    supervisionArea: '0',
    memberAttendance: [],
    visitors: [],
    kids: [],
    baptisms: [],
    externalParticipants: [],
  };
}

function getDateValueParts(dateValue = '') {
  const match = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day };
}

function getStartOfIsoWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getBaptismCaptureStatus(dateValue = '') {
  const parts = getDateValueParts(dateValue);
  if (!parts) {
    return {
      isAllowed: false,
      message: 'Selecciona la fecha del reporte para habilitar el cierre de bautismos.',
    };
  }
  if (![4, 8, 12].includes(parts.month)) {
    return {
      isAllowed: false,
      message: 'Los bautismos solo se capturan en el cierre del cuatrimestre: abril, agosto y diciembre.',
    };
  }
  const reportDate = new Date(parts.year, parts.month - 1, parts.day);
  const lastDayOfMonth = new Date(parts.year, parts.month, 0);
  const closingWeekStart = getStartOfIsoWeek(lastDayOfMonth);
  if (reportDate < closingWeekStart || reportDate.getMonth() !== lastDayOfMonth.getMonth()) {
    return {
      isAllowed: false,
      message: 'Los bautismos se registran solo en la ultima semana del cuatrimestre.',
    };
  }
  return {
    isAllowed: true,
    message: `Cierre habilitado para ${lastDayOfMonth.toLocaleString('es-MX', { month: 'long' })}.`,
  };
}

export function getBaptismQuarter(dateValue = '') {
  const month = Number(String(dateValue || '').slice(5, 7));
  if (!month || Number.isNaN(month)) {
    return 0;
  }
  if (month <= 4) return 1;
  if (month <= 8) return 2;
  return 3;
}

export function normalizeBaptisms(savedBaptisms = []) {
  if (!Array.isArray(savedBaptisms)) {
    return [];
  }
  return savedBaptisms.map((entry) => ({
    name: String(entry?.name || '').trim(),
    baptismDate: String(entry?.baptismDate || '').trim(),
    source: String(entry?.source || 'report').trim() || 'report',
    note: String(entry?.note || '').trim(),
    promoteToMember: entry?.promoteToMember !== false,
  }));
}

export function getBaptismRegistrationMessage(captureStatus) {
  return captureStatus.isAllowed
    ? captureStatus.message
    : 'Fuera del cierre cuatrimestral. Puedes registrarlo para agregarlo como miembro; el conteo anual solo se actualiza en la ultima semana del cuatrimestre.';
}

export function createBaptismQuickForm(reportDate = '') {
  return {
    name: '',
    baptismDate: String(reportDate || '').trim(),
    source: getBaptismCaptureStatus(reportDate).isAllowed ? 'report' : 'fuera-cierre',
    note: '',
    promoteToMember: true,
  };
}

export function normalizeVisitorKind(value) {
  return String(value || '').toLowerCase() === 'visita' ? 'visita' : 'amigo';
}

export function normalizeVisitorProcessEntry(value, kind = 'amigo', fallback = {}) {
  const normalizedKind = normalizeVisitorKind(kind);
  if (normalizedKind !== 'amigo') return 'none';
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'none' || raw === 'noted' || raw === 'late') {
    return raw;
  }
  if (fallback?.lateRegistration) return 'late';
  return 'none';
}

function buildVisitorEntry(visitor = {}) {
  const kind = normalizeVisitorKind(visitor?.kind);
  const processEntry = normalizeVisitorProcessEntry(visitor?.processEntry, kind, {
    lateRegistration: Boolean(visitor?.lateRegistration),
  });
  return {
    name: String(visitor?.name || ''),
    kind,
    invitedBy: String(visitor?.invitedBy || ''),
    reachAttended: Boolean(visitor?.reachAttended),
    lateRegistration: kind === 'amigo' ? processEntry === 'late' : false,
    sundayAttended: Boolean(visitor?.sundayAttended),
    firstVisit: Boolean(visitor?.firstVisit),
    processEntry,
    converted: kind === 'visita' ? false : Boolean(visitor?.converted),
    promoteToMember: kind === 'visita' ? Boolean(visitor?.promoteToMember) : false,
    contacted: Boolean(visitor?.contacted),
    eventAttended: Boolean(visitor?.eventAttended),
    phone: String(visitor?.phone || ''),
    note: String(visitor?.note || ''),
  };
}

export function normalizeVisitors(savedVisitors = []) {
  if (!Array.isArray(savedVisitors)) {
    return [];
  }
  return savedVisitors.map((visitor) => buildVisitorEntry(visitor));
}

export function normalizeExternalParticipants(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) {
    return [];
  }
  const seen = new Set();
  return source.map((entry) => {
    const rawPersonId = entry && typeof entry === 'object' ? entry.personId ?? entry.id : entry;
    const personId = rawPersonId == null || rawPersonId === '' ? null : String(rawPersonId).trim();
    const name = String((entry && typeof entry === 'object' ? entry.name : '') || '').trim();
    const kind = String((entry && typeof entry === 'object' ? entry.kind : '') || 'sector_supervision').trim() || 'sector_supervision';
    const relatedSector = String((entry && typeof entry === 'object' ? (entry.relatedSector ?? entry.supervisorSector) : '') || '').trim();
    const homeCellNumber = String((entry && typeof entry === 'object' ? entry.homeCellNumber : '') || '').trim();
    const countsAs = String((entry && typeof entry === 'object' ? entry.countsAs : '') || 'member_present').trim() || 'member_present';
    const rawStages = entry && typeof entry === 'object' ? entry.stages : null;
    const stages = Array.isArray(rawStages) && rawStages.length
      ? rawStages.map((stage) => String(stage || '').trim()).filter(Boolean)
      : ['reach'];
    return { personId, name, kind, relatedSector, homeCellNumber, countsAs, stages };
  }).filter((entry) => {
    const key = `${entry.kind}:${entry.personId || entry.name.toLowerCase()}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveCellContext(catalogs, cellOrCellNumber) {
  if (!cellOrCellNumber) return null;
  if (typeof cellOrCellNumber === 'object') return cellOrCellNumber;
  return findCellByNumber(catalogs, String(cellOrCellNumber || '').trim());
}

function doesPersonBelongToCell(catalogs, personLike, cellOrCellNumber) {
  const cell = resolveCellContext(catalogs, cellOrCellNumber);
  if (!personLike || !cell) return false;
  const personId = String(personLike.id || personLike.personId || '').trim();
  const activeCell = String(cell.cellNumber || '').trim();
  const assignedCellNumber = String(personLike.assignedCellNumber || personLike.homeCellNumber || '').trim();
  if (assignedCellNumber && activeCell && assignedCellNumber === activeCell) {
    return true;
  }
  if (personId && [cell.leaderPersonId, cell.assistantPersonId, cell.hostPersonId].some((value) => String(value || '').trim() === personId)) {
    return true;
  }
  return getCellMembers(cell).some((member) => String(member.id || '').trim() === personId);
}

export function isExternalParticipantForCell(catalogs, entry, cellOrCellNumber) {
  const person = entry?.personId
    ? (catalogs?.people || []).find((item) => String(item.id || '').trim() === String(entry.personId || '').trim())
    : null;
  return !doesPersonBelongToCell(catalogs, person || entry, cellOrCellNumber);
}

export function getReachExternalParticipants(value, catalogs, cellOrCellNumber) {
  return normalizeExternalParticipants(value).filter((entry) => entry.stages.includes('reach') && isExternalParticipantForCell(catalogs, entry, cellOrCellNumber));
}

export function getLegacyReachSupervisorVisits(value, catalogs, cellOrCellNumber) {
  return getReachExternalParticipants(value, catalogs, cellOrCellNumber)
    .filter((entry) => entry.kind === 'sector_supervision')
    .map((entry) => ({
      personId: entry.personId,
      name: entry.name,
      supervisorSector: entry.relatedSector,
    }));
}

export function getExternalParticipantKindLabel(kind) {
  if (kind === 'pastoral_visit') return 'Pastor';
  if (kind === 'member_visit') return 'Miembro visitante';
  return 'Supervisor';
}

export function getReachExternalParticipantCandidates(catalogs, cellNumber) {
  const cell = findCellByNumber(catalogs, cellNumber);
  if (!cell) return [];
  const cellSector = String(cell.sector || '').trim();

  const supervisors = (catalogs?.people || [])
    .filter((person) => {
      const supervisorSector = String(person.supervisorSector || '').trim();
      if (!supervisorSector) return false;
      if (cellSector && supervisorSector !== cellSector) return false;
      return isExternalParticipantForCell(catalogs, person, cell);
    })
    .map((person) => ({
      personId: String(person.id || ''),
      name: String(person.name || ''),
      kind: 'sector_supervision',
      relatedSector: String(person.supervisorSector || cellSector || ''),
      homeCellNumber: String(person.assignedCellNumber || ''),
      countsAs: 'member_present',
      stages: ['reach'],
    }));

  const pastors = (catalogs?.people || [])
    .filter((person) => String(person.role || '').trim().toLowerCase() === 'pastor')
    .filter((person) => isExternalParticipantForCell(catalogs, person, cell))
    .map((person) => ({
      personId: String(person.id || ''),
      name: String(person.name || ''),
      kind: 'pastoral_visit',
      relatedSector: cellSector,
      homeCellNumber: String(person.assignedCellNumber || ''),
      countsAs: 'member_present',
      stages: ['reach'],
    }));

  const memberVisitors = (catalogs?.people || [])
    .filter((person) => ['leader', 'assistant', 'host', 'member', 'pastor'].includes(String(person.role || '').trim().toLowerCase()))
    .filter((person) => {
      const assignedCellNumber = String(person.assignedCellNumber || '').trim();
      return assignedCellNumber && assignedCellNumber !== String(cell.cellNumber || '').trim();
    })
    .filter((person) => isExternalParticipantForCell(catalogs, person, cell))
    .map((person) => ({
      personId: String(person.id || ''),
      name: String(person.name || ''),
      kind: 'member_visit',
      relatedSector: String(person.supervisorSector || ''),
      homeCellNumber: String(person.assignedCellNumber || ''),
      countsAs: 'member_present',
      stages: ['reach'],
    }));

  return [...supervisors, ...pastors, ...memberVisitors].sort((left, right) => {
    const byKind = String(left.kind || '').localeCompare(String(right.kind || ''), 'es');
    if (byKind !== 0) return byKind;
    return String(left.name || '').localeCompare(String(right.name || ''), 'es');
  });
}

export function toggleExternalParticipantSelection(entries, candidate, enabled) {
  const normalizedEntries = normalizeExternalParticipants(entries);
  const normalizedCandidate = normalizeExternalParticipants([candidate])[0];
  if (!normalizedCandidate) return normalizedEntries;
  const candidateKey = `${normalizedCandidate.kind}:${normalizedCandidate.personId || normalizedCandidate.name.toLowerCase()}`;
  if (enabled) {
    if (normalizedEntries.some((entry) => `${entry.kind}:${entry.personId || entry.name.toLowerCase()}` === candidateKey)) {
      return normalizedEntries;
    }
    return [...normalizedEntries, normalizedCandidate];
  }
  return normalizedEntries.filter((entry) => `${entry.kind}:${entry.personId || entry.name.toLowerCase()}` !== candidateKey);
}

export function getVisitorProcessAvailability(form, settings) {
  const weekNumber = parseInt(String(form?.week || '0'), 10);
  const lateGraceWeeks = Math.max(0, parseInt(String(settings?.process_entry_late_weeks ?? '14'), 10) || 14);
  return {
    allowNoted: weekNumber === 2,
    allowLate: Number.isFinite(weekNumber) && weekNumber >= 3 && weekNumber <= (2 + lateGraceWeeks),
  };
}

export function getVisitorProcessOptions(form, settings, kind = 'amigo') {
  if (normalizeVisitorKind(kind) !== 'amigo') {
    return [{ value: 'none', label: 'Sin proceso' }];
  }
  const availability = getVisitorProcessAvailability(form, settings);
  return [
    { value: 'none', label: 'Sin proceso' },
    { value: 'noted', label: 'Al proceso', enabled: availability.allowNoted },
    { value: 'late', label: 'Tardio', enabled: availability.allowLate },
  ].filter((option) => option.value === 'none' || option.enabled);
}

export function getVisitorProcessStatusLabel(value) {
  const normalized = normalizeVisitorProcessEntry(value);
  if (normalized === 'late') return 'Proceso tardio';
  if (normalized === 'noted') return 'En proceso';
  return 'Sin proceso';
}

export function buildVisitorHistory(reports, cellNumber = '', currentReportId = '') {
  const activeCellNumber = String(cellNumber || '').trim();
  if (!activeCellNumber) {
    return [];
  }

  const visitorMap = new Map();
  (Array.isArray(reports) ? reports : [])
    .filter((report) => String(report?.cellNumber || report?.formData?.cellNumber || '').trim() === activeCellNumber)
    .forEach((report) => {
      const visitors = Array.isArray(report?.formData?.visitors) ? report.formData.visitors : [];
      visitors.forEach((visitor) => {
        const normalizedName = normalizeNameKey(visitor?.name);
        if (!normalizedName) {
          return;
        }
        const processEntry = normalizeVisitorProcessEntry(visitor?.processEntry, visitor?.kind, {
          lateRegistration: Boolean(visitor?.lateRegistration),
        });
        const previous = visitorMap.get(normalizedName) || {
          name: String(visitor?.name || '').trim(),
          invitedBy: '',
          phone: '',
          converted: false,
          kind: 'amigo',
          lateRegistration: false,
          processEntry: 'none',
          processRegisteredWeek: '',
          processRegisteredDate: '',
          visitCount: 0,
        };
        visitorMap.set(normalizedName, {
          name: previous.name || String(visitor?.name || '').trim(),
          invitedBy: String(visitor?.invitedBy || previous.invitedBy || '').trim(),
          phone: String(visitor?.phone || previous.phone || '').trim(),
          converted: Boolean(visitor?.converted) || Boolean(previous.converted),
          kind: normalizeVisitorKind(visitor?.kind || previous.kind),
          lateRegistration: Boolean(visitor?.lateRegistration) || Boolean(previous.lateRegistration),
          processEntry: previous.processEntry !== 'none' ? previous.processEntry : processEntry,
          processRegisteredWeek: previous.processRegisteredWeek || (processEntry !== 'none' ? String(report?.week || report?.formData?.week || '') : ''),
          processRegisteredDate: previous.processRegisteredDate || (processEntry !== 'none' ? String(report?.reportDate || report?.formData?.reportDate || '') : ''),
          visitCount: previous.visitCount + 1,
        });
      });
    });

  return Array.from(visitorMap.values()).sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
}

export function findVisitorHistoryEntry(visitorHistory, name = '') {
  const normalizedName = normalizeNameKey(name);
  if (!normalizedName) {
    return null;
  }
  return (Array.isArray(visitorHistory) ? visitorHistory : []).find((entry) => normalizeNameKey(entry?.name) === normalizedName) || null;
}

export function getQuarterWeekNumber(settings, dateValue = '') {
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

function isGracePeriodActive(settings) {
  const graceHours = parseInt(String(settings?.report_grace_hours ?? '0'), 10) || 0;
  if (graceHours <= 0) return false;
  const weekStartDay = parseInt(String(settings?.week_start_day ?? '0'), 10) || 0;
  const now = new Date();
  const rollover = new Date(now);
  rollover.setHours(0, 0, 0, 0);
  const diff = (rollover.getDay() - weekStartDay + 7) % 7;
  rollover.setDate(rollover.getDate() - diff);
  return (now.getTime() - rollover.getTime()) / 3600000 < graceHours;
}

function getReportWeek(report) {
  return String(report?.week || report?.formData?.week || '').trim();
}

function isReportVisuallyDraft(report) {
  return report?.formData?._draft === true || report?.formData?._draft === 'true';
}

function getQuarterFromDate(dateValue = '') {
  const month = Number(String(dateValue || '').slice(5, 7));
  if (!month || Number.isNaN(month)) return '1';
  if (month <= 4) return '1';
  if (month <= 8) return '2';
  return '3';
}

function getQuarterName(quarter) {
  if (String(quarter) === '1') return '1er Cuatrimestre';
  if (String(quarter) === '2') return '2do Cuatrimestre';
  return '3er Cuatrimestre';
}

function getQuarterRange(quarter) {
  if (String(quarter) === '1') return 'Ene-Abr';
  if (String(quarter) === '2') return 'May-Ago';
  return 'Sep-Dic';
}

export function buildReportHistoryState(reports = [], currentUser = null, settings = {}) {
  if (currentUser && (currentUser.isAdmin || currentUser.isSupervisor) && !currentUser.assignedCellNumber) {
    return {
      count: '—',
      showSeguimientoLink: true,
      cards: [],
    };
  }

  let visibleReports = Array.isArray(reports) ? [...reports] : [];
  const assignedCellNumber = String(currentUser?.assignedCellNumber || '').trim();
  if (assignedCellNumber) {
    visibleReports = visibleReports.filter((report) => String(report?.cellNumber || report?.formData?.cellNumber || '').trim() === assignedCellNumber);
  }

  const cycleStartStr = String(settings?.cycle_start_date || '').trim();
  if (cycleStartStr) {
    visibleReports = visibleReports.filter((report) => {
      const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
      return reportDate && reportDate >= cycleStartStr;
    });
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarterStartMonth = month <= 3 ? 0 : month <= 7 ? 4 : 8;
    visibleReports = visibleReports.filter((report) => {
      const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
      const reportYear = Number(reportDate.slice(0, 4));
      const reportMonth = Number(reportDate.slice(5, 7)) - 1;
      return reportYear === year && reportMonth >= quarterStartMonth && reportMonth < quarterStartMonth + 4;
    });
  }

  const groups = new Map();
  visibleReports.forEach((report) => {
    const cellNumber = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
    const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
    const year = reportDate.slice(0, 4) || '?';
    const quarter = getQuarterFromDate(reportDate);
    const key = `${cellNumber}:${year}:${quarter}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        cellNumber,
        year,
        quarter,
        quarterName: getQuarterName(quarter),
        quarterRange: getQuarterRange(quarter),
        reports: [],
      });
    }
    groups.get(key).reports.push(report);
  });

  const cards = Array.from(groups.values())
    .sort((left, right) => {
      if (left.cellNumber !== right.cellNumber) return Number(left.cellNumber || 0) - Number(right.cellNumber || 0);
      if (left.year !== right.year) return Number(right.year || 0) - Number(left.year || 0);
      return Number(right.quarter || 0) - Number(left.quarter || 0);
    })
    .map((group) => {
      const byWeek = new Map();
      group.reports.forEach((report) => {
        byWeek.set(String(report?.week || report?.formData?.week || ''), report);
      });
      const totalWeeks = getRcmTotalWeeks();
      const totalDone = Array.from(byWeek.values()).filter((report) => !isReportVisuallyDraft(report)).length;
      const progressPct = Math.round((totalDone / totalWeeks) * 100);
      const baptismCount = group.reports.reduce((sum, report) => {
        const baptisms = Array.isArray(report?.formData?.baptisms) ? report.formData.baptisms : [];
        return sum + baptisms.filter((entry) => String(getBaptismQuarter(entry?.baptismDate)) === String(group.quarter)).length;
      }, 0);

      return {
        key: group.key,
        cellNumber: group.cellNumber,
        year: group.year,
        quarter: group.quarter,
        quarterName: group.quarterName,
        quarterRange: group.quarterRange,
        totalWeeks,
        totalDone,
        progressPct,
        baptismCount,
        chips: Array.from({ length: totalWeeks }, (_item, index) => {
          const week = String(index + 1);
          const info = getRcmWeekInfo(week);
          const report = byWeek.get(week) || null;
          return {
            week,
            verb: info?.verb || (index + 1 === totalWeeks ? 'CIERRE' : ''),
            phase: String(info?.phase || 'GANAR').toLowerCase(),
            isEventWeek: Boolean(info?.isEventWeek),
            reportId: report?.id ? String(report.id) : '',
            reportDate: String(report?.reportDate || report?.formData?.reportDate || '').trim(),
            state: report ? (isReportVisuallyDraft(report) ? 'draft' : 'done') : 'pending',
          };
        }),
      };
    });

  return {
    count: String(visibleReports.length),
    showSeguimientoLink: false,
    cards,
  };
}

export function createWeekOptions(settings = {}, reports = [], cellNumber = '') {
  const realWeek = getQuarterWeekNumber(settings);
  const inGrace = isGracePeriodActive(settings);
  const activeCell = String(cellNumber || '').trim();
  const cycleStartStr = String(settings?.cycle_start_date || '').trim();
  const reportedPastWeeks = new Set();

  if (activeCell && cycleStartStr) {
    (Array.isArray(reports) ? reports : []).forEach((report) => {
      const reportCell = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
      if (reportCell !== activeCell) return;
      const reportWeek = Number(getReportWeek(report));
      if (!reportWeek || reportWeek > realWeek) return;
      const isDraft = report?.formData?._draft === true || report?.formData?._draft === 'true';
      if (isDraft) return;
      const reportDate = String(report?.reportDate || report?.formData?.reportDate || '').trim();
      if (!reportDate || reportDate < cycleStartStr) return;
      reportedPastWeeks.add(reportWeek);
    });
  }

  return Array.from({ length: getRcmTotalWeeks() }, (_value, index) => {
    const week = String(index + 1);
    const weekNumber = index + 1;
    const info = getRcmWeekInfo(week);
    const phaseLabel = info?.phaseLabel || 'Fase';
    const verbPart = info?.verb ? ` · ${info.verb}` : '';
    const eventMark = info?.isEventWeek ? ' ★' : '';
    let disabled = false;
    let note = '';

    if (weekNumber > realWeek) {
      disabled = true;
      note = ' (no disponible)';
    } else if (weekNumber < realWeek) {
      if (reportedPastWeeks.has(weekNumber)) {
        disabled = true;
        note = ' ✓ entregado';
      } else if (inGrace && weekNumber === realWeek - 1) {
        note = ' · gracia';
      } else {
        disabled = true;
        note = ' 🔒 cerrada';
      }
    } else if (reportedPastWeeks.has(weekNumber)) {
      note = ' ✓ entregado';
    }

    return {
      value: week,
      label: `${week} — ${phaseLabel}${verbPart}${eventMark}${note}`,
      disabled,
    };
  });
}

export function getPeopleByRole(catalogs, role) {
  const normalizedRole = String(role || '').trim();
  const people = Array.isArray(catalogs?.people) ? catalogs.people : [];
  const cells = Array.isArray(catalogs?.cells) ? catalogs.cells : [];
  const peopleById = new Map(people.map((person) => [String(person.id || ''), person]));
  const optionsById = new Map();

  people.forEach((person) => {
    const directRole = String(person.role || '').trim();
    const assignedRole = String(person.assignedRole || '').trim();
    const matches = directRole === normalizedRole
      || assignedRole === normalizedRole
      || (normalizedRole === 'leader' && Boolean(person.isLeader))
      || (normalizedRole === 'assistant' && Boolean(person.isAssistant))
      || (normalizedRole === 'host' && Boolean(person.isHost));
    if (!matches) return;
    optionsById.set(String(person.id || person.name || ''), person);
  });

  cells.forEach((cell) => {
    const personId = normalizedRole === 'leader'
      ? String(cell?.leaderPersonId || '').trim()
      : normalizedRole === 'assistant'
        ? String(cell?.assistantPersonId || '').trim()
        : String(cell?.hostPersonId || '').trim();
    if (!personId) return;
    const person = peopleById.get(personId);
    if (person) {
      optionsById.set(personId, person);
      return;
    }
    const fallbackName = normalizedRole === 'leader'
      ? String(cell?.leaderName || '').trim()
      : normalizedRole === 'assistant'
        ? String(cell?.assistantName || '').trim()
        : String(cell?.hostName || '').trim();
    if (!fallbackName) return;
    optionsById.set(`${normalizedRole}:${fallbackName}`, { id: `${normalizedRole}:${fallbackName}`, name: fallbackName, role: normalizedRole });
  });

  return Array.from(optionsById.values())
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
}

export function getVisibleCells(catalogs, currentUser) {
  if (!currentUser) {
    return catalogs?.cells || [];
  }
  const ownCell = String(currentUser?.assignedCellNumber || '').trim();
  if (currentUser?.isAdmin) {
    return catalogs?.cells || [];
  }
  return (catalogs?.cells || []).filter((cell) => String(cell.cellNumber || '').trim() === ownCell);
}

export function applyWeekMeta(form) {
  const info = getRcmWeekInfo(form.week);
  return {
    ...form,
    phaseLabel: info?.phaseLabel || '',
    phaseVerb: info?.verb || '',
  };
}

export function buildCellLinkedFields(catalogs, cellNumber) {
  const cell = findCellByNumber(catalogs, cellNumber);
  if (!cell) {
    return {
      sector: '',
      leaderName: '',
      assistantName: '',
      hostName: '',
      networkName: '',
      zoneName: '',
      districtName: '',
      address: '',
    };
  }

  return {
    sector: String(cell.sector || ''),
    leaderName: String(cell.leaderName || ''),
    assistantName: String(cell.assistantName || ''),
    hostName: String(cell.hostName || ''),
    networkName: String(cell.networkName || ''),
    zoneName: String(cell.zoneName || ''),
    districtName: String(cell.districtName || ''),
    address: String(cell.address || ''),
  };
}

export function getDefaultCellNumber(catalogs, currentUser) {
  const ownCell = String(currentUser?.assignedCellNumber || '').trim();
  if (ownCell && findCellByNumber(catalogs, ownCell)) return ownCell;
  return String(catalogs?.cells?.[0]?.cellNumber || '').trim();
}

export function buildInitialReportForm(catalogs, settings, currentUser, context, report = null) {
  const base = {
    ...createReportFormData(),
    reportDate: new Date().toISOString().slice(0, 10),
    week: String(getQuarterWeekNumber(settings)),
  };

  if (report) {
    const formData = report.formData || report;
    return applyWeekMeta({
      ...base,
      ...formData,
      memberAttendance: buildDefaultMemberAttendance(findCellByNumber(catalogs, formData.cellNumber || report.cellNumber), formData.memberAttendance, formData),
      visitors: normalizeVisitors(formData.visitors),
      kids: buildDefaultKidsAttendance(findCellByNumber(catalogs, formData.cellNumber || report.cellNumber), formData.kids),
      baptisms: normalizeBaptisms(formData.baptisms),
      externalParticipants: normalizeExternalParticipants(formData.externalParticipants || formData.externalParticipantsJson || formData.reachSupervisorVisits || formData.reachSupervisorVisitsJson),
      reachOffering: String(formData.reachOffering || '0'),
      week: String(formData.week || report.week || base.week),
      cellNumber: String(formData.cellNumber || report.cellNumber || ''),
    });
  }

  const seededCell = String(context?.cellNumber || getDefaultCellNumber(catalogs, currentUser) || '');
  const seededWeek = String(context?.week || base.week || '');
  const linkedFields = buildCellLinkedFields(catalogs, seededCell);

  return applyWeekMeta({
    ...base,
    ...linkedFields,
    memberAttendance: buildDefaultMemberAttendance(findCellByNumber(catalogs, seededCell)),
    visitors: normalizeVisitors([]),
    kids: buildDefaultKidsAttendance(findCellByNumber(catalogs, seededCell)),
    baptisms: normalizeBaptisms([]),
    externalParticipants: normalizeExternalParticipants([]),
    cellNumber: seededCell,
    week: seededWeek,
  });
}

export function applyCellToReportForm(form, catalogs) {
  const linkedFields = buildCellLinkedFields(catalogs, form.cellNumber);
  const activeCell = findCellByNumber(catalogs, form.cellNumber);
  return applyWeekMeta({
    ...form,
    ...linkedFields,
    memberAttendance: buildDefaultMemberAttendance(activeCell, form.memberAttendance),
    kids: buildDefaultKidsAttendance(activeCell, form.kids),
    externalParticipants: getReachExternalParticipants(form.externalParticipants, catalogs, activeCell),
  });
}

function derivePlanningStatus(entry) {
  if (entry.planningStatus === 'justified' || entry.planningStatus === 'absent' || entry.planningStatus === 'service') {
    return entry.planningStatus;
  }
  return entry.planningAttended ? 'present' : 'pending';
}

function deriveReachStatus(entry) {
  if (entry.reachStatus === 'justified' || entry.reachStatus === 'absent' || entry.reachStatus === 'service') {
    return entry.reachStatus;
  }
  return entry.reachAttended ? 'present' : 'pending';
}

function deriveSundayStatus(entry) {
  if (entry.sundayStatus === 'justified' || entry.sundayStatus === 'absent' || entry.sundayStatus === 'service') {
    return entry.sundayStatus;
  }
  return entry.sundayAttended ? 'present' : 'pending';
}

function deriveOverallStatus(entry) {
  const order = ['sundayStatus', 'reachStatus', 'planningStatus'];
  for (const field of order) {
    const value = String(entry?.[field] || '').toLowerCase();
    if (value && value !== 'pending') return value;
  }
  return 'pending';
}

export function normalizeKids(savedKids = []) {
  if (!Array.isArray(savedKids)) {
    return [];
  }
  return savedKids.map((kid) => ({
    personId: kid?.personId ?? null,
    name: String(kid?.name || ''),
    guardianName: String(kid?.guardianName || ''),
    source: kid?.source || (kid?.personId ? 'catalog' : 'visit'),
    reachAttended: Boolean(kid?.reachAttended),
    sundayAttended: Boolean(kid?.sundayAttended),
    note: String(kid?.note || ''),
  }));
}

export function buildDefaultKidsAttendance(cell, savedEntries = []) {
  const savedByKey = new Map(
    normalizeKids(savedEntries).map((entry) => [String(entry.personId || entry.name || ''), entry])
  );

  const catalogKids = getCellKids(cell).map((kid) => {
    const savedEntry = savedByKey.get(String(kid.id)) || savedByKey.get(String(kid.name));
    return {
      personId: kid.id,
      name: kid.name,
      guardianName: savedEntry?.guardianName || kid.guardianName || '',
      source: 'catalog',
      reachAttended: Boolean(savedEntry?.reachAttended),
      sundayAttended: Boolean(savedEntry?.sundayAttended),
      note: savedEntry?.note || '',
    };
  });

  const manualKids = normalizeKids(savedEntries).filter((entry) => entry.source !== 'catalog' && !entry.personId);
  return [...catalogKids, ...manualKids];
}

function isInProgressReportData(savedData) {
  if (!savedData || typeof savedData !== 'object') return false;
  if (savedData._draft === true || savedData._draft === 'true') return true;
  return Boolean(savedData.lastStage && savedData.lastStage !== 'cierre');
}

function savedMemberEntryHasActivity(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return Boolean(
    entry.planningAttended
    || entry.reachAttended
    || entry.sundayAttended
    || entry.reachPrivileged
    || (entry.planningStatus && entry.planningStatus !== 'pending')
    || (entry.reachStatus && entry.reachStatus !== 'pending')
    || (entry.sundayStatus && entry.sundayStatus !== 'pending')
    || String(entry.note || '').trim()
  );
}

function getReportMemberRoster(cell, savedEntries = [], savedData = null) {
  const currentMembers = getCellMembers(cell);
  const normalizedSavedEntries = Array.isArray(savedEntries)
    ? savedEntries.filter((entry) => String(entry?.personId || entry?.name || '').trim())
    : [];

  if (!normalizedSavedEntries.length) {
    return currentMembers;
  }

  const mapEntryToRosterMember = (entry) => {
    const catalogMember = currentMembers.find((member) => (
      String(member.id || '') === String(entry.personId || '')
      || String(member.name || '') === String(entry.name || '')
    ));
    return {
      id: entry.personId ?? catalogMember?.id ?? null,
      name: entry.name || catalogMember?.name || '',
      role: entry.role || catalogMember?.role || 'member',
      attendanceMode: entry.attendanceMode || catalogMember?.attendanceMode || 'normal',
      attendanceDefaults: entry.attendanceDefaults || catalogMember?.attendanceDefaults || {},
      rcmProgress: entry.rcmProgress || catalogMember?.rcmProgress || {},
    };
  };

  if (!isInProgressReportData(savedData)) {
    return normalizedSavedEntries.map(mapEntryToRosterMember);
  }

  const mergedRoster = currentMembers.map((member) => {
    const savedEntry = normalizedSavedEntries.find((entry) => (
      String(member.id || '') === String(entry.personId || '')
      || String(member.name || '') === String(entry.name || '')
    ));
    if (!savedEntry) return member;
    return {
      ...member,
      attendanceMode: savedEntry.attendanceMode || member.attendanceMode || 'normal',
      attendanceDefaults: savedEntry.attendanceDefaults || member.attendanceDefaults || {},
      rcmProgress: savedEntry.rcmProgress || member.rcmProgress || {},
    };
  });

  const currentKeys = new Set(mergedRoster.map((member) => String(member.id || member.name || '')));
  const preservedSavedMembers = normalizedSavedEntries
    .filter((entry) => !currentKeys.has(String(entry.personId || entry.name || '')) && savedMemberEntryHasActivity(entry))
    .map(mapEntryToRosterMember);

  return [...mergedRoster, ...preservedSavedMembers];
}

export function buildDefaultMemberAttendance(cell, savedEntries = [], savedData = null) {
  const savedByKey = new Map(
    (Array.isArray(savedEntries) ? savedEntries : []).map((entry) => [String(entry.personId || entry.name || ''), entry])
  );

  return getReportMemberRoster(cell, savedEntries, savedData).map((member) => {
    const savedEntry = savedByKey.get(String(member.id)) || savedByKey.get(String(member.name)) || null;
    const sanitizeStatus = (status, attended) => {
      const normalizedStatus = String(status || '').toLowerCase();
      if (!normalizedStatus) return attended ? 'present' : 'pending';
      return normalizedStatus;
    };
    const resolveAttended = (status, attended) => {
      if (attended === true || attended === false) return attended;
      return String(status || '').toLowerCase() === 'present';
    };
    const planningAttended = resolveAttended(savedEntry?.planningStatus, savedEntry?.planningAttended);
    const reachAttended = resolveAttended(savedEntry?.reachStatus, savedEntry?.reachAttended);
    const sundayAttended = resolveAttended(savedEntry?.sundayStatus, savedEntry?.sundayAttended);
    const planningStatus = sanitizeStatus(savedEntry?.planningStatus, planningAttended);
    const reachStatus = sanitizeStatus(savedEntry?.reachStatus, reachAttended);
    const sundayStatus = sanitizeStatus(savedEntry?.sundayStatus, sundayAttended);
    const attendanceMode = savedEntry?.attendanceMode || member.attendanceMode || 'normal';
    const attendanceDefaults = savedEntry?.attendanceDefaults || member.attendanceDefaults || {};
    const useJustifiedDefaults = !savedEntry && attendanceMode === 'justified_default';
    const entry = {
      personId: member.id,
      name: member.name,
      role: member.role,
      attendanceMode,
      attendanceDefaults,
      rcmProgress: savedEntry?.rcmProgress || member.rcmProgress || {},
      planningStatus: useJustifiedDefaults && attendanceDefaults.planning ? 'justified' : planningStatus,
      reachStatus: useJustifiedDefaults && attendanceDefaults.reach ? 'justified' : reachStatus,
      sundayStatus: useJustifiedDefaults && attendanceDefaults.sunday ? 'justified' : sundayStatus,
      status: 'pending',
      planningAttended,
      reachAttended,
      reachPrivileged: Boolean(savedEntry?.reachPrivileged),
      sundayAttended,
      note: String(savedEntry?.note || ''),
    };
    entry.status = deriveOverallStatus(entry);
    return entry;
  });
}

export function updatePlanningAttendance(entries, index, patch) {
  return entries.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const nextEntry = {
      ...entry,
      ...patch,
    };
    nextEntry.planningStatus = derivePlanningStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function updateReachAttendance(entries, index, patch) {
  return entries.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const nextEntry = {
      ...entry,
      ...patch,
    };
    nextEntry.reachStatus = deriveReachStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function updateMemberRcmEvent(entries, index, rcmKey, attended, reportDate = '') {
  const normalizedKey = String(rcmKey || '').trim();
  return entries.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const nextProgress = { ...(entry?.rcmProgress || {}) };
    if (normalizedKey) {
      if (attended) {
        nextProgress[normalizedKey] = String(reportDate || '').trim() || 'asistio';
      } else {
        delete nextProgress[normalizedKey];
      }
    }
    return {
      ...entry,
      rcmProgress: nextProgress,
    };
  });
}

export function updateSundayAttendance(entries, index, patch) {
  return entries.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const nextEntry = {
      ...entry,
      ...patch,
    };
    nextEntry.sundayStatus = deriveSundayStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function fillPlanningAttendance(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      planningAttended: true,
    };
    nextEntry.planningStatus = derivePlanningStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function clearPlanningAttendance(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      planningAttended: false,
    };
    nextEntry.planningStatus = derivePlanningStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function copyPlanningToReach(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      reachAttended: Boolean(entry.planningAttended),
    };
    if (!nextEntry.reachAttended) {
      nextEntry.reachPrivileged = false;
    }
    nextEntry.reachStatus = deriveReachStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function fillReachAttendance(entries, withPrivileges = false) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      reachAttended: true,
      reachPrivileged: withPrivileges ? true : Boolean(entry.reachPrivileged),
    };
    nextEntry.reachStatus = deriveReachStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function clearReachAttendance(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      reachAttended: false,
      reachPrivileged: false,
    };
    nextEntry.reachStatus = deriveReachStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function copyReachToSunday(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      sundayAttended: Boolean(entry.reachAttended),
    };
    nextEntry.sundayStatus = deriveSundayStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function fillSundayAttendance(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      sundayAttended: true,
    };
    nextEntry.sundayStatus = deriveSundayStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function clearSundayAttendance(entries) {
  return entries.map((entry) => {
    const nextEntry = {
      ...entry,
      sundayAttended: false,
    };
    nextEntry.sundayStatus = deriveSundayStatus(nextEntry);
    nextEntry.status = deriveOverallStatus(nextEntry);
    return nextEntry;
  });
}

export function getPlanningSummary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const presentCount = list.filter((entry) => entry.planningAttended).length;
  return {
    totalMembers: list.length,
    presentCount,
    absentCount: Math.max(0, list.length - presentCount),
  };
}

export function getReachSummary(memberEntries, visitors, externalParticipants = [], catalogs = null, cellNumber = '') {
  const members = Array.isArray(memberEntries) ? memberEntries : [];
  const visitorList = Array.isArray(visitors) ? visitors : [];
  const externalList = getReachExternalParticipants(externalParticipants, catalogs, cellNumber);
  return {
    membersPresent: members.filter((entry) => entry.reachAttended).length + externalList.length,
    privilegedMembers: members.filter((entry) => entry.reachPrivileged).length,
    visitorsPresent: visitorList.filter((visitor) => visitor.reachAttended).length,
    conversions: visitorList.filter((visitor) => visitor.converted).length,
    externalParticipants: externalList.length,
  };
}

export function getSundaySummary(memberEntries, visitors, kids) {
  const members = Array.isArray(memberEntries) ? memberEntries : [];
  const visitorList = Array.isArray(visitors) ? visitors : [];
  const kidList = Array.isArray(kids) ? kids : [];
  const membersPresent = members.filter((entry) => entry.sundayAttended).length;
  const visitorsPresent = visitorList.filter((visitor) => visitor.sundayAttended).length;
  const kidsPresent = kidList.filter((kid) => kid.sundayAttended).length;
  return {
    membersPresent,
    visitorsPresent,
    kidsPresent,
    totalPresent: membersPresent + visitorsPresent + kidsPresent,
  };
}

export function getWeeklySummary(form) {
  const members = Array.isArray(form?.memberAttendance) ? form.memberAttendance : [];
  const namedVisitors = normalizeVisitors(form?.visitors).filter((visitor) => String(visitor.name || '').trim());
  const namedKids = normalizeKids(form?.kids).filter((kid) => String(kid.name || '').trim());
  const baptisms = normalizeBaptisms(form?.baptisms).filter((entry) => entry.name);
  const reachExternalParticipants = getReachExternalParticipants(form?.externalParticipants, null, form?.cellNumber);
  const counts = {
    totalMembers: members.length,
    planningMembersPresent: 0,
    planningMembersAbsent: 0,
    reachMembersPresent: 0,
    reachPrivilegedMembers: 0,
    reachFriendsPresent: 0,
    reachConversions: 0,
    reachKidsPresent: 0,
    reachSupervisorVisits: 0,
    sundayMembersPresent: 0,
    sundayFriendsPresent: 0,
    sundayKidsPresent: 0,
    sundayTotal: 0,
    reachTotal: 0,
    winSpiritualParents: 0,
    winFriendsContacted: namedVisitors.length,
    winRiseEventFriends: 0,
    winBaptizedFriends: baptisms.length,
  };

  members.forEach((entry) => {
    if (entry.planningAttended) counts.planningMembersPresent += 1;
    if (entry.reachAttended) counts.reachMembersPresent += 1;
    if (entry.reachPrivileged) counts.reachPrivilegedMembers += 1;
    if (entry.sundayAttended) counts.sundayMembersPresent += 1;
  });
  counts.planningMembersAbsent = Math.max(0, counts.totalMembers - counts.planningMembersPresent);
  counts.reachSupervisorVisits = reachExternalParticipants.length;
  counts.reachMembersPresent += counts.reachSupervisorVisits;

  const spiritualParentsSet = new Set();
  namedVisitors.forEach((visitor) => {
    if (visitor.reachAttended) counts.reachFriendsPresent += 1;
    if (visitor.sundayAttended) counts.sundayFriendsPresent += 1;
    if (visitor.converted) counts.reachConversions += 1;
    if (visitor.invitedBy) spiritualParentsSet.add(visitor.invitedBy);
    if (visitor.eventAttended) counts.winRiseEventFriends += 1;
  });
  counts.winSpiritualParents = spiritualParentsSet.size;

  namedKids.forEach((kid) => {
    if (kid.reachAttended) counts.reachKidsPresent += 1;
    if (kid.sundayAttended) counts.sundayKidsPresent += 1;
  });

  counts.sundayTotal = counts.sundayMembersPresent + counts.sundayFriendsPresent + counts.sundayKidsPresent;
  counts.reachTotal = counts.reachMembersPresent + counts.reachFriendsPresent;
  return counts;
}

export function computeBaptismMetrics(reports, form, reportId = '') {
  const currentCell = String(form?.cellNumber || '').trim();
  const currentYear = String(form?.reportDate || '').slice(0, 4);
  const currentBaptisms = normalizeBaptisms(form?.baptisms);
  const historicalBaptisms = (Array.isArray(reports) ? reports : [])
    .filter((report) => String(report?.id || '') !== String(reportId || ''))
    .filter((report) => String(report?.cellNumber || report?.formData?.cellNumber || '') === currentCell)
    .filter((report) => String(report?.reportDate || report?.formData?.reportDate || '').slice(0, 4) === currentYear)
    .flatMap((report) => normalizeBaptisms(report?.formData?.baptisms));

  const counts = { 1: 0, 2: 0, 3: 0, total: 0 };
  [...historicalBaptisms, ...currentBaptisms].forEach((entry) => {
    const quarter = getBaptismQuarter(entry.baptismDate);
    if (quarter >= 1 && quarter <= 3) {
      counts[quarter] += 1;
      counts.total += 1;
    }
  });
  return counts;
}

export function addBaptism(baptisms, baptismForm) {
  const name = String(baptismForm?.name || '').trim();
  if (!name) {
    const nextEntry = normalizeBaptisms([baptismForm])[0] || createBaptismQuickForm();
    return [
      ...(Array.isArray(baptisms) ? baptisms : []),
      nextEntry,
    ];
  }
  return [
    ...(Array.isArray(baptisms) ? baptisms : []),
    ...normalizeBaptisms([{
      ...baptismForm,
      name: String(baptismForm?.name || '').trim(),
    }]),
  ];
}

export function updateBaptism(baptisms, index, patch) {
  return normalizeBaptisms((Array.isArray(baptisms) ? baptisms : []).map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    return {
      ...entry,
      ...patch,
      name: patch.name !== undefined ? String(patch.name || '').trim() : entry.name,
      baptismDate: patch.baptismDate !== undefined ? String(patch.baptismDate || '').trim() : entry.baptismDate,
      note: patch.note !== undefined ? String(patch.note || '').trim() : entry.note,
    };
  }));
}

export function removeBaptism(baptisms, index) {
  return (Array.isArray(baptisms) ? baptisms : []).filter((_entry, entryIndex) => entryIndex !== index);
}

export function updateKid(kids, index, patch) {
  return normalizeKids((Array.isArray(kids) ? kids : []).map((kid, kidIndex) => {
    if (kidIndex !== index) return kid;
    return {
      ...kid,
      ...patch,
      guardianName: patch.guardianName !== undefined ? String(patch.guardianName || '').trim() : kid.guardianName,
      note: patch.note !== undefined ? String(patch.note || '').trim() : kid.note,
    };
  }));
}

export function copyKidReachToSunday(kids) {
  return normalizeKids((Array.isArray(kids) ? kids : []).map((kid) => ({
    ...kid,
    sundayAttended: Boolean(kid.reachAttended),
  })));
}

export function fillSundayKids(kids) {
  return normalizeKids((Array.isArray(kids) ? kids : []).map((kid) => ({
    ...kid,
    sundayAttended: true,
  })));
}

export function clearKidActivities(kids) {
  return normalizeKids((Array.isArray(kids) ? kids : []).map((kid) => ({
    ...kid,
    reachAttended: false,
    sundayAttended: false,
  })));
}

export function clearVisitorActivities(visitors) {
  return normalizeVisitors((Array.isArray(visitors) ? visitors : []).map((visitor) => ({
    ...visitor,
    reachAttended: false,
    sundayAttended: false,
  })));
}

function normalizeNameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function createKidQuickForm() {
  return {
    name: '',
    guardianName: '',
    reachAttended: true,
    sundayAttended: false,
  };
}

export function addKid(kids, kidForm) {
  const name = String(kidForm?.name || '').trim();
  if (!name) {
    throw new Error('Escribe el nombre del niño para agregarlo.');
  }
  const normalizedKey = normalizeNameKey(name);
  const duplicate = normalizeKids(kids).find((kid) => normalizeNameKey(kid.name) === normalizedKey);
  if (duplicate) {
    throw new Error(`Ya hay un niño registrado con el nombre "${duplicate.name}". Usa un nombre distinto (p. ej. agrega apellido).`);
  }
  return [
    ...(Array.isArray(kids) ? kids : []),
    {
      personId: null,
      name,
      guardianName: String(kidForm?.guardianName || '').trim(),
      source: 'visit',
      reachAttended: Boolean(kidForm?.reachAttended),
      sundayAttended: Boolean(kidForm?.sundayAttended),
      note: '',
    },
  ];
}

export function removeKid(kids, index) {
  return (Array.isArray(kids) ? kids : []).filter((_kid, kidIndex) => kidIndex !== index);
}

export function createVisitorQuickForm() {
  return {
    historySelection: '',
    name: '',
    kind: 'amigo',
    invitedBy: '',
    reachAttended: true,
    sundayAttended: false,
    eventAttended: false,
    firstVisit: false,
    processEntry: 'none',
    converted: false,
    phone: '',
    note: '',
  };
}

export function buildInvitedByOptions(form, catalogs = null) {
  const memberNames = (Array.isArray(form?.memberAttendance) ? form.memberAttendance : [])
    .map((entry) => String(entry?.name || '').trim())
    .filter(Boolean);
  const fallbackNames = memberNames.length
    ? memberNames
    : (Array.isArray(catalogs?.people) ? catalogs.people : [])
      .filter((person) => String(person?.role || '').trim().toLowerCase() !== 'kid')
      .map((person) => String(person?.name || '').trim())
      .filter(Boolean);
  return [...new Set(fallbackNames)]
    .sort((left, right) => left.localeCompare(right, 'es'))
    .map((value) => ({ value, label: value }));
}

export function addVisitor(visitors, visitorForm) {
  const normalizedName = String(visitorForm.name || '').trim();
  if (!normalizedName) {
    throw new Error('Escribe el nombre de la visita para agregarla.');
  }
  return [
    ...(Array.isArray(visitors) ? visitors : []),
    buildVisitorEntry({
      ...createVisitorQuickForm(),
      ...visitorForm,
      name: normalizedName,
      invitedBy: String(visitorForm.invitedBy || '').trim(),
      phone: String(visitorForm.phone || '').trim(),
      note: String(visitorForm.note || '').trim(),
    }),
  ];
}

export function updateVisitor(visitors, index, patch) {
  return normalizeVisitors((Array.isArray(visitors) ? visitors : []).map((visitor, visitorIndex) => {
    if (visitorIndex !== index) return visitor;
    return buildVisitorEntry({
      ...visitor,
      ...patch,
      name: patch.name !== undefined ? String(patch.name || '').trim() : visitor.name,
      invitedBy: patch.invitedBy !== undefined ? String(patch.invitedBy || '').trim() : visitor.invitedBy,
      phone: patch.phone !== undefined ? String(patch.phone || '').trim() : visitor.phone,
      note: patch.note !== undefined ? String(patch.note || '').trim() : visitor.note,
    });
  }));
}

export function removeVisitor(visitors, index) {
  return (Array.isArray(visitors) ? visitors : []).filter((_entry, entryIndex) => entryIndex !== index);
}

export function buildReportPayload(form, options = {}) {
  const externalParticipants = normalizeExternalParticipants(form.externalParticipants);
  const reachSupervisorVisits = getLegacyReachSupervisorVisits(externalParticipants, null, form.cellNumber);
  const attendanceSummary = getWeeklySummary({
    ...form,
    externalParticipants,
  });
  const isDraft = options.isDraft !== undefined ? Boolean(options.isDraft) : true;
  const lastStage = String(options.lastStage || '').trim() || 'encabezado';
  const rcmSnapshot = buildReportRcmSnapshot(form.week);
  return {
    ...createReportFormData(),
    ...form,
    week: String(form.week || '').trim(),
    cellNumber: String(form.cellNumber || '').trim(),
    sector: String(form.sector || '').trim(),
    leaderName: String(form.leaderName || '').trim(),
    assistantName: String(form.assistantName || '').trim(),
    hostName: String(form.hostName || '').trim(),
    reportDate: String(form.reportDate || '').trim(),
    networkName: String(form.networkName || '').trim(),
    zoneName: String(form.zoneName || '').trim(),
    districtName: String(form.districtName || '').trim(),
    address: String(form.address || '').trim(),
    notes: String(form.notes || '').trim(),
    reachOffering: String(form.reachOffering || '0').trim() || '0',
    supervisionNetwork: String(form.supervisionNetwork || '0').trim() || '0',
    supervisionSector: String(form.supervisionSector || reachSupervisorVisits.length || '0').trim() || '0',
    supervisionZone: String(form.supervisionZone || '0').trim() || '0',
    supervisionRegion: String(form.supervisionRegion || '0').trim() || '0',
    supervisionArea: String(form.supervisionArea || '0').trim() || '0',
    memberAttendance: Array.isArray(form.memberAttendance) ? form.memberAttendance : [],
    visitors: Array.isArray(form.visitors) ? form.visitors : [],
    kids: Array.isArray(form.kids) ? form.kids : [],
    baptisms: Array.isArray(form.baptisms) ? form.baptisms : [],
    externalParticipants,
    attendanceSummary,
    planningMembersPresent: attendanceSummary.planningMembersPresent,
    planningMembersAbsent: attendanceSummary.planningMembersAbsent,
    reachMembersPresent: attendanceSummary.reachMembersPresent,
    reachPrivilegedMembers: attendanceSummary.reachPrivilegedMembers,
    reachFriendsPresent: attendanceSummary.reachFriendsPresent,
    reachConversions: attendanceSummary.reachConversions,
    reachKidsPresent: attendanceSummary.reachKidsPresent,
    multiplySundayAttendance: attendanceSummary.sundayTotal,
    winSpiritualParents: attendanceSummary.winSpiritualParents,
    winFriendsContacted: attendanceSummary.winFriendsContacted,
    winRiseEventFriends: attendanceSummary.winRiseEventFriends,
    winBaptizedFriends: attendanceSummary.winBaptizedFriends,
    reachSupervisorVisits,
    rcmSnapshot,
    _draft: isDraft,
    lastStage,
  };
}

export function countBaptismsToPromote(baptisms = []) {
  return normalizeBaptisms(baptisms).filter((entry) => entry.name && entry.promoteToMember).length;
}