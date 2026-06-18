export const RC_SESSION_KEY = 'rcSession';
export const RC_SHARED_SESSION_KEY = 'rcSessionShared';

export function getStoredSession() {
  try {
    const storedSession = sessionStorage.getItem(RC_SESSION_KEY)
      || localStorage.getItem(RC_SHARED_SESSION_KEY)
      || 'null';
    const parsedSession = JSON.parse(storedSession);
    if (parsedSession && !sessionStorage.getItem(RC_SESSION_KEY)) {
      sessionStorage.setItem(RC_SESSION_KEY, JSON.stringify(parsedSession));
    }
    return parsedSession;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  const serialized = JSON.stringify(session || null);
  sessionStorage.setItem(RC_SESSION_KEY, serialized);
  localStorage.setItem(RC_SHARED_SESSION_KEY, serialized);
}

export function clearStoredSession() {
  sessionStorage.removeItem(RC_SESSION_KEY);
  localStorage.removeItem(RC_SHARED_SESSION_KEY);
}

export function normalizeUsername(rawValue) {
  return String(rawValue || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '');
}

export function hasCoordinatorAccess(person) {
  return Boolean(person && (person.isCoordinator || person.role === 'pastor'));
}

export function canPersonLogin(person, deps = {}) {
  const { cells = [] } = deps;
  if (!person || person.role === 'kid') return false;
  if (hasCoordinatorAccess(person)) return true;
  if (person.supervisorSector) return true;
  const personId = String(person.id || '');
  return cells.some((cell) => (
    String(cell.leaderPersonId || '') === personId
    || String(cell.assistantPersonId || '') === personId
  ));
}

export function hydrateStoredUser(user) {
  if (!user || typeof user !== 'object') return null;
  const hydratedUser = { ...user };
  if (hydratedUser.isSupervisor === undefined) {
    hydratedUser.isSupervisor = Boolean(hydratedUser.supervisedSector);
  }
  if (hydratedUser.isAdmin === undefined) {
    hydratedUser.isAdmin = Boolean(hydratedUser.isCoordinator || hydratedUser.role === 'pastor');
  }
  return hydratedUser;
}

export function restoreStoredSession() {
  const storedSession = getStoredSession();
  if (!storedSession) return null;
  const hydratedUser = hydrateStoredUser(storedSession);
  if (!hydratedUser) {
    clearStoredSession();
    return null;
  }
  return hydratedUser;
}

export async function lookupAuthUser(username, deps = {}) {
  const { fetchFn = fetch } = deps;
  const normalizedUsername = normalizeUsername(username);
  const response = await fetchFn(`/api/auth/lookup/${encodeURIComponent(normalizedUsername)}`);
  if (response.status === 404) {
    return { found: false, status: 404, data: null };
  }
  const data = await response.json();
  return { found: response.ok, status: response.status, data, responseOk: response.ok };
}

export async function getAuthStatus(personId, deps = {}) {
  const { fetchFn = fetch } = deps;
  const response = await fetchFn(`/api/auth/status/${encodeURIComponent(personId)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo consultar el estado de autenticacion.');
  }
  return data;
}

export async function loginWithPassword(payload, deps = {}) {
  const { fetchFn = fetch } = deps;
  const response = await fetchFn('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo iniciar sesion.');
  }
  return data;
}

export async function setPassword(payload, deps = {}) {
  const { fetchFn = fetch } = deps;
  const response = await fetchFn('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo actualizar la contrasena.');
  }
  return data;
}
