const DEFAULT_RCM_WEEKS = [
  { week: 1, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'ORAR', verbDesc: 'Intercesión por las almas — pedir a Dios un amigo específico.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 2, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'ANOTAR', verbDesc: 'Registrar al amigo/familiar y asumir responsabilidad espiritual.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 3, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'CONTACTAR', verbDesc: 'Visitar o llamar al contacto e invitar al proceso.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 4, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'CONFIRMAR', verbDesc: 'Asegurar la asistencia al evento Levántate.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 5, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'DESATAR', verbDesc: 'Oración de guerra espiritual para romper cadenas.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 6, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'LLEVAR', verbDesc: 'Llevar al invitado a la Fiesta del Amigo / evento Levántate.', event: 'Levántate', eventType: 'Evangelístico', purpose: 'Primer llamado y atención a necesidades personales, familiares y espirituales.', rcmKey: 'levantate', captureMode: 'separate', specialEvents: [{ event: 'Levántate', eventType: 'Evangelístico', purpose: 'Primer llamado y atención a necesidades personales, familiares y espirituales.', rcmKey: 'levantate', captureMode: 'separate' }] },
  { week: 7, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'MOTIVAR', verbDesc: 'Animación para asistir al Encuentro / Restauración.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 8, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'INTEGRAR', verbDesc: 'Incorporar al amigo a la célula, cultos y fraternidades.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 9, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'CONSOLIDAR', verbDesc: 'Afirmar la fe del nuevo creyente.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 10, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'PREPARAR', verbDesc: 'Preparación para el encuentro con Dios.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 11, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'SANTIFICAR', verbDesc: 'Consagración para el Evento de Restauración (Encuentro).', event: 'Restauración', eventType: 'Sanidad interior y liberación espiritual', purpose: 'Sanar áreas internas y fortalecer la fe.', rcmKey: 'restauracion', captureMode: 'separate', specialEvents: [{ event: 'Restauración', eventType: 'Sanidad interior y liberación espiritual', purpose: 'Sanar áreas internas y fortalecer la fe.', rcmKey: 'restauracion', captureMode: 'separate' }] },
  { week: 12, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'MATRICULAR', verbDesc: 'Inscripción al discipulado.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 13, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'CONSERVAR', verbDesc: 'Cuidado del nuevo convertido.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 14, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'DOCTRINAR', verbDesc: 'Enseñanza de los fundamentos de la fe.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 15, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'DISCIPULAR', verbDesc: 'Formación como nuevo líder/discípulo.', event: null, eventType: null, purpose: null, specialEvents: [] },
  { week: 16, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'BAUTIZAR', verbDesc: 'La Pesca Milagrosa — Evento de Bautismos en agua.', event: 'Cielos Abiertos', eventType: 'Bautismos en agua', purpose: 'Bautismos, llenura espiritual y envío al discipulado.', rcmKey: 'cielosAbiertos', captureMode: 'separate', specialEvents: [{ event: 'Cielos Abiertos', eventType: 'Bautismos en agua', purpose: 'Bautismos, llenura espiritual y envío al discipulado.', rcmKey: 'cielosAbiertos', captureMode: 'separate' }] },
];

export const RCM_EVENT_CAPTURE_MODE_OPTIONS = Object.freeze([
  { value: 'separate', label: 'Aparte' },
  { value: 'reach', label: 'En alcance' },
  { value: 'sunday', label: 'En culto' },
]);

function cloneWeeks(weeks = []) {
  return weeks.map((entry) => ({
    ...entry,
    specialEvents: Array.isArray(entry?.specialEvents)
      ? entry.specialEvents.map((specialEvent) => ({ ...specialEvent }))
      : [],
  }));
}

function normalizeEventName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildDerivedRcmKey(eventName) {
  const parts = normalizeEventName(eventName)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  return parts
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('');
}

export function normalizeRcmCaptureMode(value, hasEvent = true) {
  if (!hasEvent) return null;
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (normalizedValue === 'reach' || normalizedValue === 'sunday' || normalizedValue === 'separate') {
    return normalizedValue;
  }
  return 'separate';
}

export function normalizeRcmSpecialEvents(events, fallbackEntry = null) {
  const rawEvents = Array.isArray(events)
    ? events
    : (fallbackEntry?.event ? [{
      event: fallbackEntry.event,
      eventType: fallbackEntry.eventType,
      purpose: fallbackEntry.purpose,
      rcmKey: fallbackEntry.rcmKey,
      captureMode: fallbackEntry.captureMode,
    }] : []);

  return rawEvents
    .map((entry) => {
      const resolved = resolveRcmEventPreset(entry?.event);
      const eventName = String(entry?.event ?? resolved.event ?? '').trim();
      if (!eventName) return null;
      return {
        event: resolved.event || eventName,
        eventType: entry?.eventType ?? resolved.eventType,
        purpose: entry?.purpose ?? resolved.purpose,
        rcmKey: String(entry?.rcmKey || resolved.rcmKey || buildDerivedRcmKey(eventName) || '').trim() || null,
        captureMode: normalizeRcmCaptureMode(entry?.captureMode ?? resolved.captureMode, true),
      };
    })
    .filter(Boolean);
}

export function getPrimaryRcmSpecialEvent(entry) {
  const events = normalizeRcmSpecialEvents(entry?.specialEvents, entry);
  return events[0] || null;
}

export const RCM_WEEKS = cloneWeeks(DEFAULT_RCM_WEEKS);

const RCM_EVENT_PRESETS = Object.freeze(
  DEFAULT_RCM_WEEKS
    .filter((entry) => entry && entry.event && entry.rcmKey)
    .reduce((presets, entry) => {
      presets[normalizeEventName(entry.event)] = {
        event: entry.event,
        eventType: entry.eventType || null,
        purpose: entry.purpose || null,
        rcmKey: entry.rcmKey || null,
        captureMode: normalizeRcmCaptureMode(entry.captureMode, true),
      };
      return presets;
    }, {})
);

export function titleCase(value) {
  const normalizedValue = String(value || '').toLowerCase();
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

export function resolveRcmEventPreset(eventName) {
  const normalizedName = normalizeEventName(eventName);
  if (!normalizedName) {
    return {
      event: null,
      eventType: null,
      purpose: null,
      rcmKey: null,
      captureMode: null,
    };
  }
  const preset = RCM_EVENT_PRESETS[normalizedName];
  if (!preset) {
    return {
      event: String(eventName || '').trim(),
      eventType: null,
      purpose: null,
      rcmKey: buildDerivedRcmKey(eventName),
      captureMode: 'separate',
    };
  }
  return { ...preset };
}

function withResolvedEventMetadata(entry) {
  const specialEvents = normalizeRcmSpecialEvents(entry?.specialEvents, entry);
  const primaryEvent = specialEvents[0] || null;
  return {
    ...entry,
    specialEvents,
    event: primaryEvent?.event || null,
    eventType: primaryEvent?.eventType ?? null,
    purpose: primaryEvent?.purpose ?? null,
    rcmKey: primaryEvent?.rcmKey ?? null,
    captureMode: primaryEvent?.captureMode ?? null,
  };
}

export function getRcmWeeks() {
  return RCM_WEEKS;
}

export function getRcmWeeksDefaultClone() {
  return cloneWeeks(DEFAULT_RCM_WEEKS);
}

export function resetRcmWeeks() {
  RCM_WEEKS.length = 0;
  getRcmWeeksDefaultClone().forEach((entry) => RCM_WEEKS.push(entry));
  return RCM_WEEKS;
}

export function getRcmTotalWeeks() {
  return RCM_WEEKS.length;
}

export function getPhaseWeekRanges() {
  const ranges = {};
  RCM_WEEKS.forEach((weekEntry) => {
    const range = ranges[weekEntry.phase];
    if (!range) {
      ranges[weekEntry.phase] = { weekStart: weekEntry.week, weekEnd: weekEntry.week };
      return;
    }
    if (weekEntry.week < range.weekStart) range.weekStart = weekEntry.week;
    if (weekEntry.week > range.weekEnd) range.weekEnd = weekEntry.week;
  });
  return ranges;
}

export function getRcmWeekInfo(weekNumber) {
  const parsedWeek = parseInt(weekNumber, 10);
  const maxWeek = getRcmTotalWeeks();
  if (!parsedWeek || parsedWeek < 1 || parsedWeek > maxWeek) return null;
  const info = RCM_WEEKS.find((entry) => entry.week === parsedWeek);
  if (!info) return null;
  const range = getPhaseWeekRanges()[info.phase];
  return { ...info, ...range, isEventWeek: Array.isArray(info.specialEvents) ? info.specialEvents.length > 0 : Boolean(info.event) };
}

export function applyRcmWeeksConfig(rawConfig) {
  if (!rawConfig) return RCM_WEEKS;

  let parsedConfig = rawConfig;
  if (typeof parsedConfig === 'string') {
    try {
      parsedConfig = JSON.parse(parsedConfig);
    } catch {
      return RCM_WEEKS;
    }
  }

  if (!Array.isArray(parsedConfig) || parsedConfig.length === 0) {
    return RCM_WEEKS;
  }

  const isFullConfig = parsedConfig.every((entry) => (
    entry && typeof entry === 'object'
    && typeof entry.phase === 'string'
    && typeof entry.verb === 'string'
    && Number.isInteger(entry.week)
  ));

  if (isFullConfig) {
    const sortedConfig = [...parsedConfig].sort((left, right) => left.week - right.week);
    RCM_WEEKS.length = 0;
    sortedConfig.forEach((entry, index) => {
      RCM_WEEKS.push({
        week: index + 1,
        phase: String(entry.phase || 'GANAR').toUpperCase(),
        phaseLabel: entry.phaseLabel || titleCase(entry.phase || 'Ganar'),
        verb: entry.verb || '',
        verbDesc: entry.verbDesc || '',
        ...withResolvedEventMetadata({
          specialEvents: entry.specialEvents,
          event: entry.event || null,
          eventType: entry.eventType || null,
          purpose: entry.purpose || null,
          rcmKey: entry.rcmKey || null,
          captureMode: entry.captureMode || null,
        }),
      });
    });
    return RCM_WEEKS;
  }

  parsedConfig.forEach((override) => {
    const entry = RCM_WEEKS.find((weekEntry) => weekEntry.week === override.week);
    if (!entry) return;
    if (override.verb !== undefined) entry.verb = override.verb || entry.verb;
    if (override.verbDesc !== undefined) entry.verbDesc = override.verbDesc;
    if (override.event !== undefined) entry.event = override.event || null;
    if (override.eventType !== undefined) entry.eventType = override.eventType || null;
    if (override.purpose !== undefined) entry.purpose = override.purpose || null;
    if (override.captureMode !== undefined) entry.captureMode = override.captureMode || null;
    if (override.specialEvents !== undefined) entry.specialEvents = override.specialEvents;
    if (override.phase !== undefined && override.phase) {
      entry.phase = String(override.phase).toUpperCase();
      entry.phaseLabel = override.phaseLabel || titleCase(override.phase);
    }
    Object.assign(entry, withResolvedEventMetadata(entry));
  });

  return RCM_WEEKS;
}
