import { attachSettingsController } from './controllers/settings.controller.js?v=20260622-config-events-fix-1';
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
} from './views/settings-shell.js?v=20260622-config-events-fix-2';
import { getCurrentLang, setLang } from '../../i18n.js';

function canEditOperationalSettings(user) {
  return Boolean(user && user.isAdmin);
}

export function createConfiguracionFeature(options = {}) {
  const state = {
    settings: createSettingsState(),
    preferences: createPreferencesState(),
    statuses: createStatusState(),
    rcmWeeks: [],
    currentLang: getCurrentLang(),
    currentUser: options.currentUser || null,
    canEditOperational: canEditOperationalSettings(options.currentUser || null),
    mobileSection: 'cycle',
    mobileRcmExpanded: false,
    rcmEditorWeek: null,
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

  function appConfirm(message, title = 'Confirmar', options = {}) {
    return new Promise((resolve) => {
      const scope = currentRoot || document;
      const dialog = scope.querySelector('#app-confirm-dialog');
      const messageNode = scope.querySelector('#app-confirm-message');
      const titleNode = scope.querySelector('#app-confirm-title');
      const okButton = scope.querySelector('#app-confirm-ok');
      const cancelButton = scope.querySelector('#app-confirm-cancel');
      const okLabel = String(options?.okLabel || 'Confirmar').trim() || 'Confirmar';
      const cancelLabel = String(options?.cancelLabel || 'Cancelar').trim() || 'Cancelar';
      if (!(dialog instanceof HTMLDialogElement) || !(messageNode instanceof HTMLElement) || !(okButton instanceof HTMLButtonElement) || !(cancelButton instanceof HTMLButtonElement)) {
        resolve(window.confirm(message));
        return;
      }
      const previousOkText = okButton.textContent;
      const previousCancelText = cancelButton.textContent;
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = title;
      }
      messageNode.textContent = message;
      okButton.textContent = okLabel;
      cancelButton.textContent = cancelLabel;
      if (!dialog.open) {
        dialog.showModal();
      }
      const cleanup = (result) => {
        okButton.removeEventListener('click', onOk);
        cancelButton.removeEventListener('click', onCancel);
        dialog.removeEventListener('click', onBackdrop);
        dialog.removeEventListener('cancel', onDialogCancel);
        if (dialog.open) {
          dialog.close();
        }
        okButton.textContent = previousOkText;
        cancelButton.textContent = previousCancelText;
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (event) => {
        if (event.target === dialog) {
          cleanup(false);
        }
      };
      const onDialogCancel = (event) => {
        event.preventDefault();
        cleanup(false);
      };
      okButton.addEventListener('click', onOk);
      cancelButton.addEventListener('click', onCancel);
      dialog.addEventListener('click', onBackdrop);
      dialog.addEventListener('cancel', onDialogCancel);
    });
  }

  function buildCyclePayload(formData) {
    const cycleStartDate = String(formData.get('cycle_start_date') || '').trim();
    return {
      cycleStartDate,
      payload: {
        cycle_start_date: cycleStartDate,
        week_start_day: String(formData.get('week_start_day') || '0'),
        report_grace_hours: String(Math.max(0, parseInt(String(formData.get('report_grace_hours') || '0'), 10) || 0)),
        process_entry_late_weeks: String(Math.max(0, parseInt(String(formData.get('process_entry_late_weeks') || '14'), 10) || 0)),
      },
    };
  }

  function buildGoalsPayload(formData) {
    const levantateGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_levantate') || '4'), 10) || 0);
    const restauracionGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_restauracion') || '3'), 10) || 0);
    const bautismosGoal = Math.max(0, parseInt(String(formData.get('rcm_goal_bautismos') || '2'), 10) || 0);
    return {
      levantateGoal,
      restauracionGoal,
      bautismosGoal,
      payload: {
        rcm_goal_levantate: String(levantateGoal),
        rcm_goal_restauracion: String(restauracionGoal),
        rcm_goal_bautismos: String(bautismosGoal),
      },
    };
  }

  async function saveCycle(formData) {
    const { cycleStartDate, payload } = buildCyclePayload(formData);
    if (!cycleStartDate) {
      setStatus('cycle', 'Ingresa una fecha.', true, 0);
      render();
      return;
    }

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

  async function saveCycleSection(cycleFormData, goalsFormData) {
    const { cycleStartDate, payload: cyclePayload } = buildCyclePayload(cycleFormData);
    if (!cycleStartDate) {
      setStatus('cycle', 'Ingresa una fecha.', true, 0);
      render();
      return;
    }

    const { levantateGoal, restauracionGoal, bautismosGoal, payload: goalsPayload } = buildGoalsPayload(goalsFormData);

    try {
      const savedSettings = await saveSettings({
        ...cyclePayload,
        ...goalsPayload,
      }, { requestFn: options.requestFn });
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

      clearStatus('goals');
      setStatus('cycle', '✓ Ciclo y metas guardados');
      render();
    } catch (error) {
      setStatus('cycle', error.message || 'Error al guardar la configuración del ciclo.', true, 0);
      render();
    }
  }

  async function saveGoals(formData) {
    if (!state.canEditOperational) {
      setStatus('goals', 'Solo administradores pueden cambiar metas.', true, 0);
      render();
      return;
    }

    const { levantateGoal, restauracionGoal, bautismosGoal, payload } = buildGoalsPayload(formData);

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
    const confirmed = await appConfirm(`¿Quitar semana ${weekNumber}?`, 'Quitar semana', {
      okLabel: 'Quitar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;
    state.rcmWeeks = renumberRcmWeeks(state.rcmWeeks.filter((entry) => entry.week !== weekNumber));
    if (state.rcmEditorWeek === weekNumber) {
      state.rcmEditorWeek = null;
    }
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
    const confirmed = await appConfirm('¿Restablecer valores predeterminados del ciclo?', 'Restablecer ciclo', {
      okLabel: 'Restablecer',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;
    try {
      resetRcmWeeks();
      const serializedConfig = '[]';
      await saveSettings({ rcm_weeks_config: serializedConfig }, { requestFn: options.requestFn });
      state.settings = { ...state.settings, rcm_weeks_config: serializedConfig };
      state.rcmWeeks = normalizeRcmWeeksConfig(serializedConfig);
      state.rcmEditorWeek = null;
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
      saveCycleSection,
      saveGoals,
      savePreferences,
      setLanguage: updateLanguage,
      addRcmWeek,
      removeRcmWeek,
      updateRcmWeek,
      saveRcmWeeks,
      resetRcmWeeks: resetRcmWeeksToDefault,
      getMobileSection: () => state.mobileSection,
      setMobileSection: (section) => {
        state.mobileSection = section;
      },
      getMobileRcmExpanded: () => state.mobileRcmExpanded,
      toggleMobileRcmExpanded: () => {
        state.mobileRcmExpanded = !state.mobileRcmExpanded;
        render();
      },
      openRcmEventsDialog: (weekNumber) => {
        state.rcmEditorWeek = weekNumber;
        render();
      },
      closeRcmEventsDialog: () => {
        state.rcmEditorWeek = null;
        render();
      },
      getOpenRcmEventsDialogWeek: () => state.rcmEditorWeek,
    });
    const dialog = currentRoot.querySelector('#settings-rcm-events-dialog');
    if (dialog instanceof HTMLDialogElement && !dialog.open) {
      dialog.showModal();
    }
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
