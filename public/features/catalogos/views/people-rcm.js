export const RCM_MILESTONES = [
  { key: 'levantate', label: 'Levántate', section: 'ganar', sectionLabel: 'Fase Ganar', type: 'evento' },
  { key: 'e1Maduracion', label: 'E1 - Maduración', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'clase' },
  { key: 'e2Integracion', label: 'E2 - Integración', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'clase' },
  { key: 'e3Ubicacion', label: 'E3 - Ubicación', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'clase' },
  { key: 'eventoUnete', label: 'Evento Únete', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'evento' },
  { key: 'restauracion', label: 'Restauración', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'evento' },
  { key: 'eventoReencuentro', label: 'Evento Re-encuentro', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'evento' },
  { key: 'eventoMinisterios', label: 'Evento Ministerios', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'evento' },
  { key: 'reencuentro', label: 'Reencuentro', section: 'consolidar', sectionLabel: 'Fase Consolidar', type: 'evento' },
  { key: 'e1Vision', label: 'E1 - Visión', section: 'discipular', sectionLabel: 'Fase Discipular', type: 'clase' },
  { key: 'e2Caracter', label: 'E2 - Carácter', section: 'discipular', sectionLabel: 'Fase Discipular', type: 'clase' },
  { key: 'e3Perfil', label: 'E3 Perfil', section: 'discipular', sectionLabel: 'Fase Discipular', type: 'clase' },
  { key: 'lanzamiento', label: 'Lanzamiento/Multip.', section: 'discipular', sectionLabel: 'Fase Discipular', type: 'evento' },
  { key: 'cielosAbiertos', label: 'Cielos Abiertos', section: 'discipular', sectionLabel: 'Fase Discipular', type: 'evento' },
  { key: 'escFormativa', label: 'Esc. Formativa', section: 'escuelas', sectionLabel: 'Escuelas', type: 'clase' },
  { key: 'escPadresEsp', label: 'Esc. Padres Esp.', section: 'escuelas', sectionLabel: 'Escuelas', type: 'clase' },
  { key: 'escLideres', label: 'Esc. Líderes', section: 'escuelas', sectionLabel: 'Escuelas', type: 'clase' },
  { key: 'escSupervisores', label: 'Esc. Supervisores', section: 'escuelas', sectionLabel: 'Escuelas', type: 'clase' },
];

export const CLASS_MILESTONES = RCM_MILESTONES.filter((milestone) => milestone.type === 'clase');

const NEXT_CLASS_AFTER = {
  e1Maduracion: 'e2Integracion',
  e2Integracion: 'e3Ubicacion',
  e1Vision: 'e2Caracter',
  e2Caracter: 'e3Perfil',
};

export function canPersonLogin(person, cells = []) {
  if (!person || person.role === 'kid') return false;
  if (person.isCoordinator || person.role === 'pastor') return true;
  if (person.supervisorSector) return true;
  const personId = String(person.id || '');
  return cells.some((cell) => String(cell.leaderPersonId || '') === personId || String(cell.assistantPersonId || '') === personId);
}

export function getNextClassMilestone(key) {
  const nextKey = NEXT_CLASS_AFTER[String(key || '')];
  return nextKey ? CLASS_MILESTONES.find((milestone) => milestone.key === nextKey) || null : null;
}

export function getPersonRcmSummary(person) {
  const isTrackable = Boolean(person && person.role !== 'kid');
  const activeCount = isTrackable
    ? RCM_MILESTONES.filter((milestone) => person?.rcmProgress?.[milestone.key]).length
    : 0;
  const totalCount = RCM_MILESTONES.length;
  const pct = totalCount ? Math.round((activeCount / totalCount) * 100) : 0;
  return { isTrackable, activeCount, totalCount, pct };
}

export function renderRcmProgressBadges(rcmProgress = {}) {
  const badges = [
    { key: 'levantate', label: 'Levantate', phase: 'ganar' },
    { key: 'restauracion', label: 'Restauracion', phase: 'consolidar' },
    { key: 'reencuentro', label: 'Reencuentro', phase: 'consolidar' },
    { key: 'cielosAbiertos', label: 'Cielos Abiertos', phase: 'discipular' },
  ]
    .filter(({ key }) => rcmProgress?.[key])
    .map(({ key, label, phase }) => `<span class="rcm-progress-badge phase-badge-${phase}" title="${label} · ${String(rcmProgress[key] || '')}">★ ${label}</span>`)
    .join('');
  return badges ? `<span class="rcm-progress-badges">${badges}</span>` : '';
}