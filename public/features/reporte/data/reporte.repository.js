import { request } from '../../../core/api/index.js';

export async function fetchReport(reportId, deps = {}) {
  const requestFn = deps.requestFn || request;
  const payload = await requestFn(`/api/reports/${reportId}`);
  return payload?.report || null;
}

export async function fetchReports(deps = {}) {
  const requestFn = deps.requestFn || request;
  const payload = await requestFn('/api/reports');
  return Array.isArray(payload?.reports) ? payload.reports : [];
}

export async function createCatalogPerson(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  return requestFn('/api/catalogs/people', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function assignCatalogCellMember(cellId, payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  return requestFn(`/api/catalogs/cells/${cellId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveReport(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  return requestFn('/api/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}