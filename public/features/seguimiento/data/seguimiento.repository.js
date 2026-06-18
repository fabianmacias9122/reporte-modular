import { request } from '../../../core/api/index.js';

export async function fetchSeguimientoReports(deps = {}) {
  const requestFn = deps.requestFn || request;
  const payload = await requestFn('/api/reports');
  return Array.isArray(payload?.reports) ? payload.reports : [];
}

export async function fetchSeguimientoReport(reportId, deps = {}) {
  const requestFn = deps.requestFn || request;
  const payload = await requestFn(`/api/reports/${reportId}`);
  return payload?.report || null;
}

export async function fetchFriendTracking(params = {}, deps = {}) {
  const requestFn = deps.requestFn || request;
  const query = new URLSearchParams();
  if (params.cellNumber) query.set('cellNumber', String(params.cellNumber));
  if (params.sector) query.set('sector', String(params.sector));
  if (params.year) query.set('year', String(params.year));
  if (params.quarter) query.set('quarter', String(params.quarter));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return requestFn(`/api/friend-tracking${qs}`);
}

export async function saveFriendTrackingGoals(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  return requestFn('/api/friend-tracking/goals', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}