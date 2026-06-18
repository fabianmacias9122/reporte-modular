import { request } from '../../../core/api/index.js';
import { normalizeCatalogsPayload } from '../models/catalogs-state.js';

export async function fetchCatalogs(deps = {}) {
  const requestFn = deps.requestFn || request;
  const payload = await requestFn('/api/catalogs');
  return normalizeCatalogsPayload(payload);
}