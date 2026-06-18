const runtimeApiBase = String(window.REPORTE_API_BASE_URL || '').trim();
const normalizedRuntimeApiBase = runtimeApiBase.replace(/\/$/, '');

export const API_BASE_URL = normalizedRuntimeApiBase || window.location.origin;

import { restoreStoredSession } from '../auth/index.js';

let translate = (key) => key;

export function configureApi(options = {}) {
  if (typeof options.t === 'function') {
    translate = options.t;
  }
}

function buildActorHeaders(headers = {}) {
  const actorId = restoreStoredSession()?.personId;
  return actorId
    ? {
        'X-Acting-Person-Id': String(actorId),
        ...headers,
      }
    : headers;
}

export async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const maxAttempts = isIdempotent ? 5 : 1;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...buildActorHeaders(options.headers || {}),
        },
        ...options,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: translate('err.unexpected') }));
        throw new Error(payload.message || translate('err.unexpected'));
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      lastError = error;
      const isNetworkError = error instanceof TypeError;
      if (!isNetworkError || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = Math.min(6000, 1000 * Math.pow(2, attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error(translate('err.unexpected'));
}
