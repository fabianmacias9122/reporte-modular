const DEFAULT_RCM_WEEKS = [
  { week: 1, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'ORAR', verbDesc: 'Intercesión por las almas — pedir a Dios un amigo específico.', event: null, eventType: null, purpose: null },
  { week: 2, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'ANOTAR', verbDesc: 'Registrar al amigo/familiar y asumir responsabilidad espiritual.', event: null, eventType: null, purpose: null },
  { week: 3, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'CONTACTAR', verbDesc: 'Visitar o llamar al contacto e invitar al proceso.', event: null, eventType: null, purpose: null },
  { week: 4, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'CONFIRMAR', verbDesc: 'Asegurar la asistencia al evento Levántate.', event: null, eventType: null, purpose: null },
  { week: 5, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'DESATAR', verbDesc: 'Oración de guerra espiritual para romper cadenas.', event: null, eventType: null, purpose: null },
  { week: 6, phase: 'GANAR', phaseLabel: 'Ganar', verb: 'LLEVAR', verbDesc: 'Llevar al invitado a la Fiesta del Amigo / evento Levántate.', event: 'Levántate', eventType: 'Evangelístico', purpose: 'Primer llamado y atención a necesidades personales, familiares y espirituales.', rcmKey: 'levantate' },
  { week: 7, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'MOTIVAR', verbDesc: 'Animación para asistir al Encuentro / Restauración.', event: null, eventType: null, purpose: null },
  { week: 8, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'INTEGRAR', verbDesc: 'Incorporar al amigo a la célula, cultos y fraternidades.', event: null, eventType: null, purpose: null },
  { week: 9, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'CONSOLIDAR', verbDesc: 'Afirmar la fe del nuevo creyente.', event: null, eventType: null, purpose: null },
  { week: 10, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'PREPARAR', verbDesc: 'Preparación para el encuentro con Dios.', event: null, eventType: null, purpose: null },
  { week: 11, phase: 'CONSOLIDAR', phaseLabel: 'Consolidar', verb: 'SANTIFICAR', verbDesc: 'Consagración para el Evento de Restauración (Encuentro).', event: 'Restauración', eventType: 'Sanidad interior y liberación espiritual', purpose: 'Sanar áreas internas y fortalecer la fe.', rcmKey: 'restauracion' },
  { week: 12, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'MATRICULAR', verbDesc: 'Inscripción al discipulado.', event: null, eventType: null, purpose: null },
  { week: 13, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'CONSERVAR', verbDesc: 'Cuidado del nuevo convertido.', event: null, eventType: null, purpose: null },
  { week: 14, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'DOCTRINAR', verbDesc: 'Enseñanza de los fundamentos de la fe.', event: null, eventType: null, purpose: null },
  { week: 15, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'DISCIPULAR', verbDesc: 'Formación como nuevo líder/discípulo.', event: null, eventType: null, purpose: null },
  { week: 16, phase: 'DISCIPULAR', phaseLabel: 'Discipular', verb: 'BAUTIZAR', verbDesc: 'La Pesca Milagrosa — Evento de Bautismos en agua.', event: 'Cielos Abiertos', eventType: 'Bautismos en agua', purpose: 'Bautismos, llenura espiritual y envío al discipulado.', rcmKey: 'cielosAbiertos' },
];

function cloneWeeks(weeks = []) {
  return weeks.map((entry) => ({ ...entry }));
}

export const RCM_WEEKS = cloneWeeks(DEFAULT_RCM_WEEKS);

export function titleCase(value) {
  const normalizedValue = String(value || '').toLowerCase();
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
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
  return { ...info, ...range, isEventWeek: Boolean(info.event) };
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
        event: entry.event || null,
        eventType: entry.eventType || null,
        purpose: entry.purpose || null,
        rcmKey: entry.rcmKey || null,
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
    if (override.phase !== undefined && override.phase) {
      entry.phase = String(override.phase).toUpperCase();
      entry.phaseLabel = override.phaseLabel || titleCase(override.phase);
    }
  });

  return RCM_WEEKS;
}
