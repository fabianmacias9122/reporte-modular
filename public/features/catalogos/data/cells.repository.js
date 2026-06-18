import { request } from '../../../core/api/index.js';

export async function saveCell(payload, deps = {}) {
  const { requestFn = request, cellId = '' } = deps;
  if (cellId) {
    await requestFn(`/api/catalogs/cells/${cellId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return { id: String(cellId), created: false };
  }

  const created = await requestFn('/api/catalogs/cells', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { id: String(created.id), created: true };
}

export async function deleteCell(cellId, deps = {}) {
  const { requestFn = request } = deps;
  await requestFn(`/api/catalogs/cells/${cellId}`, {
    method: 'DELETE',
  });
}

export async function renumberCells(deps = {}) {
  const { requestFn = request } = deps;
  await requestFn('/api/catalogs/cells/renumber', {
    method: 'POST',
  });
}

export async function addCellMember(cellId, personId, deps = {}) {
  const { requestFn = request } = deps;
  await requestFn(`/api/catalogs/cells/${cellId}/members`, {
    method: 'POST',
    body: JSON.stringify({ personId: Number(personId) }),
  });
}

export async function removeCellMember(cellId, personId, deps = {}) {
  const { requestFn = request } = deps;
  await requestFn(`/api/catalogs/cells/${cellId}/members/${personId}`, {
    method: 'DELETE',
  });
}

export async function updateCellMember(cellId, personId, payload, deps = {}) {
  const { requestFn = request } = deps;
  await requestFn(`/api/catalogs/cells/${cellId}/members/${personId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}