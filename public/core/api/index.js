import { buildApiUrl, resolveApiBaseUrl } from './base-url.js';
import { t } from '../../i18n.js';

export const API_BASE_URL = resolveApiBaseUrl();

import { restoreStoredSession } from '../auth/index.js';

let translate = (key) => t(key);

function getMessage(key, fallback) {
  const translated = String(translate(key) || '').trim();
  if (!translated || translated === key) {
    return fallback;
  }
  return translated;
}

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

function isServerWakeupStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

async function buildErrorFromResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  let payload = null;
  let text = '';

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    text = await response.text().catch(() => '');
  }

  const message = String(payload?.message || '').trim();
  if (message) {
    return new Error(message);
  }

  if (isServerWakeupStatus(response.status)) {
    return new Error(getMessage('err.backendWakeup', 'El servidor todavia esta despertando en Render. Intenta de nuevo en unos segundos.'));
  }

  if (response.status === 429) {
    return new Error(getMessage('err.rateLimited', 'El servidor esta ocupado en este momento. Intenta de nuevo en unos segundos.'));
  }

  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText && !compactText.startsWith('<!doctype') && !compactText.startsWith('<html')) {
    return new Error(compactText);
  }

  return new Error(getMessage('err.unexpected', 'Ocurrio un error inesperado. Intenta de nuevo.'));
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
      const response = await fetch(buildApiUrl(path), {
        headers: {
          'Content-Type': 'application/json',
          ...buildActorHeaders(options.headers || {}),
        },
        ...options,
      });

      if (!response.ok) {
        throw await buildErrorFromResponse(response);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      lastError = error;
      const isNetworkError = error instanceof TypeError;
      const backendWakeupMessage = getMessage('err.backendWakeup', 'El servidor todavia esta despertando en Render. Intenta de nuevo en unos segundos.');
      const isTransientBackendError = error instanceof Error && error.message === backendWakeupMessage;
      if (!isNetworkError || attempt >= maxAttempts) {
        if (isNetworkError) {
          throw new Error(getMessage('err.network', 'No se pudo conectar con el servidor. Revisa tu conexion e intenta de nuevo.'));
        }
        throw error;
      }

      if (!isIdempotent || (!isNetworkError && !isTransientBackendError)) {
        throw error;
      }

      const delayMs = Math.min(6000, 1000 * Math.pow(2, attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(getMessage('err.network', 'No se pudo conectar con el servidor. Revisa tu conexion e intenta de nuevo.'));
  }
  throw lastError || new Error(getMessage('err.unexpected', 'Ocurrio un error inesperado. Intenta de nuevo.'));
}
