export function createEmptyCatalogs() {
  return {
    people: [],
    systemPeople: [],
    cells: [],
  };
}

export function createCatalogosViewState() {
  return {
    activeAdminSection: 'admin-overview-section',
    showAllAdminSummaryCards: false,
    isMobileViewport: false,
    adminSummaryPreviewCount: 3,
    actorIsSystemAccount: false,
    actorIsAdmin: false,
    activePeopleFilter: 'all',
    activePeopleSearch: '',
    activeCellSearch: '',
    peopleTablePageSize: 10,
    peopleTablePage: 1,
    mobilePeoplePage: 1,
    mobilePeopleVisibleCount: 8,
    mobileCellsVisibleCount: 8,
    isPeopleDialogOpen: false,
    editingPersonId: '',
    peopleFormMessage: '',
    peopleFormError: false,
    isCellsDialogOpen: false,
    editingCellId: '',
    cellsDialogScrollTop: 0,
    cellsFormMessage: '',
    cellsFormError: false,
  };
}

export function normalizeCatalogsPayload(payload) {
  const allPeople = Array.isArray(payload?.people) ? payload.people : [];
  const cells = Array.isArray(payload?.cells) ? payload.cells : [];
  const peopleById = new Map(
    allPeople.map((person) => [String(person.id || ''), {
      ...person,
      isLeader: false,
      isAssistant: false,
      isHost: false,
    }])
  );

  cells.forEach((cell) => {
    const leader = peopleById.get(String(cell?.leaderPersonId || ''));
    if (leader) leader.isLeader = true;
    const assistant = peopleById.get(String(cell?.assistantPersonId || ''));
    if (assistant) assistant.isAssistant = true;
    const host = peopleById.get(String(cell?.hostPersonId || ''));
    if (host) host.isHost = true;
  });

  const enrichedPeople = Array.from(peopleById.values());
  return {
    people: enrichedPeople.filter((person) => !person.isSystemAccount),
    systemPeople: enrichedPeople.filter((person) => person.isSystemAccount),
    cells,
  };
}

export function findCellById(catalogs, id) {
  return (catalogs?.cells || []).find((cell) => String(cell.id) === String(id || '')) || null;
}

export function findCellByNumber(catalogs, cellNumber) {
  return (catalogs?.cells || []).find((cell) => String(cell.cellNumber) === String(cellNumber || '')) || null;
}

export function formatRole(role) {
  switch (String(role || '')) {
    case 'pastor':
      return 'Pastor';
    case 'leader':
      return 'Lider';
    case 'assistant':
      return 'Asistente';
    case 'host':
      return 'Anfitrion';
    case 'member':
      return 'Miembro';
    case 'kid':
      return 'Nino';
    case 'supervisor':
      return 'Supervisor';
    case 'coordinator':
      return 'Coordinador';
    default:
      return String(role || 'Sin rol');
  }
}

export function hasCoordinatorAccess(person) {
  return Boolean(person && (person.isCoordinator || person.role === 'pastor'));
}

export function getDerivedFunctions(person) {
  if (person?.role === 'kid') return ['kid'];
  const functions = [];
  if (person?.role === 'pastor') functions.push('pastor');
  else if (hasCoordinatorAccess(person)) functions.push('coordinator');
  if (person?.supervisorSector) functions.push('supervisor');
  if (person?.assignedRole === 'leader' || person?.isLeader) functions.push('leader');
  if (person?.assignedRole === 'assistant' || person?.isAssistant) functions.push('assistant');
  if (person?.assignedRole === 'host' || person?.isHost) functions.push('host');
  if (!functions.length) {
    functions.push('member');
  }
  return functions;
}

export function getDerivedFunction(person) {
  const functions = getDerivedFunctions(person);
  if (functions.includes('pastor')) return 'pastor';
  if (functions.includes('coordinator')) return 'coordinator';
  if (functions.includes('supervisor')) return 'supervisor';
  if (functions.includes('leader')) return 'leader';
  if (functions.includes('assistant')) return 'assistant';
  if (functions.includes('host')) return 'host';
  if (person?.role === 'kid') return 'kid';
  return 'member';
}

export function getPersonAssignmentLabel(person) {
  if (Number(person?.assignedCellCount || 0) > 1) {
    return `Asignado en ${person.assignedCellCount} celulas`;
  }
  if (person?.assignedCellNumber) {
    return `Celula ${person.assignedCellNumber}`;
  }
  return 'Sin celula';
}

export function getVisiblePeople(catalogs, viewState) {
  const derivedFilters = ['coordinator', 'supervisor', 'leader', 'assistant', 'host'];
  return (catalogs?.people || []).filter((person) => {
    let matchesRole = true;
    if (viewState.activePeopleFilter === 'kid') {
      matchesRole = person.role === 'kid';
    } else if (viewState.activePeopleFilter === 'coordinator') {
      matchesRole = hasCoordinatorAccess(person);
    } else if (viewState.activePeopleFilter === 'member') {
      matchesRole = person.role !== 'kid' && getDerivedFunction(person) === 'member';
    } else if (derivedFilters.includes(viewState.activePeopleFilter)) {
      matchesRole = getDerivedFunctions(person).includes(viewState.activePeopleFilter);
    }

    const haystack = `${person.name || ''} ${person.email || ''} ${person.phone || ''} ${person.assignedCellNumber || ''}`.toLowerCase();
    const matchesSearch = !viewState.activePeopleSearch || haystack.includes(viewState.activePeopleSearch);
    return matchesRole && matchesSearch;
  });
}

export function isSystemAccountActor(catalogs, viewState) {
  return Boolean(viewState?.actorIsSystemAccount)
    || Boolean((catalogs?.systemPeople || []).some((person) => String(person.id || '') === String(viewState?.actorPersonId || '')));
}

export function getCellMembers(cell) {
  return (Array.isArray(cell?.members) ? cell.members : []).filter((member) => member.role !== 'kid');
}

export function getCellKids(cell) {
  return (Array.isArray(cell?.members) ? cell.members : []).filter((member) => member.role === 'kid');
}

export function getVisibleCells(catalogs, viewState) {
  return (catalogs?.cells || []).filter((cell) => {
    const haystack = `${cell.cellNumber || ''} ${cell.networkName || ''} ${cell.sector || ''} ${cell.zoneName || ''} ${cell.districtName || ''}`.toLowerCase();
    return !viewState.activeCellSearch || haystack.includes(viewState.activeCellSearch);
  });
}

export function getCatalogosAdminSummary(catalogs) {
  const cells = catalogs?.cells || [];
  const people = catalogs?.people || [];
  const leaderIds = new Set(cells.map((cell) => cell.leaderPersonId).filter(Boolean).map(String));
  const assistantIds = new Set(cells.map((cell) => cell.assistantPersonId).filter(Boolean).map(String));
  const hostIds = new Set(cells.map((cell) => cell.hostPersonId).filter(Boolean).map(String));
  const coordinators = people.filter((person) => hasCoordinatorAccess(person)).length;
  const supervisors = people.filter((person) => person.supervisorSector).length;
  const kids = people.filter((person) => person.role === 'kid').length;
  const members = people.filter((person) => person.role !== 'kid').length;
  const assignedMemberIds = new Set(cells.flatMap(getCellMembers).map((member) => String(member.id)));
  const unassignedMembers = people.filter((person) => person.role !== 'kid' && !assignedMemberIds.has(String(person.id))).length;
  const cellsWithoutLeader = cells.filter((cell) => !cell.leaderPersonId).length;

  return [
    { label: 'Celulas', value: cells.length, hint: 'Total registradas' },
    { label: 'Lideres', value: leaderIds.size, hint: 'Asignados como lider' },
    { label: 'Asistentes', value: assistantIds.size, hint: 'Asignados como asistente' },
    { label: 'Anfitriones', value: hostIds.size, hint: 'Casas anfitrionas' },
    { label: 'Coordinadores', value: coordinators, hint: 'Con rol de coordinador' },
    { label: 'Supervisores', value: supervisors, hint: 'Con sector asignado' },
    { label: 'Miembros', value: members, hint: 'Total adultos' },
    { label: 'Sin celula', value: unassignedMembers, hint: 'Adultos sin asignacion' },
    { label: 'Ninos', value: kids, hint: 'Cargados por responsable' },
    { label: 'Sin lider', value: cellsWithoutLeader, hint: 'Celulas por cubrir' },
  ];
}

export function getPeopleFormInitialData() {
  return {
    name: '',
    role: 'member',
    phone: '',
    email: '',
    guardianPersonId: '',
    guardianName: '',
    supervisorSector: '',
    isCoordinator: false,
    isAdmin: false,
    username: '',
    assignedCellId: '',
  };
}

export function getPersonById(catalogs, personId) {
  return (catalogs?.people || []).find((person) => String(person.id) === String(personId || ''))
    || (catalogs?.systemPeople || []).find((person) => String(person.id) === String(personId || ''))
    || null;
}

export function getPeopleFormData(catalogs, viewState) {
  const person = getPersonById(catalogs, viewState.editingPersonId);
  if (!person) {
    return getPeopleFormInitialData();
  }
  return {
    name: person.name || '',
    role: person.role || 'member',
    phone: person.phone || '',
    email: person.email || '',
    guardianPersonId: person.guardianPersonId ? String(person.guardianPersonId) : '',
    guardianName: person.guardianName || '',
    supervisorSector: person.supervisorSector || '',
    isCoordinator: Boolean(person.isCoordinator),
    isAdmin: Boolean(person.isAdmin),
    username: person.username || '',
    assignedCellId: person.assignedCellId ? String(person.assignedCellId) : '',
  };
}

export function getSectorOptions(catalogs) {
  return [...new Set((catalogs?.cells || []).map((cell) => String(cell.sector || '').trim()).filter(Boolean))].sort();
}

export function getCellFormInitialData() {
  return {
    cellNumber: '',
    networkName: '',
    sector: '',
    zoneName: '',
    districtName: '',
    address: '',
    leaderPersonId: '',
    assistantPersonId: '',
    hostPersonId: '',
  };
}

export function getCellById(catalogs, cellId) {
  return (catalogs?.cells || []).find((cell) => String(cell.id) === String(cellId || '')) || null;
}

export function getCellFormData(catalogs, viewState) {
  const cell = getCellById(catalogs, viewState.editingCellId);
  if (!cell) {
    return getCellFormInitialData();
  }
  return {
    cellNumber: cell.cellNumber || '',
    networkName: cell.networkName || '',
    sector: cell.sector || '',
    zoneName: cell.zoneName || '',
    districtName: cell.districtName || '',
    address: cell.address || '',
    leaderPersonId: cell.leaderPersonId ? String(cell.leaderPersonId) : '',
    assistantPersonId: cell.assistantPersonId ? String(cell.assistantPersonId) : '',
    hostPersonId: cell.hostPersonId ? String(cell.hostPersonId) : '',
  };
}

export function getAssignableAdults(catalogs) {
  return (catalogs?.people || []).filter((person) => person.role !== 'kid');
}

export function getCellRoster(catalogs, viewState) {
  const cell = getCellById(catalogs, viewState.editingCellId);
  if (!cell) return [];
  return [...getCellMembers(cell), ...getCellKids(cell)];
}

export function getAvailablePeopleForCell(catalogs, viewState) {
  const rosterIds = new Set(getCellRoster(catalogs, viewState).map((person) => String(person.id)));
  return (catalogs?.people || []).filter((person) => {
    if (rosterIds.has(String(person.id))) return false;
    return !person.assignedCellId;
  });
}

export function normalizeCellMemberAttendanceMode(value) {
  return value === 'justified_default' ? 'justified_default' : 'normal';
}

export function normalizeCellMemberAttendanceDefaults(value, mode = 'normal') {
  const normalizedMode = normalizeCellMemberAttendanceMode(mode);
  if (normalizedMode !== 'justified_default') {
    return {};
  }
  const raw = value && typeof value === 'object' ? value : {};
  const defaults = {
    planning: Boolean(raw.planning),
    reach: Boolean(raw.reach),
    sunday: Boolean(raw.sunday),
  };
  if (!defaults.planning && !defaults.reach && !defaults.sunday) {
    return { planning: true, reach: true, sunday: true };
  }
  return defaults;
}

export function getCellMemberRole(cell, personId) {
  const pid = String(personId || '');
  if (String(cell?.leaderPersonId || '') === pid) return 'leader';
  if (String(cell?.assistantPersonId || '') === pid) return 'assistant';
  if (String(cell?.hostPersonId || '') === pid) return 'host';
  return '';
}