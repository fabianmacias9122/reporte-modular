import { attachSettingsController } from './controllers/settings.controller.js';
import { fetchSettings, saveFriendTrackingGoals, saveSettings } from './data/settings.repository.js';
import { applyRcmWeeksConfig, resetRcmWeeks } from '../../core/rcm/index.js';
import {
  createPreferencesState,
  createRcmWeekEntry,
  createSettingsState,
  createStatusState,
  getCurrentQuarter,
  normalizeRcmWeeksConfig,
  renumberRcmWeeks,
  saveHistoryScope,
  serializeRcmWeeksConfig,
  updateRcmWeekEntry,
} from './models/settings-state.js';
import {
  renderSettingsInsights,
  renderSettingsQuarterBody,
  renderSettingsShell,
  renderSettingsWeekPreview,
} from './views/settings-shell.js';
import { getCurrentLang, setLang } from '../../i18n.js';

export function createConfiguracionFeature(options = {}) {
  const state = {
    settings: createSettingsState(),
    preferences: createPreferencesState(),
    statuses: createStatusState(),
    rcmWeeks: [],
    currentLang: getCurrentLang(),
    currentUser: options.currentUser || null,
  };

  let currentRoot = null;
  const statusTimeouts = new Map();

  function syncLanguageButtons() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('#lang-switcher .lang-btn').forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.classList.toggle('is-active', String(button.dataset.lang || '') === state.currentLang);
    });
  }

  async function load() {
    state.settings = await fetchSettings({ requestFn: options.requestFn });
    state.rcmWeeks = normalizeRcmWeeksConfig(state.settings.rcm_weeks_config);
    applyRcmWeeksConfig(state.settings.rcm_weeks_config);
  }

  function clearStatus(key) {
    const timeoutId = statusTimeouts.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      statusTimeouts.delete(key);
    }
    state.statuses[key] = {
      message: '',
      isError: false,
    };
  }

  function setStatus(key, message, isError = false, timeout = 3000) {
    clearStatus(key);
    state.statuses[key] = { message, isError };
    if (timeout > 0) {
      const timeoutId = window.setTimeout(() => {
        state.statuses[key] = { message: '', isError: false };
        statusTimeouts.delete(key);
        render();
      }, timeout);
      statusTimeouts.set(key, timeoutId);
    }
  }

  async function saveCycle(formData) {
    const cycleStartDate = String(formData.get('cycle_start_date') || '').trim();
    if (!cycleStartDate) {
      setStatus('cycle', 'Ingresa una fecha.', true, 0);
      render();
      return;
    }

    const payload = {
      cycle_start_date: cycleStartDate,
      week_start_day: String(formData.get('week_start_day') || '0'),
      report_grace_hours: String(Math.max(0, parseInt(String(formData.get('report_grace_hours') || '0'), 10) || 0)),
      process_entry_late_weeks: String(Math.max(0, parseInt(String(formData.get('process_entry_late_weeks') || '14'), 10) || 0)),
    };

    try {
      const savedSettings = await saveSettings(payload, { requestFn: options.requestFn });
      state.settings = { ...state.settings, ...savedSettings };
      setStatus('cycle', '✓ Guardado');
      render();
    } catch (error) {
      setStatus('cycle', error.message || 'Error al guardar.', true, 0);
      render();
    }
  }

  function preview(formData) {
    state.settings = {
      ...state.settings,
      ...Object.fromEntries(formData.entries()),
    };
    renderInsights();
  }

  async function saveGoals(formData) {
    const levantateGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_levantate') || '4'), 10) || 0);
    const restauracionGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_restauracion') || '3'), 10) || 0);
    const bautismosGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_bautismos') || '2'), 10) || 0);
    const payload = {
      rcm_goal_levantate: String(levantateGoal),
      rcm_goal_restauracion: String(restauracionGoal),
      rcm_goal_bautismos: String(bautismosGoal),
    };

    try {
      const savedSettings = await saveSettings(payload, { requestFn: options.requestFn });
      state.settings = { ...state.settings, ...savedSettings };

      if (state.currentUser?.assignedCellNumber) {
        const now = new Date();
        await saveFriendTrackingGoals({
          cellNumber: String(state.currentUser.assignedCellNumber),
          year: String(now.getFullYear()),
          quarter: String(getCurrentQuarter(now)),
          levantateGoal,
          restauracionGoal,
          bautismosGoal,
        }, { requestFn: options.requestFn });
      }

      setStatus('goals', '✓ Metas guardadas');
      render();
    } catch (error) {
      setStatus('goals', error.message || 'Error al guardar metas.', true, 0);
      render();
    }
  }

  async function savePreferences(formData) {
    state.preferences = {
      ...state.preferences,
      history_scope: saveHistoryScope(formData.get('history_scope')),
    };
    setStatus('preferences', '✓ Guardado', false, 2500);
    render();
  }

  async function updateLanguage(formData) {
    state.currentLang = setLang(formData.get('settings_lang'));
    syncLanguageButtons();
    render();
  }

  async function addRcmWeek() {
    const previousEntry = state.rcmWeeks[state.rcmWeeks.length - 1] || null;
    state.rcmWeeks = [...state.rcmWeeks, createRcmWeekEntry(state.rcmWeeks.length + 1, previousEntry)];
    render();
  }

  async function removeRcmWeek(weekNumber) {
    if (state.rcmWeeks.length <= 1) {
      setStatus('verbs', 'Debe haber al menos una semana.', true, 0);
      render();
      return;
    }
    const confirmed = window.confirm(`¿Quitar semana ${weekNumber}?`);
    if (!confirmed) return;
    state.rcmWeeks = renumberRcmWeeks(state.rcmWeeks.filter((entry) => entry.week !== weekNumber));
    render();
  }

  async function updateRcmWeek(weekNumber, changes) {
    state.rcmWeeks = updateRcmWeekEntry(state.rcmWeeks, weekNumber, changes);
    render();
  }

  async function saveRcmWeeks() {
    if (!state.rcmWeeks.length) {
      setStatus('verbs', 'Debe haber al menos una semana.', true, 0);
      render();
      return;
    }

    const serializedConfig = serializeRcmWeeksConfig(state.rcmWeeks);
    try {
      const savedSettings = await saveSettings({ rcm_weeks_config: serializedConfig }, { requestFn: options.requestFn });
      state.settings = { ...state.settings, ...savedSettings, rcm_weeks_config: serializedConfig };
      applyRcmWeeksConfig(serializedConfig);
      setStatus('verbs', '✓ Guardado');
      render();
    } catch (error) {
      setStatus('verbs', error.message || 'Error al guardar.', true, 0);
      render();
    }
  }

  async function resetRcmWeeksToDefault() {
    const confirmed = window.confirm('¿Restablecer valores predeterminados del ciclo?');
    if (!confirmed) return;
    try {
      resetRcmWeeks();
      const serializedConfig = '[]';
      await saveSettings({ rcm_weeks_config: serializedConfig }, { requestFn: options.requestFn });
      state.settings = { ...state.settings, rcm_weeks_config: serializedConfig };
      state.rcmWeeks = normalizeRcmWeeksConfig(serializedConfig);
      setStatus('verbs', '✓ Restablecido');
      render();
    } catch (error) {
      setStatus('verbs', error.message || 'Error al restablecer.', true, 0);
      render();
    }
  }

  function renderInsights() {
    if (!currentRoot) return;
    const insightsRoot = currentRoot.querySelector('#configuracion-insights');
    if (insightsRoot) {
      insightsRoot.innerHTML = renderSettingsInsights(state.settings);
    }
    const previewRoot = currentRoot.querySelector('#settings-week-preview');
    const quarterRoot = currentRoot.querySelector('#settings-quarter-body');
    if (previewRoot) {
      previewRoot.innerHTML = renderSettingsWeekPreview(state.settings);
    }
    if (quarterRoot) {
      quarterRoot.innerHTML = renderSettingsQuarterBody();
    }
  }

  function render() {
    if (!currentRoot) return;
    currentRoot.innerHTML = renderSettingsShell(state);
    syncLanguageButtons();
    attachSettingsController(currentRoot, {
      preview,
      saveCycle,
      saveGoals,
      savePreferences,
      setLanguage: updateLanguage,
      addRcmWeek,
      removeRcmWeek,
      updateRcmWeek,
      saveRcmWeeks,
      resetRcmWeeks: resetRcmWeeksToDefault,
    });
  }

  return {
    async mount(root) {
      currentRoot = root || null;
      await load();
      render();
    },
    unmount(root) {
      statusTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      statusTimeouts.clear();
      currentRoot = null;
      if (root) {
        root.innerHTML = '';
      }
    },
  };
}
