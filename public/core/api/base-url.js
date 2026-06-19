const API_BASE_STORAGE_KEY = 'rcApiBaseUrl';
const LOCAL_BACKEND_PORT = '8090';

function normalizeBaseUrl(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function getRuntimeApiBaseUrl() {
  return normalizeBaseUrl(window.REPORTE_API_BASE_URL);
}

function isRuntimeApiBaseLocked() {
  const rawValue = window.REPORTE_API_BASE_LOCKED;
  if (typeof rawValue === 'boolean') return rawValue;
  const normalized = String(rawValue || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getConfiguredApiBaseUrl() {
  const runtimeValue = getRuntimeApiBaseUrl();
  if (runtimeValue) return runtimeValue;

  if (isRuntimeApiBaseLocked()) {
    return '';
  }

  const queryValue = new URLSearchParams(window.location.search).get('apiBaseUrl');
  if (queryValue) return normalizeBaseUrl(queryValue);

  const metaValue = document.querySelector('meta[name="rc-api-base-url"]')?.getAttribute('content');
  if (metaValue) return normalizeBaseUrl(metaValue);

  try {
    const storedValue = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (storedValue) return normalizeBaseUrl(storedValue);
  } catch {
    // Ignore storage errors and continue with location-based fallback.
  }

  return '';
}

function getLocalBackendOrigin() {
  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === '127.0.0.1' || hostname === 'localhost';
  if (!isLocalHost) return '';
  if (port === LOCAL_BACKEND_PORT) return window.location.origin;
  return `${protocol}//${hostname}:${LOCAL_BACKEND_PORT}`;
}

export function resolveApiBaseUrl() {
  const runtimeValue = getRuntimeApiBaseUrl();
  if (runtimeValue) return runtimeValue;

  const configuredBaseUrl = getConfiguredApiBaseUrl();
  if (configuredBaseUrl) return configuredBaseUrl;

  if (window.location.protocol === 'file:') {
    return getLocalBackendOrigin() || 'http://127.0.0.1:8090';
  }

  const localBackendOrigin = getLocalBackendOrigin();
  if (localBackendOrigin) return localBackendOrigin;

  return window.location.origin;
}

export function buildApiUrl(path) {
  return `${resolveApiBaseUrl()}${path}`;
}