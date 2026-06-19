// Runtime config for static deployments (Render, Netlify, etc).
// Set window.REPORTE_API_BASE_URL to point this frontend to a backend URL.
const localDevApiBaseByPort = {
	'8080': 'http://127.0.0.1:8090',
	'8091': 'http://127.0.0.1:8090',
};

const configuredApiBase = String(window.REPORTE_API_BASE_URL || '').trim();
const localDevApiBase = localDevApiBaseByPort[window.location.port] || '';
const isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

window.REPORTE_API_BASE_URL = configuredApiBase || localDevApiBase;

// In local development, keep API base deterministic and ignore stale browser overrides.
if (typeof window.REPORTE_API_BASE_LOCKED === 'undefined') {
	window.REPORTE_API_BASE_LOCKED = isLocalHost;
}

if (window.REPORTE_API_BASE_LOCKED) {
	try {
		window.localStorage.removeItem('rcApiBaseUrl');
	} catch {
		// Ignore localStorage access errors.
	}
}
