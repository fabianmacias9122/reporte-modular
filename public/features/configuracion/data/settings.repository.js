import { request } from '../../../core/api/index.js';
import { normalizeSettingsPayload } from '../models/settings-state.js';

export async function fetchSettings(deps = {}) {
  const requestFn = deps.requestFn || request;
  try {
    const payload = await requestFn('/api/settings');
    return normalizeSettingsPayload(payload);
  } catch {
    return normalizeSettingsPayload({});
  }
}

export async function saveSettings(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  await requestFn('/api/settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeSettingsPayload(payload);
}

export async function saveFriendTrackingGoals(payload, deps = {}) {
  const requestFn = deps.requestFn || request;
  return requestFn('/api/friend-tracking/goals', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}