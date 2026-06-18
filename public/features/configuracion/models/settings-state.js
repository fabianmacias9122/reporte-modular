import { getRcmTotalWeeks, getRcmWeekInfo, getRcmWeeksDefaultClone, titleCase } from '../../../core/rcm/index.js';

const HISTORY_SCOPE_STORAGE_KEY = 'historyScope';

export function createSettingsState() {
  return {
    cycle_start_date: '',
    week_start_day: '0',
    report_grace_hours: '0',
    process_entry_late_weeks: '14',
    rcm_goal_levantate: '4',
    rcm_goal_restauracion: '3',
    rcm_goal_bautismos: '2',
    rcm_weeks_config: '[]',
  };
}

export function createStatusState() {
  return {
    cycle: emptyStatus(),
    goals: emptyStatus(),
    preferences: emptyStatus(),
    verbs: emptyStatus(),
  };
}

function emptyStatus() {
  return {
    message: '',
    isError: false,
  };
}

export function createPreferencesState() {
  return {
    history_scope: loadHistoryScope(),
  };
}

export function normalizeSettingsPayload(payload) {
  const state = createSettingsState();
  return {
    ...state,
    ...(payload || {}),
  };
}

export function normalizeRcmWeeksConfig(rawConfig) {
  const baseWeeks = getRcmWeeksDefaultClone();
  if (!rawConfig) return baseWeeks;

  let parsedConfig = rawConfig;
  if (typeof parsedConfig === 'string') {
    try {
      parsedConfig = JSON.parse(parsedConfig);
    } catch {
      return baseWeeks;
    }
  }

  if (!Array.isArray(parsedConfig) || parsedConfig.length === 0) {
    return baseWeeks;
  }

  const isFullConfig = parsedConfig.every((entry) => (
    entry && typeof entry === 'object'
    && typeof entry.phase === 'string'
    && typeof entry.verb === 'string'
    && Number.isInteger(entry.week)
  ));

  if (isFullConfig) {
    return [...parsedConfig]
      .sort((left, right) => left.week - right.week)
      .map((entry, index) => ({
        week: index + 1,
        phase: String(entry.phase || 'GANAR').toUpperCase(),
        phaseLabel: entry.phaseLabel || titleCase(entry.phase || 'Ganar'),
        verb: String(entry.verb || ''),
        verbDesc: String(entry.verbDesc || ''),
        event: entry.event || null,
        eventType: entry.eventType || null,
        purpose: entry.purpose || null,
        rcmKey: entry.rcmKey || null,
      }));
  }

  parsedConfig.forEach((override) => {
    const entry = baseWeeks.find((weekEntry) => weekEntry.week === override.week);
    if (!entry) return;
    if (override.verb !== undefined) entry.verb = override.verb || entry.verb;
    if (override.verbDesc !== undefined) entry.verbDesc = override.verbDesc;
    if (override.event !== undefined) entry.event = override.event || null;
    if (override.eventType !== undefined) entry.eventType = override.eventType || null;
    if (override.purpose !== undefined) entry.purpose = override.purpose || null;
    if (override.phase !== undefined && override.phase) {
      entry.phase = String(override.phase).toUpperCase();
      entry.phaseLabel = override.phaseLabel || titleCase(override.phase);
    }
  });

  return baseWeeks;
}

export function serializeRcmWeeksConfig(weeks) {
  return JSON.stringify(Array.isArray(weeks) ? weeks : []);
}

export function createRcmWeekEntry(nextWeekNumber, previousEntry = null) {
  const fallbackPhase = String(previousEntry?.phase || 'DISCIPULAR').toUpperCase();
  return {
    week: nextWeekNumber,
    phase: fallbackPhase,
    phaseLabel: titleCase(fallbackPhase),
    verb: '',
    verbDesc: '',
    event: null,
    eventType: null,
    purpose: null,
    rcmKey: null,
  };
}

export function renumberRcmWeeks(weeks) {
  return (Array.isArray(weeks) ? weeks : []).map((entry, index) => ({
    ...entry,
    week: index + 1,
    phase: String(entry.phase || 'GANAR').toUpperCase(),
    phaseLabel: entry.phaseLabel || titleCase(entry.phase || 'Ganar'),
  }));
}

export function updateRcmWeekEntry(weeks, weekNumber, changes = {}) {
  return renumberRcmWeeks((Array.isArray(weeks) ? weeks : []).map((entry) => {
    if (entry.week !== weekNumber) return entry;
    const nextPhase = changes.phase !== undefined ? String(changes.phase || entry.phase || 'GANAR').toUpperCase() : entry.phase;
    return {
      ...entry,
      ...changes,
      phase: nextPhase,
      phaseLabel: changes.phaseLabel || titleCase(nextPhase),
    };
  }));
}

function getPositiveNumber(value, fallback) {
  const parsedValue = parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsedValue)) return fallback;
  return Math.max(0, parsedValue);
}

export function getSettingsGoalsSummary(settings) {
  return [
    {
      key: 'levantate',
      label: 'Levantate',
      value: getPositiveNumber(settings.rcm_goal_levantate, 4),
    },
    {
      key: 'restauracion',
      label: 'Restauracion',
      value: getPositiveNumber(settings.rcm_goal_restauracion, 3),
    },
    {
      key: 'bautismos',
      label: 'Bautismos',
      value: getPositiveNumber(settings.rcm_goal_bautismos, 2),
    },
  ];
}

export function getCurrentQuarterSummary(referenceDate = new Date()) {
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  const quarters = [
    { q: 1, label: 'Q1', months: 'Ene-Abr', start: 0, end: 3 },
    { q: 2, label: 'Q2', months: 'May-Ago', start: 4, end: 7 },
    { q: 3, label: 'Q3', months: 'Sep-Dic', start: 8, end: 11 },
  ];
  const currentQuarter = quarters.find((quarter) => month >= quarter.start && month <= quarter.end) || quarters[0];
  const quarterStart = new Date(year, currentQuarter.start, 1);
  const quarterEnd = new Date(year, currentQuarter.end + 1, 0);
  const formatRangeDate = (value) => value.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  return {
    label: `${currentQuarter.label} ${year}`,
    months: currentQuarter.months,
    dateRange: `${formatRangeDate(quarterStart)} al ${formatRangeDate(quarterEnd)}`,
  };
}

export function getWeekPreviewSummary(settings, referenceDate = new Date()) {
  const cycleStartValue = String(settings.cycle_start_date || '').trim();
  if (!cycleStartValue) {
    return {
      status: 'empty',
      title: 'Semana actual',
      detail: 'Ingresa una fecha para ver la semana actual y el cierre estimado del ciclo.',
      meta: '',
    };
  }

  const cycleStart = new Date(`${cycleStartValue}T00:00:00`);
  if (Number.isNaN(cycleStart.getTime())) {
    return {
      status: 'invalid',
      title: 'Semana actual',
      detail: 'La fecha de inicio no es valida.',
      meta: '',
    };
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  cycleStart.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - cycleStart) / 86400000);

  if (diffDays < 0) {
    const daysLeft = Math.abs(diffDays);
    return {
      status: 'pending',
      title: 'Semana actual',
      detail: `El ciclo inicia en ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}.`,
      meta: '',
    };
  }

  const totalWeeks = getRcmTotalWeeks();
  const currentWeek = Math.max(1, Math.min(totalWeeks, Math.floor(diffDays / 7) + 1));
  const weekInfo = getRcmWeekInfo(currentWeek);
  const endDate = new Date(cycleStart);
  endDate.setDate(endDate.getDate() + (totalWeeks - 1) * 7 - 1);
  const daysToEnd = Math.floor((endDate - today) / 86400000);
  const formatShortDate = (value) => value.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const phaseLabel = weekInfo ? `${weekInfo.phaseLabel} - ${weekInfo.verb}` : 'Sin fase';
  const endMessage = daysToEnd >= 0
    ? `Fin estimado ${formatShortDate(endDate)} (${daysToEnd} dias restantes)`
    : `Ciclo finalizado hace ${Math.abs(daysToEnd)} dias`;

  return {
    status: 'active',
    title: `Semana ${currentWeek}`,
    detail: phaseLabel,
    meta: `Inicio ${formatShortDate(cycleStart)} · ${endMessage}`,
  };
}

export function loadHistoryScope() {
  try {
    const value = localStorage.getItem(HISTORY_SCOPE_STORAGE_KEY);
    return value === 'all' ? 'all' : 'current';
  } catch {
    return 'current';
  }
}

export function saveHistoryScope(value) {
  const nextValue = value === 'all' ? 'all' : 'current';
  try {
    localStorage.setItem(HISTORY_SCOPE_STORAGE_KEY, nextValue);
  } catch {
    // ignore storage failures in local preview mode
  }
  return nextValue;
}

export function getGoalsScopeLabel(currentUser, referenceDate = new Date()) {
  const quarter = referenceDate.getMonth() <= 3 ? 1 : referenceDate.getMonth() <= 7 ? 2 : 3;
  const scopeParts = [`Q${quarter}/${referenceDate.getFullYear()}`];

  if (currentUser?.assignedCellNumber) {
    scopeParts.push(`Celula ${currentUser.assignedCellNumber}`);
  } else if (currentUser?.isSupervisor && currentUser?.supervisedSector) {
    scopeParts.push(`Sector ${currentUser.supervisedSector}`);
  } else {
    scopeParts.push('Metas generales');
  }

  return scopeParts.join(' · ');
}

export function getCurrentQuarter(referenceDate = new Date()) {
  return referenceDate.getMonth() <= 3 ? 1 : referenceDate.getMonth() <= 7 ? 2 : 3;
}