import { request } from '../../../core/api/index.js';

function getActorHeaders(currentUser) {
  return currentUser?.personId
    ? { 'X-Acting-Person-Id': String(currentUser.personId) }
    : {};
}

export async function savePerson(payload, deps = {}) {
  const { requestFn = request, currentUser = null, personId = '' } = deps;
  const actorHeaders = getActorHeaders(currentUser);
  if (personId) {
    await requestFn(`/api/catalogs/people/${personId}`, {
      method: 'PUT',
      headers: actorHeaders,
      body: JSON.stringify(payload),
    });
    return { id: String(personId), created: false };
  }

  const created = await requestFn('/api/catalogs/people', {
    method: 'POST',
    headers: actorHeaders,
    body: JSON.stringify(payload),
  });
  return { id: String(created.id), created: true };
}

export async function movePersonMembership(params, deps = {}) {
  const { requestFn = request } = deps;
  const { oldCellId = '', newCellId = '', personId = '' } = params;
  if (!personId) return;
  if (oldCellId && oldCellId !== newCellId) {
    await requestFn(`/api/catalogs/cells/${oldCellId}/members/${personId}`, { method: 'DELETE' });
  }
  if (newCellId && oldCellId !== newCellId) {
    await requestFn(`/api/catalogs/cells/${newCellId}/members`, {
      method: 'POST',
      body: JSON.stringify({ personId: Number(personId) }),
    });
  }
}

export async function deletePerson(personId, deps = {}) {
  const { requestFn = request } = deps;
  await requestFn(`/api/catalogs/people/${personId}`, {
    method: 'DELETE',
  });
}

export async function updatePersonAdmin(personId, isAdmin, deps = {}) {
  const { requestFn = request, currentUser = null } = deps;
  const actorHeaders = getActorHeaders(currentUser);
  await requestFn(`/api/catalogs/people/${personId}/admin`, {
    method: 'PATCH',
    headers: actorHeaders,
    body: JSON.stringify({ isAdmin: Boolean(isAdmin) }),
  });
}

export async function updatePersonSystemAccount(personId, isSystemAccount, deps = {}) {
  const { requestFn = request, currentUser = null } = deps;
  const actorHeaders = getActorHeaders(currentUser);
  await requestFn(`/api/catalogs/people/${personId}/system-account`, {
    method: 'PATCH',
    headers: actorHeaders,
    body: JSON.stringify({ isSystemAccount: Boolean(isSystemAccount) }),
  });
}

export async function adminResetPassword(personId, deps = {}) {
  const { requestFn = request, currentUser = null } = deps;
  const actorHeaders = getActorHeaders(currentUser);
  await requestFn(`/api/auth/admin-reset/${personId}`, {
    method: 'POST',
    headers: actorHeaders,
  });
}

export async function updatePersonRcm(personId, payload, deps = {}) {
  const { requestFn = request } = deps;
  return requestFn(`/api/catalogs/people/${personId}/rcm`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}