import { clearStoredSession, restoreStoredSession } from '../auth/index.js';
import { createLoginExperience } from '../auth/login.js';
import { applyRcmWeeksConfig, resetRcmWeeks } from '../rcm/index.js';
import { fetchReports } from '../../features/reporte/data/reporte.repository.js';
import { getQuarterWeekNumber } from '../../features/reporte/models/reporte-state.js';

const FEATURE_MODULE_VERSION = 'v=20260622-seguimiento-attendance-detail-5';

const appState = {
  rootSelector: '#app-root',
  currentUser: null,
  activeFeature: null,
  activeFeatureKey: 'reporte',
  featureContext: null,
  settings: {},
  reports: [],
  graceBannerDismissed: false,
};

let globalGraceBannerTimer = null;

const FEATURE_LABELS = {
  reporte: 'Reporte',
  seguimiento: 'Seguimiento',
  catalogos: 'Catálogos',
  configuracion: 'Configuración',
};

function showSplash(message = 'Despertando el servidor, un momento.') {
  const splash = document.querySelector('#app-splash');
  const subtitle = document.querySelector('#app-splash-sub');
  if (subtitle) {
    subtitle.textContent = message;
  }
  if (splash) splash.classList.remove('is-hidden');
}

function hideSplash() {
  const splash = document.querySelector('#app-splash');
  if (splash) splash.classList.add('is-hidden');
}

function clearGlobalGraceBannerTimer() {
  if (globalGraceBannerTimer) {
    clearInterval(globalGraceBannerTimer);
    globalGraceBannerTimer = null;
  }
}

function parseReportDateValue(dateValue = '') {
  const trimmed = String(dateValue || '').trim();
  if (!trimmed) return NaN;
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : NaN;
}

function isGlobalGracePeriodActive(settings) {
  const graceHours = parseInt(String(settings?.report_grace_hours ?? '0'), 10) || 0;
  if (graceHours <= 0) return false;
  const weekStartDay = parseInt(String(settings?.week_start_day ?? '0'), 10) || 0;
  const now = new Date();
  const rollover = new Date(now);
  rollover.setHours(0, 0, 0, 0);
  const diff = (rollover.getDay() - weekStartDay + 7) % 7;
  rollover.setDate(rollover.getDate() - diff);
  return (now.getTime() - rollover.getTime()) / 3600000 < graceHours;
}

function getGlobalGraceBannerInfo() {
  if (appState.graceBannerDismissed) return null;
  const graceHours = parseInt(String(appState.settings?.report_grace_hours ?? '0'), 10) || 0;
  if (graceHours <= 0) return null;
  const targetCell = String(appState.currentUser?.assignedCellNumber || '').trim();
  if (!targetCell) return null;
  const realWeek = getQuarterWeekNumber(appState.settings);
  if (!Number.isFinite(realWeek) || realWeek <= 1) return null;
  if (!isGlobalGracePeriodActive(appState.settings)) return null;

  const weekStartDay = parseInt(String(appState.settings?.week_start_day ?? '0'), 10) || 0;
  const now = new Date();
  const rollover = new Date(now);
  rollover.setHours(0, 0, 0, 0);
  const diff = (rollover.getDay() - weekStartDay + 7) % 7;
  rollover.setDate(rollover.getDate() - diff);
  const msLeft = (graceHours * 3600 * 1000) - (now.getTime() - rollover.getTime());
  if (msLeft <= 0) return null;

  const graceWeek = String(realWeek - 1);
  const cycleStart = String(appState.settings?.cycle_start_date || '').trim();
  const cycleStartTimestamp = parseReportDateValue(cycleStart);
  const hasRegisteredReport = (Array.isArray(appState.reports) ? appState.reports : []).some((report) => {
    const reportCell = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
    const reportWeek = String(report?.week || report?.formData?.week || '').trim();
    if (reportCell !== targetCell || reportWeek !== graceWeek) {
      return false;
    }
    if (!Number.isFinite(cycleStartTimestamp)) {
      return true;
    }
    const reportDate = String(report?.reportDate || report?.report_date || report?.formData?.reportDate || '').trim();
    const reportTimestamp = parseReportDateValue(reportDate);
    if (!Number.isFinite(reportTimestamp)) {
      return true;
    }
    return reportTimestamp >= cycleStartTimestamp;
  });
  if (hasRegisteredReport) return null;

  return { cellNumber: targetCell, week: graceWeek, msLeft };
}

function formatGraceCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function syncGlobalGraceBanner(root) {
  const host = root?.closest('#app-content') || document;
  const banner = host.querySelector('#global-grace-banner');
  const bannerText = host.querySelector('#global-grace-banner-text');
  if (!(banner instanceof HTMLElement) || !(bannerText instanceof HTMLElement)) {
    clearGlobalGraceBannerTimer();
    return;
  }

  const info = getGlobalGraceBannerInfo();
  if (!info) {
    banner.hidden = true;
    clearGlobalGraceBannerTimer();
    return;
  }

  bannerText.innerHTML = `<strong>¿Ya enviaste tu reporte de la semana ${info.week}?</strong> Tienes <strong>${formatGraceCountdown(info.msLeft)}</strong> de prórroga antes de que cierre el periodo.`;
  banner.hidden = false;
  if (!globalGraceBannerTimer) {
    globalGraceBannerTimer = setInterval(() => syncGlobalGraceBanner(root), 1000);
  }
}

function applyPreviewFlags() {
  const params = new URLSearchParams(window.location.search);
  document.body.classList.toggle('force-mobile-preview', params.get('mobile') === '1');
}

export function getAppState() {
  return appState;
}

function updateTopbarSession() {
  const currentUser = appState.currentUser;
  const userChip = document.querySelector('#user-chip');
  const userChipName = document.querySelector('#user-chip-name');
  const mobileButton = document.querySelector('#topbar-mobile-btn');
  const mobileInitials = document.querySelector('#topbar-mobile-initials');
  const mobileCard = document.querySelector('#topbar-mobile-card');
  const mobileUserName = document.querySelector('#tmc-user-name');
  const healthStatus = document.querySelector('#health-status');
  const healthStatusDot = document.querySelector('#health-status-dot');
  const mobileStatusText = document.querySelector('#tmc-status-text');
  const mobileStatusDot = document.querySelector('#tmc-status-dot');
  const adminButton = document.querySelector('#show-admin-view');
  const seguimientoButton = document.querySelector('#show-seguimiento-view');
  const settingsButton = document.querySelector('#show-settings-view');
  const isLoggedIn = Boolean(currentUser && currentUser.name);

  if (healthStatus) healthStatus.textContent = 'Revisando...';
  if (mobileStatusText) mobileStatusText.textContent = 'Revisando...';
  if (healthStatusDot) healthStatusDot.dataset.ok = 'true';
  if (mobileStatusDot) mobileStatusDot.dataset.ok = 'true';
  if (userChip) userChip.classList.toggle('is-hidden', !isLoggedIn);
  if (mobileButton) mobileButton.classList.toggle('is-hidden', !isLoggedIn);
  if (mobileCard && !isLoggedIn) mobileCard.hidden = true;
  if (userChipName) userChipName.textContent = isLoggedIn ? currentUser.name : '';
  if (mobileUserName) mobileUserName.textContent = isLoggedIn ? currentUser.name : '—';

  if (mobileInitials && isLoggedIn) {
    const parts = String(currentUser.name || '').trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`
      : String(parts[0] || '').slice(0, 2);
    mobileInitials.textContent = initials.toUpperCase();
  }

  if (seguimientoButton) seguimientoButton.classList.toggle('is-hidden', !isLoggedIn);
  if (settingsButton) settingsButton.classList.toggle('is-hidden', !isLoggedIn);
  if (adminButton) adminButton.classList.toggle('is-hidden', !isLoggedIn || !(currentUser && currentUser.isAdmin));
}

function updateShellNavigation() {
  const routeLabel = document.querySelector('#topbar-route-label');
  if (routeLabel) {
    routeLabel.textContent = FEATURE_LABELS[appState.activeFeatureKey] || 'Reporte';
  }

  document.querySelectorAll('[data-feature-key]').forEach((button) => {
    const isActive = String(button.dataset.featureKey || '') === appState.activeFeatureKey;
    button.classList.toggle('is-active', isActive);
  });

  updateTopbarSession();
}

async function loadFeatureModules() {
  const [
    catalogosModule,
    configuracionModule,
    seguimientoModule,
    reporteModule,
    settingsRepositoryModule,
  ] = await Promise.all([
    import(`../../features/catalogos/index.js?${FEATURE_MODULE_VERSION}`),
    import(`../../features/configuracion/index.js?${FEATURE_MODULE_VERSION}`),
    import(`../../features/seguimiento/index.v2.js?${FEATURE_MODULE_VERSION}`),
    import(`../../features/reporte/index.js?${FEATURE_MODULE_VERSION}`),
    import(`../../features/configuracion/data/settings.repository.js?${FEATURE_MODULE_VERSION}`),
  ]);

  return {
    createCatalogosFeature: catalogosModule.createCatalogosFeature,
    createConfiguracionFeature: configuracionModule.createConfiguracionFeature,
    createSeguimientoFeature: seguimientoModule.createSeguimientoFeature,
    createReporteFeature: reporteModule.createReporteFeature,
    fetchSettings: settingsRepositoryModule.fetchSettings,
  };
}

async function activateFeature(root, nextKey, context = null) {
  if (appState.activeFeature && typeof appState.activeFeature.unmount === 'function') {
    appState.activeFeature.unmount(root);
  }
  appState.activeFeatureKey = nextKey;
  appState.featureContext = context;
  await mountActiveFeature(root);
}

async function mountActiveFeature(root) {
  if (!root) return;

  showSplash(appState.currentUser ? 'Cargando tu sesión…' : 'Despertando el servidor, un momento.');
  try {
    updateShellNavigation();

    const {
      createCatalogosFeature,
      createConfiguracionFeature,
      createSeguimientoFeature,
      createReporteFeature,
      fetchSettings,
    } = await loadFeatureModules();

    const [settings, reports] = await Promise.all([
      fetchSettings().catch(() => ({})),
      fetchReports().catch(() => []),
    ]);
    appState.settings = settings;
    appState.reports = Array.isArray(reports) ? reports : [];

    // Keep shared RCM metadata aligned with Configuracion before any feature mounts.
    resetRcmWeeks();
    applyRcmWeeksConfig(settings?.rcm_weeks_config);

    const features = {
      reporte: createReporteFeature({
        initialContext: appState.featureContext,
        currentUser: appState.currentUser,
        settings,
        onNavigate: async (featureKey, context) => activateFeature(root, featureKey, context),
      }),
      catalogos: createCatalogosFeature({ currentUser: appState.currentUser }),
      configuracion: createConfiguracionFeature({ currentUser: appState.currentUser }),
      seguimiento: createSeguimientoFeature({
        currentUser: appState.currentUser,
        settings,
        onNavigate: async (featureKey, context) => activateFeature(root, featureKey, context),
      }),
    };

    const nextFeature = features[appState.activeFeatureKey];
    appState.activeFeature = nextFeature;
    await nextFeature.mount(root);
    syncGlobalGraceBanner(root);
  } finally {
    hideSplash();
  }
}

export async function bootstrapApp(options = {}) {
  appState.rootSelector = options.rootSelector || appState.rootSelector;
  const root = document.querySelector(appState.rootSelector);
  if (!root) return;
  const globalGraceBannerClose = document.querySelector('#global-grace-banner-close');
  const globalGraceBannerCapture = document.querySelector('#global-grace-banner-capture');

  applyPreviewFlags();
  const loginExperience = createLoginExperience();
  loginExperience.init();
  appState.currentUser = restoreStoredSession();
  if (!appState.currentUser) {
    // Show login immediately after sign out; splash is for async feature boot only.
    hideSplash();
    appState.currentUser = await loginExperience.resolveSession();
  }

  const userChip = document.querySelector('#user-chip');
  if (userChip) userChip.addEventListener('click', () => {
    clearStoredSession();
    window.location.reload();
  });

  const mobileLogoutButton = document.querySelector('#tmc-logout-btn');
  if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', () => {
    clearStoredSession();
    window.location.reload();
  });

  const mobileTopbarButton = document.querySelector('#topbar-mobile-btn');
  if (mobileTopbarButton) mobileTopbarButton.addEventListener('click', () => {
    const mobileCard = document.querySelector('#topbar-mobile-card');
    const mobileButton = document.querySelector('#topbar-mobile-btn');
    if (!mobileCard || !mobileButton) return;
    const nextHidden = !mobileCard.hidden;
    mobileCard.hidden = nextHidden;
    mobileButton.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
  });

  document.querySelectorAll('[data-feature-key]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextKey = String(button.dataset.featureKey || 'reporte');
      if (nextKey === appState.activeFeatureKey) return;
      await activateFeature(root, nextKey, null);
    });
  });

  globalGraceBannerClose?.addEventListener('click', () => {
    appState.graceBannerDismissed = true;
    syncGlobalGraceBanner(root);
  });

  globalGraceBannerCapture?.addEventListener('click', async () => {
    const info = getGlobalGraceBannerInfo();
    if (!info) return;
    appState.graceBannerDismissed = false;
    await activateFeature(root, 'reporte', {
      mode: 'capture',
      cellNumber: info.cellNumber,
      week: info.week,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  await mountActiveFeature(root);
  loginExperience.hide();
}
