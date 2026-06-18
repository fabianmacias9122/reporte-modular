import { fetchCatalogs } from '../catalogos/data/catalogos.repository.js';
import { saveSettings } from '../configuracion/data/settings.repository.js';
import { getRcmWeekInfo } from '../../core/rcm/index.js';
import { attachReporteController } from './controllers/reporte.controller.js';
import { fetchReport, fetchReports, saveReport } from './data/reporte.repository.js';
import {
  addKid,
  addBaptism,
  addVisitor,
  applyCellToReportForm,
  applyWeekMeta,
  buildInitialReportForm,
  buildReportHistoryState,
  buildInvitedByOptions,
  buildVisitorHistory,
  computeBaptismMetrics,
  copyKidReachToSunday,
  copyPlanningToReach,
  copyReachToSunday,
  createBaptismQuickForm,
  createKidQuickForm,
  createVisitorQuickForm,
  clearKidActivities,
  clearPlanningAttendance,
  clearReachAttendance,
  clearSundayAttendance,
  clearVisitorActivities,
  fillPlanningAttendance,
  fillReachAttendance,
  fillSundayAttendance,
  fillSundayKids,
  buildReportPayload,
  createReportFormData,
  createReporteState,
  createWeekOptions,
  getExternalParticipantKindLabel,
  getBaptismCaptureStatus,
  getBaptismRegistrationMessage,
  getQuarterWeekNumber,
  getPlanningSummary,
  getReachExternalParticipantCandidates,
  getReachExternalParticipants,
  getVisitorProcessOptions,
  getReachSummary,
  getSundaySummary,
  getWeeklySummary,
  getPeopleByRole,
  getVisibleCells,
  getVisitorProcessStatusLabel,
  normalizeReporteContext,
  findVisitorHistoryEntry,
  removeBaptism,
  removeKid,
  removeVisitor,
  toggleExternalParticipantSelection,
  updatePlanningAttendance,
  updateMemberRcmEvent,
  updateReachAttendance,
  updateSundayAttendance,
  updateBaptism,
  updateVisitor,
  updateKid,
} from './models/reporte-state.js';
import { renderReporteShell } from './views/reporte-shell.js';

export function createReporteFeature(options = {}) {
  const state = createReporteState(normalizeReporteContext(options.initialContext));
  let currentRoot = null;
  let feedbackTimer = null;
  let visitorInlineMessageTimer = null;
  let graceBannerTimer = null;
  let rowHighlightTimer = null;
  let quickAddLock = false;
  let submittedEditConfirmedReportId = '';
  let recentFinalizedReportContext = null;
  let lastQuickAdd = { kind: '', at: 0 };
  const STAGE_ORDER = ['encabezado', 'planificacion', 'alcance', 'culto', 'cierre'];
  const STAGE_STATUS_FIELDS = {
    planificacion: 'planningStatus',
    alcance: 'reachStatus',
    culto: 'sundayStatus',
  };
  const STAGE_ATTENDED_FIELDS = {
    planificacion: 'planningAttended',
    alcance: 'reachAttended',
    culto: 'sundayAttended',
  };
  const STAGE_LABELS = {
    encabezado: 'Inicio',
    planificacion: 'Planeación',
    alcance: 'Alcance',
    culto: 'Culto',
    cierre: 'Cierre',
  };
  const VISITOR_HISTORY_HIDDEN_KEY = 'visitor_history_hidden_map';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeVisitorNameKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getVisitorHistoryHiddenMap() {
    try {
      const parsed = JSON.parse(String(state.settings?.[VISITOR_HISTORY_HIDDEN_KEY] || '{}'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function getHiddenVisitorNamesForCell(cellNumber = state.form?.cellNumber) {
    const activeCellNumber = String(cellNumber || '').trim();
    if (!activeCellNumber) return new Set();
    const hiddenMap = getVisitorHistoryHiddenMap();
    const list = Array.isArray(hiddenMap[activeCellNumber]) ? hiddenMap[activeCellNumber] : [];
    return new Set(list.map((name) => normalizeVisitorNameKey(name)).filter(Boolean));
  }

  function syncVisitorHistoryViewState() {
    const hiddenNames = getHiddenVisitorNamesForCell();
    state.visibleVisitorHistory = (Array.isArray(state.visitorHistory) ? state.visitorHistory : [])
      .filter((entry) => !hiddenNames.has(normalizeVisitorNameKey(entry?.name)));
    state.hiddenVisitorHistoryCount = hiddenNames.size;
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
      okButton.addEventListener('click', onOk);
      cancelButton.addEventListener('click', onCancel);
      dialog.addEventListener('click', onBackdrop);
    });
  }

  function appAcknowledge(message, title = 'Aviso', okLabel = 'Entendido') {
    return new Promise((resolve) => {
      const scope = currentRoot || document;
      const dialog = scope.querySelector('#app-confirm-dialog');
      const messageNode = scope.querySelector('#app-confirm-message');
      const titleNode = scope.querySelector('#app-confirm-title');
      const okButton = scope.querySelector('#app-confirm-ok');
      const cancelButton = scope.querySelector('#app-confirm-cancel');
      if (!(dialog instanceof HTMLDialogElement) || !(messageNode instanceof HTMLElement) || !(okButton instanceof HTMLButtonElement) || !(cancelButton instanceof HTMLButtonElement)) {
        window.alert(message);
        resolve();
        return;
      }

      const previousOkText = okButton.textContent;
      const previousCancelHidden = cancelButton.hidden;
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = title;
      }
      messageNode.textContent = message;
      okButton.textContent = okLabel;
      cancelButton.hidden = true;

      if (!dialog.open) {
        dialog.showModal();
      }

      const cleanup = () => {
        okButton.removeEventListener('click', onOk);
        dialog.removeEventListener('cancel', onCancelEvent);
        if (dialog.open) {
          dialog.close();
        }
        okButton.textContent = previousOkText;
        cancelButton.hidden = previousCancelHidden;
        resolve();
      };
      const onOk = () => cleanup();
      const onCancelEvent = (event) => {
        event.preventDefault();
      };

      okButton.addEventListener('click', onOk);
      dialog.addEventListener('cancel', onCancelEvent);
    });
  }

  function clearGlobalFeedback() {
    const feedback = document.querySelector('#feedback');
    if (!(feedback instanceof HTMLElement)) return;
    feedback.hidden = true;
    feedback.textContent = '';
  }

  function syncGlobalFeedback() {
    const feedback = document.querySelector('#feedback');
    if (!(feedback instanceof HTMLElement)) return;
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
    if (!state.message) {
      clearGlobalFeedback();
      return;
    }
    feedback.hidden = false;
    feedback.textContent = state.message;
    feedback.style.background = state.isError ? '#fdf0ee' : '#edf7f2';
    feedback.style.color = state.isError ? '#7a1f14' : '#145c38';
    feedback.style.borderColor = state.isError ? '#e8b4ae' : '#91d5b3';
    feedbackTimer = setTimeout(() => {
      state.message = '';
      state.isError = false;
      clearGlobalFeedback();
      feedbackTimer = null;
    }, state.isError ? 6000 : 3500);
  }

  function focusField(selector) {
    const field = currentRoot?.querySelector(selector);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
      field.focus();
    }
  }

  function revealLastRow(selector) {
    const rows = currentRoot?.querySelectorAll(selector);
    const lastRow = rows?.length ? rows[rows.length - 1] : null;
    if (!(lastRow instanceof HTMLElement) || typeof lastRow.scrollIntoView !== 'function') return;
    try {
      lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch {
      // Ignore environments with partial scrollIntoView support.
    }
  }

  function scheduleVisitorInlineMessageClear() {
    if (visitorInlineMessageTimer) {
      clearTimeout(visitorInlineMessageTimer);
      visitorInlineMessageTimer = null;
    }
    if (!state.visitorInlineMessage) {
      return;
    }
    visitorInlineMessageTimer = setTimeout(() => {
      state.visitorInlineMessage = '';
      visitorInlineMessageTimer = null;
      render({ preserveScroll: true });
    }, 4200);
  }

  function syncVisitorQuickFormFromDom() {
    const currentForm = state.visitorQuickForm || createVisitorQuickForm();
    if (!currentRoot) return currentForm;
    const historyField = currentRoot.querySelector('#visitor-quick-history');
    const nameField = currentRoot.querySelector('#visitor-quick-name');
    const kindField = currentRoot.querySelector('#visitor-quick-kind');
    const invitedByField = currentRoot.querySelector('#visitor-quick-invited-by');
    const processField = currentRoot.querySelector('#visitor-quick-process-entry');
    const reachField = currentRoot.querySelector('input[data-visitor-field="reachAttended"]');
    const firstVisitField = currentRoot.querySelector('input[data-visitor-field="firstVisit"]');
    const convertedField = currentRoot.querySelector('input[data-visitor-field="converted"]');
    const eventField = currentRoot.querySelector('input[data-visitor-field="eventAttended"]');
    const sundayField = currentRoot.querySelector('input[data-visitor-field="sundayAttended"]');
    const nextForm = {
      ...currentForm,
      historySelection: historyField instanceof HTMLSelectElement ? historyField.value : currentForm.historySelection,
      name: nameField instanceof HTMLInputElement ? nameField.value : currentForm.name,
      kind: kindField instanceof HTMLSelectElement ? kindField.value : currentForm.kind,
      invitedBy: invitedByField instanceof HTMLSelectElement ? invitedByField.value : currentForm.invitedBy,
      processEntry: processField instanceof HTMLSelectElement ? processField.value : currentForm.processEntry,
      reachAttended: reachField instanceof HTMLInputElement ? reachField.checked : currentForm.reachAttended,
      firstVisit: firstVisitField instanceof HTMLInputElement ? firstVisitField.checked : currentForm.firstVisit,
      converted: convertedField instanceof HTMLInputElement ? convertedField.checked : currentForm.converted,
      eventAttended: eventField instanceof HTMLInputElement ? eventField.checked : currentForm.eventAttended,
      sundayAttended: sundayField instanceof HTMLInputElement ? sundayField.checked : currentForm.sundayAttended,
    };
    state.visitorQuickForm = nextForm;
    return nextForm;
  }

  function syncKidQuickFormFromDom() {
    if (!currentRoot) return;
    const nameField = currentRoot.querySelector('#kid-quick-name');
    const guardianField = currentRoot.querySelector('input[data-kid-quick-field="guardianName"]');
    const reachField = currentRoot.querySelector('#kid-quick-reach');
    const sundayField = currentRoot.querySelector('#kid-quick-sunday');
    const currentForm = state.kidQuickForm || createKidQuickForm();
    state.kidQuickForm = {
      ...currentForm,
      name: nameField instanceof HTMLInputElement ? nameField.value : currentForm.name,
      guardianName: guardianField instanceof HTMLInputElement ? guardianField.value : currentForm.guardianName,
      reachAttended: reachField instanceof HTMLInputElement ? reachField.checked : currentForm.reachAttended,
      // Quick kid form no longer captures Culto; it starts unchecked by default.
      sundayAttended: false,
    };
  }

  function highlightLastRow(selector) {
    const rows = currentRoot?.querySelectorAll(selector);
    const lastRow = rows?.length ? rows[rows.length - 1] : null;
    if (!(lastRow instanceof HTMLElement)) return;
    if (rowHighlightTimer) {
      clearTimeout(rowHighlightTimer);
      rowHighlightTimer = null;
    }
    lastRow.classList.remove('is-just-added');
    void lastRow.offsetWidth;
    lastRow.classList.add('is-just-added');
    rowHighlightTimer = setTimeout(() => {
      lastRow.classList.remove('is-just-added');
      rowHighlightTimer = null;
    }, 1800);
  }

  function applyQuickVisitorHistory(name, { keepHistorySelection = false } = {}) {
    const selectedName = String(name || '').trim();
    const history = findVisitorHistoryEntry(state.visitorHistory, selectedName);
    const currentForm = state.visitorQuickForm || createVisitorQuickForm();
    const resolvedKind = history?.kind || currentForm.kind;
    const normalizedKind = resolvedKind === 'visita' ? 'visita' : 'amigo';
    const processEntry = normalizedKind === 'amigo'
      ? String(history?.processEntry || currentForm.processEntry || 'none').trim() || 'none'
      : 'none';

    state.visitorQuickForm = {
      ...currentForm,
      name: selectedName,
      historySelection: keepHistorySelection ? selectedName : currentForm.historySelection,
      invitedBy: currentForm.invitedBy || String(history?.invitedBy || '').trim(),
      kind: normalizedKind,
      // Keep Culto unchecked by default when loading a previous friend in quick form.
      sundayAttended: false,
      firstVisit: history ? false : currentForm.firstVisit,
      processEntry,
      converted: normalizedKind === 'visita' ? false : Boolean(currentForm.converted || history?.converted),
      phone: String(currentForm.phone || history?.phone || '').trim(),
    };
    state.visitorProcessOptions = getVisitorProcessOptions(state.form, state.settings, state.visitorQuickForm.kind);
  }

  function syncOptions() {
    state.weekOptions = createWeekOptions(state.settings, state.reports, state.form.cellNumber);
    state.cellOptions = getVisibleCells(state.catalogs, state.currentUser).map((cell) => ({
      value: String(cell.cellNumber || ''),
      label: (() => {
        const members = (Array.isArray(cell?.members) ? cell.members : []).filter((member) => String(member?.role || '') !== 'kid').length;
        const kids = (Array.isArray(cell?.members) ? cell.members : []).filter((member) => String(member?.role || '') === 'kid').length;
        const memberLabel = `${members} miembro${members === 1 ? '' : 's'}`;
        const kidLabel = `${kids} niño${kids === 1 ? '' : 's'}`;
        return `${cell.cellNumber} · ${cell.networkName || 'Sin red'} · ${memberLabel} · ${kidLabel}`;
      })(),
    }));
    state.canEditCell = Boolean(!state.currentUser || state.currentUser?.isAdmin);
    state.canEditCurrentReport = canEditCurrentReport();
    state.peopleOptions = {
      leaders: getPeopleByRole(state.catalogs, 'leader'),
      assistants: getPeopleByRole(state.catalogs, 'assistant'),
      hosts: getPeopleByRole(state.catalogs, 'host'),
    };
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismCaptureStatus = getBaptismCaptureStatus(state.form.reportDate);
    state.baptismRegistrationMessage = getBaptismRegistrationMessage(state.baptismCaptureStatus);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    state.invitedByOptions = buildInvitedByOptions(state.form, state.catalogs);
    state.visitorQuickForm = state.visitorQuickForm || createVisitorQuickForm();
    state.baptismQuickForm = state.baptismQuickForm || createBaptismQuickForm(state.form.reportDate);
    state.kidQuickForm = state.kidQuickForm || createKidQuickForm();
    state.visitorProcessOptions = getVisitorProcessOptions(state.form, state.settings, state.visitorQuickForm.kind);
    state.visitorProcessOptionsByKind = {
      amigo: getVisitorProcessOptions(state.form, state.settings, 'amigo'),
      visita: getVisitorProcessOptions(state.form, state.settings, 'visita'),
    };
    state.visitorHistory = buildVisitorHistory(state.reports, state.form.cellNumber, state.reportId || state.context?.reportId);
    syncVisitorHistoryViewState();
    state.findVisitorHistoryEntry = findVisitorHistoryEntry;
    state.getVisitorProcessStatusLabel = getVisitorProcessStatusLabel;
    state.reachExternalCandidates = getReachExternalParticipantCandidates(state.catalogs, state.form.cellNumber);
    state.reachExternalSelected = getReachExternalParticipants(state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.reachExternalKindLabel = getExternalParticipantKindLabel;
    state.reportHistory = buildReportHistoryState(state.reports, state.currentUser, state.settings);
  }

  async function setStage(nextStage) {
    if (!STAGE_ORDER.includes(nextStage)) return;

    const formNode = currentRoot?.querySelector('#report-form, #reporte-form');
    if (formNode instanceof HTMLFormElement) {
      preview(new FormData(formNode));
    }

    if (nextStage !== 'encabezado') {
      const selectedWeek = parseInt(String(state.form?.week || '').trim(), 10);
      const maxWeek = getQuarterWeekNumber(state.settings);
      if (Number.isFinite(selectedWeek) && selectedWeek > maxWeek) {
        state.message = `No puedes avanzar: semana ${selectedWeek} es mayor a la semana activa (${maxWeek}).`;
        state.isError = true;
        render({ scrollStageTab: false, preserveScroll: true });
        return;
      }
    }

    const movingFromHeader = state.activeStage === 'encabezado' && nextStage !== 'encabezado';
    if (movingFromHeader) {
      if (formNode instanceof HTMLFormElement) {
        const headerData = new FormData(formNode);
        state.form = applyWeekMeta({
          ...state.form,
          ...Object.fromEntries(headerData.entries()),
        });
        state.form = applyCellToReportForm(state.form, state.catalogs);
      }

      if (!state.reportId && !reportHasMeaningfulData(state.form)) {
        const cellValue = String(state.form?.cellNumber || '').trim();
        const weekValue = String(state.form?.week || '').trim();
        if (cellValue && weekValue) {
          const reopenResult = await tryOpenHeaderReportForContinue(cellValue, weekValue, {
            confirmFinalizedEdit: false,
            refreshReports: true,
          });
          if (reopenResult !== null) {
            if (reopenResult === false) return;
            render({ scrollStageTab: true, preserveScroll: false });
            return;
          }
        }
      }
    }

    state.activeStage = nextStage;
    render({ scrollStageTab: true, preserveScroll: false });
  }

  async function continueFromHeader(nextStage, formData) {
    if (!STAGE_ORDER.includes(nextStage) || nextStage === 'encabezado') {
      return setStage(nextStage);
    }

    preview(formData);
    state.form = applyCellToReportForm(state.form, state.catalogs);

    const selectedWeek = parseInt(String(state.form?.week || '').trim(), 10);
    const maxWeek = getQuarterWeekNumber(state.settings);
    if (Number.isFinite(selectedWeek) && selectedWeek > maxWeek) {
      state.message = `No puedes avanzar: semana ${selectedWeek} es mayor a la semana activa (${maxWeek}).`;
      state.isError = true;
      render({ scrollStageTab: false, preserveScroll: true });
      return;
    }

    if (!state.reportId && !reportHasMeaningfulData(state.form)) {
      const cellValue = String(state.form?.cellNumber || '').trim();
      const weekValue = String(state.form?.week || '').trim();
      if (cellValue && weekValue) {
        const reopenResult = await tryOpenHeaderReportForContinue(cellValue, weekValue, {
          confirmFinalizedEdit: false,
          refreshReports: true,
        });
        if (reopenResult === false) return;
        if (reopenResult === true) {
          state.activeStage = nextStage;
          render({ scrollStageTab: true, preserveScroll: false });
          return;
        }
      }
    }

    state.activeStage = nextStage;
    render({ scrollStageTab: true, preserveScroll: false });
  }

  function getNextStage(currentStage) {
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    if (currentIndex < 0 || currentIndex >= STAGE_ORDER.length - 1) {
      return currentStage;
    }
    return STAGE_ORDER[currentIndex + 1];
  }

  function scrollToFormStart() {
    const appContent = document.querySelector('#app-content');
    if (appContent instanceof HTMLElement) {
      appContent.scrollTop = 0;
    }
    const formTop = currentRoot ? currentRoot.querySelector('#report-form') : null;
    if (formTop instanceof HTMLElement && typeof formTop.scrollIntoView === 'function') {
      try {
        formTop.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      } catch {
        // Ignore environments with partial scrollIntoView support.
      }
    }
    try {
      window.scrollTo(0, 0);
    } catch {
      // Ignore environments without window scrolling support.
    }
  }

  function deriveOverallStatus(entry) {
    const order = ['sundayStatus', 'reachStatus', 'planningStatus'];
    for (const fieldName of order) {
      const value = String(entry?.[fieldName] || '').toLowerCase();
      if (value && value !== 'pending') {
        return value;
      }
    }
    return 'pending';
  }

  function getStageIndex(stage) {
    return STAGE_ORDER.indexOf(String(stage || '').trim());
  }

  function isDraftFormData(formData) {
    return formData?._draft === true || formData?._draft === 'true';
  }

  function normalizeWeekKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/\d+/);
    if (!match) return raw;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? String(parsed) : raw;
  }

  function normalizeCellKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.match(/^\d+$/);
    if (direct) return raw;
    const prefixed = raw.match(/^(\d+)\s*[-.·]/);
    if (prefixed) return String(Number(prefixed[1]));
    const anyNumber = raw.match(/\d+/);
    if (anyNumber) return String(Number(anyNumber[0]));
    return raw;
  }

  function parseWeekNumber(value) {
    const normalized = normalizeWeekKey(value);
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function isReportEffectivelyDraft(report) {
    const formData = report?.formData || report || {};
    if (isDraftFormData(formData)) return true;
    return !hasMeaningfulReportData(report);
  }

  function findExistingReportForCellWeek(cellNumber = '', week = '') {
    const normalizedCell = normalizeCellKey(cellNumber);
    const normalizedWeek = normalizeWeekKey(week);
    if (!normalizedCell || !normalizedWeek) return null;
    const matches = (Array.isArray(state.reports) ? state.reports : []).filter((report) => {
      const reportCell = normalizeCellKey(report?.cellNumber || report?.formData?.cellNumber || '');
      const reportWeek = normalizeWeekKey(report?.week || report?.formData?.week || '');
      if (reportCell !== normalizedCell || reportWeek !== normalizedWeek) {
        return false;
      }

      const cycleStart = String(state.settings?.cycle_start_date || '').trim();
      if (!cycleStart) {
        return true;
      }

      const cycleStartTimestamp = parseReportDateValue(cycleStart);
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
    if (!matches.length) return null;
    matches.sort((left, right) => {
      const leftDraft = isReportEffectivelyDraft(left);
      const rightDraft = isReportEffectivelyDraft(right);
      const leftFinalized = !leftDraft;
      const rightFinalized = !rightDraft;
      if (leftFinalized !== rightFinalized) return leftFinalized ? -1 : 1;

      const leftMeaningful = hasMeaningfulReportData(left);
      const rightMeaningful = hasMeaningfulReportData(right);
      if (leftMeaningful !== rightMeaningful) return leftMeaningful ? -1 : 1;

      const recencyDiff = getReportRecencyValue(right) - getReportRecencyValue(left);
      if (recencyDiff !== 0) return recencyDiff;

      return Number(right?.id || 0) - Number(left?.id || 0);
    });
    return matches[0] || null;
  }

  function canModifyReportForCell(cellNumber) {
    if (!state.currentUser) return false;
    if (state.currentUser?.isSystemAccount) return true;
    const activeCell = normalizeCellKey(cellNumber || '');
    if (!activeCell) return true;
    const ownCell = normalizeCellKey(state.currentUser?.assignedCellNumber || '');
    return Boolean(ownCell && ownCell === activeCell);
  }

  function canEditCurrentReport() {
    return canModifyReportForCell(state.form?.cellNumber || '');
  }

  function clearGraceBannerTimer() {
    if (graceBannerTimer) {
      clearInterval(graceBannerTimer);
      graceBannerTimer = null;
    }
  }

  function getGraceBannerTargetCell() {
    const ownCell = String(state.currentUser?.assignedCellNumber || '').trim();
    if (ownCell) return ownCell;
    return String(state.form?.cellNumber || '').trim();
  }

  function getGraceBannerInfo() {
    if (state.graceBannerDismissed) return null;
    const graceHours = parseInt(String(state.settings?.report_grace_hours ?? '0'), 10) || 0;
    if (graceHours <= 0) return null;

    const targetCell = getGraceBannerTargetCell();
    if (!targetCell) return null;

    const realWeek = getQuarterWeekNumber(state.settings);
    if (!Number.isFinite(realWeek) || realWeek <= 1) return null;
    if (!isGracePeriodActiveForReports()) return null;

    const weekStartDay = parseInt(String(state.settings?.week_start_day ?? '0'), 10) || 0;
    const now = new Date();
    const rollover = new Date(now);
    rollover.setHours(0, 0, 0, 0);
    const diff = (rollover.getDay() - weekStartDay + 7) % 7;
    rollover.setDate(rollover.getDate() - diff);
    const msLeft = (graceHours * 3600 * 1000) - (now.getTime() - rollover.getTime());
    if (msLeft <= 0) return null;

    const graceWeek = String(realWeek - 1);
    const hasRegisteredReport = (Array.isArray(state.reports) ? state.reports : []).some((report) => {
      const reportCell = normalizeCellKey(report?.cellNumber || report?.formData?.cellNumber || '');
      const reportWeek = normalizeWeekKey(report?.week || report?.formData?.week || '');
      if (reportCell !== normalizeCellKey(targetCell) || reportWeek !== normalizeWeekKey(graceWeek)) {
        return false;
      }
      return reportBelongsToActiveCycle(report);
    });
    if (hasRegisteredReport) return null;

    return {
      cellNumber: targetCell,
      week: graceWeek,
      msLeft,
    };
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

  function syncGraceBannerUi() {
    if (!currentRoot) return;
    const banner = currentRoot.querySelector('#grace-banner');
    const bannerText = currentRoot.querySelector('#grace-banner-text');
    if (!(banner instanceof HTMLElement) || !(bannerText instanceof HTMLElement)) {
      clearGraceBannerTimer();
      return;
    }

    const info = getGraceBannerInfo();
    if (!info) {
      banner.hidden = true;
      clearGraceBannerTimer();
      return;
    }

    bannerText.innerHTML = `<strong>¿Ya enviaste tu reporte de la semana ${escapeHtml(info.week)}?</strong> Tienes <strong>${escapeHtml(formatGraceCountdown(info.msLeft))}</strong> de prórroga antes de que cierre el periodo.`;
    banner.hidden = false;

    if (!graceBannerTimer) {
      graceBannerTimer = setInterval(() => {
        syncGraceBannerUi();
      }, 1000);
    }
  }

  function isGracePeriodActiveForReports() {
    const graceHours = parseInt(String(state.settings?.report_grace_hours ?? '0'), 10) || 0;
    if (graceHours <= 0) return false;
    const weekStartDay = parseInt(String(state.settings?.week_start_day ?? '0'), 10) || 0;
    const now = new Date();
    const rollover = new Date(now);
    rollover.setHours(0, 0, 0, 0);
    const diff = (rollover.getDay() - weekStartDay + 7) % 7;
    rollover.setDate(rollover.getDate() - diff);
    return (now.getTime() - rollover.getTime()) / 3600000 < graceHours;
  }

  function reportBelongsToActiveCycle(report) {
    const cycleStart = String(state.settings?.cycle_start_date || '').trim();
    if (!cycleStart) return true;
    const cycleStartTimestamp = parseReportDateValue(cycleStart);
    if (!Number.isFinite(cycleStartTimestamp)) return true;
    const reportDate = String(report?.reportDate || report?.report_date || report?.formData?.reportDate || '').trim();
    const reportTimestamp = parseReportDateValue(reportDate);
    if (!Number.isFinite(reportTimestamp)) return true;
    return reportTimestamp >= cycleStartTimestamp;
  }

  function getBootstrapSelection(cellNumber, week) {
    const selectedCell = String(cellNumber || '').trim();
    const selectedWeek = String(week || '').trim();
    if (!selectedCell || !selectedWeek) {
      return { cellNumber: selectedCell, week: selectedWeek };
    }

    const realWeek = parseInt(selectedWeek, 10);
    if (!Number.isFinite(realWeek) || realWeek <= 0) {
      return { cellNumber: selectedCell, week: selectedWeek };
    }

    const minWeek = isGracePeriodActiveForReports()
      ? Math.max(1, realWeek - 1)
      : realWeek;

    const reportedWeeks = new Set(
      (Array.isArray(state.reports) ? state.reports : [])
        .filter((report) => {
          const reportCell = normalizeCellKey(report?.cellNumber || report?.formData?.cellNumber || '');
          if (reportCell !== normalizeCellKey(selectedCell)) {
            return false;
          }
          if (!reportBelongsToActiveCycle(report)) {
            return false;
          }
          const reportWeek = parseInt(normalizeWeekKey(report?.week || report?.formData?.week || ''), 10);
          if (!Number.isFinite(reportWeek) || reportWeek < minWeek || reportWeek > realWeek) {
            return false;
          }
          return !isDraftFormData(report?.formData || report || {});
        })
        .map((report) => parseInt(normalizeWeekKey(report?.week || report?.formData?.week || ''), 10))
        .filter((reportWeek) => Number.isFinite(reportWeek))
    );

    let nextWeek = realWeek;
    for (let currentWeek = minWeek; currentWeek <= realWeek; currentWeek += 1) {
      if (!reportedWeeks.has(currentWeek)) {
        nextWeek = currentWeek;
        break;
      }
    }

    return { cellNumber: selectedCell, week: String(nextWeek) };
  }

  function hasExplicitContextSelection() {
    return Boolean(
      String(state.context?.cellNumber || '').trim()
      && String(state.context?.week || '').trim()
    );
  }

  async function captureGraceReport() {
    const info = getGraceBannerInfo();
    if (!info) return;

    const loaded = await loadSelectedReportIntoState(info.cellNumber, info.week, {
      refreshReports: true,
      confirmFinalizedEdit: false,
    });

    if (loaded === false) {
      return;
    }

    if (loaded) {
      state.activeStage = pickResumeStage(loaded?.formData || loaded || {});
    } else {
      resetToNewReportForSelection(info.cellNumber, info.week);
      state.activeStage = 'encabezado';
    }

    syncOptions();
    render({ scrollStageTab: true, preserveScroll: false });
    scrollToFormStart();
  }

  function closeGraceBanner() {
    state.graceBannerDismissed = true;
    syncGraceBannerUi();
  }

  function isReportEditable(report) {
    const formData = report?.formData || report || {};
    const reportCell = normalizeCellKey(report?.cellNumber || formData?.cellNumber || '');
    const reportWeek = String(report?.week || formData?.week || '').trim();
    if (!reportCell || !reportWeek) return false;

    if (!canModifyReportForCell(reportCell)) {
      return false;
    }

    const reportWeekNumber = parseWeekNumber(reportWeek);
    if (!Number.isFinite(reportWeekNumber) || reportWeekNumber <= 0) return false;
    const realWeek = getQuarterWeekNumber(state.settings);
    if (reportWeekNumber === realWeek) return true;

    const graceHours = parseInt(String(state.settings?.report_grace_hours ?? '0'), 10) || 0;
    if (graceHours > 0 && reportWeekNumber === realWeek - 1) {
      const weekStartDay = parseInt(String(state.settings?.week_start_day ?? '0'), 10) || 0;
      const now = new Date();
      const rollover = new Date(now);
      rollover.setHours(0, 0, 0, 0);
      const diff = (rollover.getDay() - weekStartDay + 7) % 7;
      rollover.setDate(rollover.getDate() - diff);
      if ((now.getTime() - rollover.getTime()) / 3600000 < graceHours) {
        return true;
      }
    }

    return false;
  }

  function hasMeaningfulReportData(report) {
    const formData = report?.formData || report || {};
    const attendanceSummary = formData?.attendanceSummary || {};
    const members = Array.isArray(formData?.memberAttendance) ? formData.memberAttendance : [];
    const visitors = Array.isArray(formData?.visitors) ? formData.visitors : [];
    const kids = Array.isArray(formData?.kids) ? formData.kids : [];
    const externalParticipants = Array.isArray(formData?.externalParticipants) ? formData.externalParticipants : [];

    if (Object.values(attendanceSummary).some((value) => Number(value || 0) > 0)) {
      return true;
    }

    if (members.some((entry) => (
      entry?.planningAttended
      || entry?.reachAttended
      || entry?.reachPrivileged
      || entry?.sundayAttended
      || ['present', 'absent', 'justified', 'service'].includes(String(entry?.planningStatus || '').toLowerCase())
      || ['present', 'absent', 'justified', 'service'].includes(String(entry?.reachStatus || '').toLowerCase())
      || ['present', 'absent', 'justified', 'service'].includes(String(entry?.sundayStatus || '').toLowerCase())
      || String(entry?.note || '').trim()
    ))) {
      return true;
    }

    if (visitors.some((entry) => String(entry?.name || '').trim())) {
      return true;
    }

    if (kids.some((entry) => String(entry?.name || '').trim() && (entry?.reachAttended || entry?.sundayAttended || String(entry?.note || '').trim()))) {
      return true;
    }

    if (externalParticipants.length > 0) {
      return true;
    }

    return Boolean(String(formData?.notes || '').trim() || Number(formData?.reachOffering || 0) > 0);
  }

  function getReportRecencyValue(report) {
    const formData = report?.formData || report || {};
    const candidates = [
      report?.updatedAt,
      report?.updated_at,
      report?.createdAt,
      report?.created_at,
      report?.reportDate,
      report?.report_date,
      formData?.reportDate,
    ];

    for (const value of candidates) {
      const timestamp = Date.parse(String(value || '').trim());
      if (Number.isFinite(timestamp)) {
        return timestamp;
      }
    }

    return Number(report?.id || 0);
  }

  function parseReportDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return NaN;

    const isoTimestamp = Date.parse(raw);
    if (Number.isFinite(isoTimestamp)) {
      return isoTimestamp;
    }

    const dmyMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]);
      const year = Number(dmyMatch[3]);
      const parsed = Date.UTC(year, month - 1, day);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return NaN;
  }

  function inferNextIncompleteStage(formData) {
    const data = formData || {};
    const members = Array.isArray(data.memberAttendance) ? data.memberAttendance : [];
    const visitors = Array.isArray(data.visitors) ? data.visitors : [];
    const kids = Array.isArray(data.kids) ? data.kids : [];
    const baptisms = Array.isArray(data.baptisms) ? data.baptisms : [];

    const hasPlanificacion = members.some((entry) => entry && (entry.planningAttended || (entry.planningStatus && entry.planningStatus !== 'pending')));
    const hasAlcance = members.some((entry) => entry && (entry.reachAttended || entry.reachPrivileged || (entry.reachStatus && entry.reachStatus !== 'pending')))
      || visitors.some((entry) => entry?.reachAttended)
      || kids.some((entry) => entry?.reachAttended)
      || getReachExternalParticipants(data.externalParticipants, null, data.cellNumber).length > 0;
    const hasCulto = members.some((entry) => entry && (entry.sundayAttended || (entry.sundayStatus && entry.sundayStatus !== 'pending')))
      || visitors.some((entry) => entry?.sundayAttended)
      || kids.some((entry) => entry?.sundayAttended)
      || baptisms.some((entry) => entry && String(entry.name || '').trim());
    const hasCierre = baptisms.some((entry) => entry && String(entry.name || '').trim())
      || String(data.notes || '').trim().length > 0;

    if (!hasPlanificacion) return 'planificacion';
    if (!hasAlcance) return 'alcance';
    if (!hasCulto) return 'culto';
    if (!hasCierre) return 'cierre';
    return 'cierre';
  }

  function pickResumeStage(formData) {
    const data = formData || {};
    const isDraft = isDraftFormData(data);
    // Parity with original: finalized reports should always land on Inicio.
    if (!isDraft) {
      return 'encabezado';
    }
    const savedStage = String(data.lastStage || '').trim();
    if (STAGE_ORDER.includes(savedStage)) {
      const savedIndex = getStageIndex(savedStage);
      return savedIndex >= 0 && savedIndex < STAGE_ORDER.length - 1
        ? STAGE_ORDER[savedIndex + 1]
        : savedStage;
    }
    return inferNextIncompleteStage(data);
  }

  function resolveDraftLastStage(stage) {
    const currentIndex = getStageIndex(stage);
    const previousIndex = getStageIndex(state.lastSavedStage);
    const resolvedIndex = Math.max(currentIndex, previousIndex, 0);
    return STAGE_ORDER[resolvedIndex] || 'encabezado';
  }

  function pickHeaderContinueStage(formData) {
    const resumeStage = pickResumeStage(formData);
    if (resumeStage !== 'encabezado') return resumeStage;

    const data = formData || {};
    const members = Array.isArray(data.memberAttendance) ? data.memberAttendance : [];
    const visitors = Array.isArray(data.visitors) ? data.visitors.filter((entry) => String(entry?.name || '').trim()) : [];
    const kids = Array.isArray(data.kids) ? data.kids.filter((entry) => String(entry?.name || '').trim()) : [];
    const baptisms = Array.isArray(data.baptisms) ? data.baptisms.filter((entry) => String(entry?.name || '').trim()) : [];
    const reachSupervisorVisits = getReachExternalParticipants(data.externalParticipants, state.catalogs, data.cellNumber);

    if (members.some((entry) => entry?.planningAttended || (entry?.planningStatus && entry.planningStatus !== 'pending'))) {
      return 'planificacion';
    }
    if (
      members.some((entry) => entry?.reachAttended || entry?.reachPrivileged || (entry?.reachStatus && entry.reachStatus !== 'pending'))
      || visitors.some((entry) => entry?.reachAttended)
      || kids.some((entry) => entry?.reachAttended)
      || reachSupervisorVisits.length > 0
    ) {
      return 'alcance';
    }
    if (
      members.some((entry) => entry?.sundayAttended || (entry?.sundayStatus && entry.sundayStatus !== 'pending'))
      || visitors.some((entry) => entry?.sundayAttended)
      || kids.some((entry) => entry?.sundayAttended)
      || baptisms.length > 0
    ) {
      return 'culto';
    }
    return 'planificacion';
  }

  function clearStageBadges() {
    document.querySelectorAll('.stage-tab-badge').forEach((badge) => {
      badge.hidden = true;
    });
    document.querySelectorAll('.stage-tab').forEach((tab) => {
      tab.classList.remove('has-draft');
    });
  }

  function markStageSaved(stage) {
    const badge = document.querySelector(`#stage-badge-${stage}`);
    if (badge) {
      badge.hidden = false;
    }
    const tab = document.querySelector(`.stage-tab[data-stage="${stage}"]`);
    if (tab) {
      tab.classList.add('has-draft');
    }
  }

  function syncStageBadges() {
    clearStageBadges();
    if (recentFinalizedReportContext?.reportId && !state.reportId && !state.lastSavedStage && !state.form?.lastStage) {
      STAGE_ORDER.forEach(markStageSaved);
      return;
    }
    if (!state.reportId && !state.lastSavedStage && !state.form?.lastStage) return;
    if (state.isDraftReport) {
      const nextIncomplete = inferNextIncompleteStage(state.form);
      const savedStage = String(state.lastSavedStage || state.form?.lastStage || '').trim()
        || (nextIncomplete !== 'encabezado' ? STAGE_ORDER[Math.max(getStageIndex(nextIncomplete) - 1, 0)] : 'encabezado');
      const lastIndex = getStageIndex(savedStage);
      if (lastIndex >= 0) {
        STAGE_ORDER.slice(0, lastIndex + 1).forEach(markStageSaved);
      }
      return;
    }
    STAGE_ORDER.forEach(markStageSaved);
  }

  function syncDerivedState() {
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
  }

  async function resolveInitialReport() {
    if (state.context?.report) {
      return state.context.report;
    }
    if (state.context?.reportId) {
      return fetchReport(state.context.reportId, { requestFn: options.requestFn });
    }

    const seedForm = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, null);
    const bootstrapSelection = hasExplicitContextSelection()
      ? { cellNumber: String(seedForm.cellNumber || '').trim(), week: String(seedForm.week || '').trim() }
      : getBootstrapSelection(seedForm.cellNumber, seedForm.week);
    const targetCell = String(bootstrapSelection.cellNumber || '').trim();
    const targetWeek = String(bootstrapSelection.week || '').trim();
    if (!targetCell || !targetWeek) {
      return null;
    }

    const matchingReports = (Array.isArray(state.reports) ? state.reports : []).filter((report) => {
      const reportCell = String(report?.cellNumber || report?.formData?.cellNumber || '').trim();
      const reportWeek = String(report?.week || report?.formData?.week || '').trim();
      if (reportCell !== targetCell || reportWeek !== targetWeek) {
        return false;
      }

      const cycleStart = String(state.settings?.cycle_start_date || '').trim();
      if (!cycleStart) {
        return true;
      }

      const cycleStartTimestamp = parseReportDateValue(cycleStart);
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

    if (!matchingReports.length) {
      return null;
    }

    matchingReports.sort((left, right) => {
      const leftData = left?.formData || left;
      const rightData = right?.formData || right;
      const leftDraft = isDraftFormData(leftData);
      const rightDraft = isDraftFormData(rightData);
      const leftFinalized = !leftDraft;
      const rightFinalized = !rightDraft;
      if (leftFinalized !== rightFinalized) return leftFinalized ? -1 : 1;

      const leftMeaningful = hasMeaningfulReportData(left);
      const rightMeaningful = hasMeaningfulReportData(right);
      if (leftMeaningful !== rightMeaningful) return leftMeaningful ? -1 : 1;

      const recencyDiff = getReportRecencyValue(right) - getReportRecencyValue(left);
      if (recencyDiff !== 0) return recencyDiff;

      return Number(right?.id || 0) - Number(left?.id || 0);
    });

    const selectedReport = matchingReports[0];
    if (selectedReport?.formData) {
      return selectedReport;
    }
    if (selectedReport?.id) {
      return fetchReport(selectedReport.id, { requestFn: options.requestFn });
    }
    return null;
  }

  async function load() {
    state.currentUser = options.currentUser || null;
    state.settings = options.settings || {};
    state.graceBannerDismissed = false;
    state.catalogs = await fetchCatalogs({ requestFn: options.requestFn });
    state.reports = await fetchReports({ requestFn: options.requestFn });
    state.report = await resolveInitialReport();
    if (!state.report) {
      const seededForm = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, null);
      const preferredSelection = hasExplicitContextSelection()
        ? { cellNumber: String(seededForm.cellNumber || '').trim(), week: String(seededForm.week || '').trim() }
        : getBootstrapSelection(seededForm.cellNumber, seededForm.week);
      state.context = {
        ...(state.context || {}),
        cellNumber: String(preferredSelection.cellNumber || '').trim(),
        week: String(preferredSelection.week || '').trim(),
      };
    }
    state.form = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, state.report);
    const loadedFormData = state.report?.formData || state.report || null;
    state.isDraftReport = loadedFormData ? isDraftFormData(loadedFormData) : true;
    state.lastSavedStage = loadedFormData ? String(loadedFormData.lastStage || '').trim() : '';
    if (loadedFormData) {
      if (state.report?.id) {
        state.reportId = String(state.report.id);
      }
      state.activeStage = pickResumeStage(loadedFormData);
    }
    syncOptions();
  }

  function preview(formData, changedField = '') {
    state.form = applyWeekMeta({
      ...createReportFormData(),
      ...state.form,
      ...Object.fromEntries(formData.entries()),
    });
    if (changedField === 'week' || changedField === 'reportDate') {
      state.baptismCaptureStatus = getBaptismCaptureStatus(state.form.reportDate);
      state.baptismRegistrationMessage = getBaptismRegistrationMessage(state.baptismCaptureStatus);
      state.baptismQuickForm = {
        ...(state.baptismQuickForm || createBaptismQuickForm(state.form.reportDate)),
        baptismDate: state.form.reportDate || state.baptismQuickForm?.baptismDate || '',
        source: state.baptismCaptureStatus.isAllowed ? 'report' : 'fuera-cierre',
      };
      render();
    }
  }

  function changeCell(formData) {
    preview(formData);
    state.form = applyCellToReportForm(state.form, state.catalogs);
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    state.invitedByOptions = buildInvitedByOptions(state.form, state.catalogs);
    render();
  }

  function updateReportField(field, value, options = {}) {
    if (!field) return;
    state.form = {
      ...state.form,
      [field]: value,
    };
    if (options.render === true) {
      render();
    }
  }

  function resetToNewReportForSelection(cellNumber, week) {
    const selectedCell = String(cellNumber || '').trim();
    const selectedWeek = String(week || '').trim();
    state.report = null;
    state.reportId = '';
    state.isDraftReport = true;
    state.lastSavedStage = '';
    submittedEditConfirmedReportId = '';
    state.context = {
      ...(state.context || {}),
      mode: 'create',
      reportId: '',
      cellNumber: selectedCell,
      week: selectedWeek,
    };
    state.form = applyCellToReportForm(applyWeekMeta({
      ...createReportFormData(),
      ...buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, null),
      cellNumber: selectedCell,
      week: selectedWeek,
    }), state.catalogs);
    state.message = '';
    state.isError = false;
  }

  async function syncHeaderSelectionWithReport(config = {}) {
    const opts = {
      renderAfterSync: true,
      confirmFinalizedEdit: false,
      ...config,
    };

    const cellValue = String(state.form?.cellNumber || '').trim();
    const weekValue = String(state.form?.week || '').trim();
    if (!cellValue || !weekValue) return false;

    const recentReopenResult = await tryOpenRecentFinalizedReportFromHeaderContinue(cellValue, weekValue, {
      confirmFinalizedEdit: opts.confirmFinalizedEdit,
    });
    if (recentReopenResult !== null) {
      if (opts.renderAfterSync) {
        render({ scrollStageTab: false, preserveScroll: true });
      }
      return recentReopenResult;
    }

    const opened = await openExistingReportFromHeaderContinue(cellValue, weekValue, {
      confirmFinalizedEdit: opts.confirmFinalizedEdit,
      refreshReports: true,
    });

    if (opened === null) {
      resetToNewReportForSelection(cellValue, weekValue);
    }
    if (opened === false) {
      return false;
    }

    if (opts.renderAfterSync) {
      render({ scrollStageTab: false, preserveScroll: true });
    }
    return true;
  }

  async function loadSelectedReportIntoState(cellNumber, week, config = {}) {
    const opts = {
      refreshReports: true,
      confirmFinalizedEdit: false,
      ...config,
    };
    const selectedCell = normalizeCellKey(cellNumber);
    const selectedWeek = normalizeWeekKey(week);
    if (!selectedCell || !selectedWeek) return null;

    let reportIdToLoad = '';
    const recent = recentFinalizedReportContext;
    if (
      recent
      && normalizeCellKey(recent.cellNumber) === selectedCell
      && normalizeWeekKey(recent.week) === selectedWeek
      && String(recent.reportId || '').trim()
    ) {
      reportIdToLoad = String(recent.reportId || '').trim();
    }

    if (!reportIdToLoad) {
      let existing = findExistingReportForCellWeek(selectedCell, selectedWeek);
      if (!existing && opts.refreshReports) {
        state.reports = await fetchReports({ requestFn: options.requestFn });
        existing = findExistingReportForCellWeek(selectedCell, selectedWeek);
      }
      if (!existing?.id) {
        return null;
      }
      reportIdToLoad = String(existing.id).trim();
    }

    const loaded = await fetchReport(reportIdToLoad, { requestFn: options.requestFn });
    if (!loaded) return false;

    const loadedId = String(loaded?.id || reportIdToLoad).trim();
    state.report = loaded;
    state.reportId = loadedId;
    state.context = {
      ...(state.context || {}),
      mode: 'view',
      reportId: loadedId,
      cellNumber: String(loaded?.cellNumber || loaded?.formData?.cellNumber || selectedCell).trim(),
      week: String(loaded?.week || loaded?.formData?.week || selectedWeek).trim(),
    };
    state.form = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, loaded);
    state.isDraftReport = isDraftFormData(state.form);
    state.lastSavedStage = String(state.form?.lastStage || '').trim();
    submittedEditConfirmedReportId = !isReportEffectivelyDraft(loaded) && opts.confirmFinalizedEdit ? loadedId : '';

    if (recent && String(recent.reportId || '').trim() === loadedId) {
      recentFinalizedReportContext = null;
    }

    return loaded;
  }

  async function maybeOpenExisting(formData, changedField = '') {
    preview(formData, changedField);
    if (changedField === 'cellNumber') {
      state.form = applyCellToReportForm(state.form, state.catalogs);
    }
    if (state.activeStage !== 'encabezado') return;
    const cellValue = String(state.form?.cellNumber || '').trim();
    const weekValue = String(state.form?.week || '').trim();
    const loaded = await loadSelectedReportIntoState(cellValue, weekValue, {
      refreshReports: true,
    });
    if (loaded === null) {
      resetToNewReportForSelection(cellValue, weekValue);
    }
    if (loaded === false) {
      return;
    }
    render({ scrollStageTab: false, preserveScroll: true });
  }

  function updatePlanning(index, field, value) {
    state.form = {
      ...state.form,
      memberAttendance: updatePlanningAttendance(state.form.memberAttendance, index, {
        [field]: value,
      }),
    };
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function fillPlanning() {
    state.form = {
      ...state.form,
      memberAttendance: fillPlanningAttendance(state.form.memberAttendance),
    };
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function clearPlanning() {
    state.form = {
      ...state.form,
      memberAttendance: clearPlanningAttendance(state.form.memberAttendance),
    };
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function clearActiveMemberActivities() {
    if (state.activeStage === 'planificacion') {
      clearPlanning();
      return;
    }
    if (state.activeStage === 'alcance') {
      clearReach();
      return;
    }
    if (state.activeStage === 'culto') {
      clearSunday();
    }
  }

  function updateAttendance(index, field, value, meta = {}) {
    const currentEntry = state.form.memberAttendance[index];
    if (!currentEntry) return;
    const nextEntry = {
      ...currentEntry,
      rcmProgress: { ...(currentEntry.rcmProgress || {}) },
    };

    if (field === 'status') {
      const statusField = STAGE_STATUS_FIELDS[state.activeStage] || '';
      const attendedField = STAGE_ATTENDED_FIELDS[state.activeStage] || '';
      const normalizedValue = String(value || 'pending').toLowerCase();
      if (statusField) {
        nextEntry[statusField] = normalizedValue;
        if (normalizedValue === 'present' || normalizedValue === 'service') {
          nextEntry[attendedField] = true;
        } else if (normalizedValue === 'absent' || normalizedValue === 'justified') {
          nextEntry[attendedField] = false;
          if (attendedField === 'reachAttended') {
            nextEntry.reachPrivileged = false;
          }
        }
      } else {
        nextEntry.status = normalizedValue;
      }
    } else if (field === 'planningAttended' || field === 'reachAttended' || field === 'reachPrivileged' || field === 'sundayAttended') {
      nextEntry[field] = Boolean(value);
      if (field === 'reachAttended' && !nextEntry.reachAttended) {
        nextEntry.reachPrivileged = false;
      }
      const activeAttendedField = STAGE_ATTENDED_FIELDS[state.activeStage] || '';
      const activeStatusField = STAGE_STATUS_FIELDS[state.activeStage] || '';
      if (field === activeAttendedField && activeStatusField) {
        const currentStatus = String(nextEntry[activeStatusField] || 'pending').toLowerCase();
        if (nextEntry[field]) {
          if (currentStatus === 'pending' || currentStatus === 'absent' || !currentStatus) {
            nextEntry[activeStatusField] = 'present';
          }
        } else if (currentStatus === 'present' || currentStatus === 'service' || currentStatus === 'pending' || !currentStatus) {
          nextEntry[activeStatusField] = 'absent';
        }
      }
    } else if (field === 'rcmEventAttended') {
      const rcmKey = String(meta.rcmKey || '').trim();
      if (rcmKey) {
        if (value) {
          nextEntry.rcmProgress[rcmKey] = String(state.form.reportDate || '').trim() || 'asistio';
        } else {
          delete nextEntry.rcmProgress[rcmKey];
        }
      }
    } else if (field === 'note') {
      nextEntry.note = String(value || '');
    }

    nextEntry.status = deriveOverallStatus(nextEntry);
    state.form = {
      ...state.form,
      memberAttendance: state.form.memberAttendance.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)),
    };
    syncDerivedState();
    render();
  }

  function updateReach(index, field, value) {
    state.form = {
      ...state.form,
      memberAttendance: updateReachAttendance(state.form.memberAttendance, index, {
        [field]: value,
      }),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function updateMemberEvent(index, rcmKey, attended) {
    state.form = {
      ...state.form,
      memberAttendance: updateMemberRcmEvent(state.form.memberAttendance, index, rcmKey, attended, state.form.reportDate),
    };
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function updateReachMeta(field, value) {
    state.form = {
      ...state.form,
      [field]: field === 'reachOffering' ? String(value || '0') : value,
    };
    render();
  }

  function toggleExternalParticipant(candidate, enabled) {
    state.form = {
      ...state.form,
      externalParticipants: toggleExternalParticipantSelection(state.form.externalParticipants, candidate, enabled),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function addExternalMemberVisit(personId) {
    const selectedPersonId = String(personId || '').trim();
    if (!selectedPersonId) return;
    const candidate = getReachExternalParticipantCandidates(state.catalogs, state.form.cellNumber)
      .find((entry) => entry.kind === 'member_visit' && String(entry.personId || '').trim() === selectedPersonId);
    if (!candidate) return;
    state.form = {
      ...state.form,
      externalParticipants: toggleExternalParticipantSelection(state.form.externalParticipants, candidate, true),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleCopyPlanningToReach() {
    state.form = {
      ...state.form,
      memberAttendance: copyPlanningToReach(state.form.memberAttendance),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function fillReachMembers() {
    state.form = {
      ...state.form,
      memberAttendance: fillReachAttendance(state.form.memberAttendance, false),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function fillReachPrivileges() {
    state.form = {
      ...state.form,
      memberAttendance: fillReachAttendance(state.form.memberAttendance, true),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    render();
  }

  function clearReach() {
    state.form = {
      ...state.form,
      memberAttendance: clearReachAttendance(state.form.memberAttendance),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function updateSunday(index, field, value) {
    state.form = {
      ...state.form,
      memberAttendance: updateSundayAttendance(state.form.memberAttendance, index, {
        [field]: value,
      }),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleCopyReachToSunday() {
    state.form = {
      ...state.form,
      memberAttendance: copyReachToSunday(state.form.memberAttendance),
      visitors: state.form.visitors.map((visitor) => ({
        ...visitor,
        sundayAttended: Boolean(visitor.reachAttended),
      })),
      kids: copyKidReachToSunday(state.form.kids),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function fillSundayMembers() {
    state.form = {
      ...state.form,
      memberAttendance: fillSundayAttendance(state.form.memberAttendance),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function fillSundayVisitors() {
    state.form = {
      ...state.form,
      visitors: state.form.visitors.map((visitor) => ({
        ...visitor,
        sundayAttended: true,
      })),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleCopyVisitorReachToSunday() {
    state.form = {
      ...state.form,
      visitors: state.form.visitors.map((visitor) => ({
        ...visitor,
        sundayAttended: Boolean(visitor.reachAttended),
      })),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function clearSunday() {
    state.form = {
      ...state.form,
      memberAttendance: clearSundayAttendance(state.form.memberAttendance),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function updateKidEntry(index, field, value) {
    state.form = {
      ...state.form,
      kids: updateKid(state.form.kids, index, {
        [field]: value,
      }),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleFillSundayKids() {
    state.form = {
      ...state.form,
      kids: fillSundayKids(state.form.kids),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleCopyKidReachToSunday() {
    state.form = {
      ...state.form,
      kids: copyKidReachToSunday(state.form.kids),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleClearVisitors() {
    state.form = {
      ...state.form,
      visitors: clearVisitorActivities(state.form.visitors),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleClearKids() {
    state.form = {
      ...state.form,
      kids: clearKidActivities(state.form.kids),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function updateKidQuick(field, value) {
    state.kidQuickForm = {
      ...(state.kidQuickForm || createKidQuickForm()),
      [field]: value,
    };
    render();
  }

  async function handleResetKidQuick() {
    const quickForm = state.kidQuickForm || createKidQuickForm();
    const hasData = String(quickForm.name || '').trim() || String(quickForm.guardianName || '').trim();
    if (hasData) {
      const ok = await appConfirm('¿Vaciar los campos del formulario rápido?\nNo afecta a la tabla de niños.', 'Vaciar formulario');
      if (!ok) return;
    }
    state.kidQuickForm = createKidQuickForm();
    state.message = '';
    state.isError = false;
    render();
  }

  function updateVisitorQuick(field, value, options = {}) {
    const shouldRender = options.render !== false;
    if (state.visitorInlineMessage) {
      state.visitorInlineMessage = '';
    }
    if (field === 'historySelection') {
      if (String(value || '').trim()) {
        applyQuickVisitorHistory(value, { keepHistorySelection: true });
      } else {
        state.visitorQuickForm = {
          ...(state.visitorQuickForm || createVisitorQuickForm()),
          historySelection: '',
          name: '',
        };
      }
      state.visitorProcessOptions = getVisitorProcessOptions(state.form, state.settings, state.visitorQuickForm.kind);
      if (shouldRender) {
        render();
      }
      return;
    }

    const currentForm = syncVisitorQuickFormFromDom();
    const nextForm = {
      ...currentForm,
      [field]: value,
    };
    if (field === 'name') {
      const normalizedName = String(value || '').trim();
      if (normalizeVisitorNameKey(normalizedName) !== normalizeVisitorNameKey(currentForm.historySelection || '')) {
        nextForm.historySelection = '';
      }
    }
    if (field === 'kind') {
      if (String(value || '').trim() === 'visita') {
        nextForm.converted = false;
        nextForm.processEntry = 'none';
      } else if (!String(nextForm.processEntry || '').trim()) {
        nextForm.processEntry = 'none';
      }
    }
    state.visitorQuickForm = nextForm;
    state.visitorProcessOptions = getVisitorProcessOptions(state.form, state.settings, state.visitorQuickForm.kind);
    if (shouldRender) {
      render();
    }
  }

  async function handleResetVisitorQuick() {
    const quickForm = state.visitorQuickForm || createVisitorQuickForm();
    const hasData = String(quickForm.name || '').trim()
      || String(quickForm.invitedBy || '').trim()
      || String(quickForm.historySelection || '').trim();
    if (hasData) {
      const ok = await appConfirm('¿Vaciar los campos del formulario rápido?\nNo afecta a la tabla de amigos.', 'Vaciar formulario');
      if (!ok) return;
    }
    state.visitorQuickForm = createVisitorQuickForm();
    state.message = '';
    state.isError = false;
    render();
  }

  async function handleHideVisitorHistorySelection() {
    const cellNumber = String(state.form?.cellNumber || '').trim();
    const selectedName = String(state.visitorQuickForm?.historySelection || '').trim();
    if (!cellNumber || !selectedName) {
      return;
    }
    const ok = await appConfirm(`Ocultar "${selectedName}" de Vista previa para la célula ${cellNumber}?\nYa no se mostrará en este combo. No se borran reportes anteriores ni el historial real.\nPara recuperarlo usa "Restaurar ocultos".`, 'Ocultar de vista previa');
    if (!ok) return;

    const hiddenMap = getVisitorHistoryHiddenMap();
    const currentList = Array.isArray(hiddenMap[cellNumber]) ? hiddenMap[cellNumber] : [];
    const nextSet = new Set(currentList.map((name) => normalizeVisitorNameKey(name)).filter(Boolean));
    nextSet.add(normalizeVisitorNameKey(selectedName));
    const payload = { [VISITOR_HISTORY_HIDDEN_KEY]: JSON.stringify({ ...hiddenMap, [cellNumber]: Array.from(nextSet.values()) }) };
    const savedSettings = await saveSettings(payload, { requestFn: options.requestFn });
    state.settings = { ...state.settings, ...savedSettings };
    state.visitorQuickForm = {
      ...(state.visitorQuickForm || createVisitorQuickForm()),
      historySelection: '',
    };
    syncOptions();
    state.message = `"${selectedName}" ya no se mostrará en Vista previa para la célula ${cellNumber}. Puedes recuperarlo con "Restaurar ocultos".`;
    state.isError = false;
    render();
  }

  async function handleRestoreHiddenVisitorHistory() {
    const cellNumber = String(state.form?.cellNumber || '').trim();
    if (!cellNumber) {
      return;
    }
    const hiddenMap = getVisitorHistoryHiddenMap();
    const currentList = Array.isArray(hiddenMap[cellNumber])
      ? hiddenMap[cellNumber].map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    if (!currentList.length) {
      return;
    }
    const label = currentList.length === 1 ? `"${currentList[0]}"` : `${currentList.length} registros ocultos`;
    const ok = await appConfirm(`Restaurar ${label} en Vista previa para la célula ${cellNumber}?\nVolverán a mostrarse solo en este combo.`, 'Restaurar ocultos');
    if (!ok) return;

    delete hiddenMap[cellNumber];
    const payload = { [VISITOR_HISTORY_HIDDEN_KEY]: JSON.stringify(hiddenMap) };
    const savedSettings = await saveSettings(payload, { requestFn: options.requestFn });
    state.settings = { ...state.settings, ...savedSettings };
    syncOptions();
    state.message = `Se restauró la Vista previa de ${currentList.length === 1 ? `"${currentList[0]}"` : `${currentList.length} registros`} para la célula ${cellNumber}.`;
    state.isError = false;
    render();
  }

  function updateBaptismQuick(field, value) {
    state.baptismQuickForm = {
      ...(state.baptismQuickForm || createBaptismQuickForm(state.form.reportDate)),
      [field]: value,
    };
    render();
  }

  function handleUpdateVisitor(index, field, value) {
    const currentVisitor = Array.isArray(state.form.visitors) ? state.form.visitors[index] : null;
    const patch = {
      [field]: value,
    };
    if (field === 'name' && currentVisitor) {
      const history = findVisitorHistoryEntry(state.visitorHistory, value);
      if (history) {
        if (!String(currentVisitor.invitedBy || '').trim()) {
          patch.invitedBy = history.invitedBy || currentVisitor.invitedBy;
        }
        if (!String(currentVisitor.phone || '').trim()) {
          patch.phone = history.phone || currentVisitor.phone;
        }
        patch.firstVisit = false;
        if (currentVisitor.kind !== 'visita') {
          patch.converted = Boolean(currentVisitor.converted || history.converted);
        }
      }
    }
    state.form = {
      ...state.form,
      visitors: updateVisitor(state.form.visitors, index, {
        ...patch,
      }),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  async function handleAddVisitor(snapshot = null) {
    if (quickAddLock) return;
    quickAddLock = true;
    let addedVisitor = false;
    let addedVisitorName = '';
    try {
      const quickForm = snapshot && typeof snapshot === 'object'
        ? { ...(state.visitorQuickForm || createVisitorQuickForm()), ...snapshot }
        : syncVisitorQuickFormFromDom();
      state.visitorQuickForm = quickForm;
      const visitorName = String(quickForm.name || '').trim();
      if (!visitorName && lastQuickAdd.kind === 'visitor' && (Date.now() - lastQuickAdd.at) < 400) {
        quickAddLock = false;
        return;
      }
      const normalizedName = normalizeVisitorNameKey(visitorName);
      const duplicateVisitor = (Array.isArray(state.form.visitors) ? state.form.visitors : []).find((entry) => normalizeVisitorNameKey(entry?.name) === normalizedName);
      if (duplicateVisitor) {
        throw new Error(`Ya hay una visita registrada con el nombre "${duplicateVisitor.name}". Revisa la tabla o usa un nombre distinto (p. ej. agrega apellido).`);
      }
      const duplicateMember = Array.isArray(state.catalogs?.people)
        ? state.catalogs.people.find((entry) => normalizeVisitorNameKey(entry?.name) === normalizedName)
        : null;
      if (duplicateMember) {
        throw new Error(`Ojo: "${duplicateMember.name}" ya existe como miembro del catálogo. Si es la misma persona, no la agregues como visita; si es otra, usa un nombre distintivo.`);
      }
      const history = findVisitorHistoryEntry(state.visitorHistory, visitorName);
      const quickKind = history?.kind || quickForm.kind;
      const nextVisitorForm = {
        ...quickForm,
        name: visitorName,
        invitedBy: String(quickForm.invitedBy || history?.invitedBy || '').trim(),
        kind: quickKind,
        firstVisit: history ? false : quickForm.firstVisit,
        processEntry: quickKind === 'visita' ? 'none' : String(history?.processEntry || quickForm.processEntry || 'none').trim() || 'none',
        converted: quickKind === 'visita' ? false : Boolean(quickForm.converted || history?.converted),
        phone: String(quickForm.phone || history?.phone || '').trim(),
      };
      state.form = {
        ...state.form,
        visitors: addVisitor(state.form.visitors, nextVisitorForm),
      };
      state.visitorQuickForm = createVisitorQuickForm();
      state.message = '';
      state.visitorInlineMessage = '';
      state.isError = false;
      addedVisitor = true;
      addedVisitorName = visitorName;
      lastQuickAdd = { kind: 'visitor', at: Date.now() };
    } catch (error) {
      state.message = error.message;
      state.isError = true;
    }
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
    if (addedVisitor) {
      highlightLastRow('#visitor-table-body tr');
      const wantsAnother = await appConfirm(
        `"${addedVisitorName}" se agregó correctamente.\n\n¿Deseas agregar otro?`,
        'Amigo agregado',
        { okLabel: 'Agregar otro', cancelLabel: 'Ver agregado' },
      );
      if (wantsAnother) {
        focusField('#visitor-quick-name');
      } else {
        revealLastRow('#visitor-table-body tr');
      }
    }
    queueMicrotask(() => {
      quickAddLock = false;
    });
  }

  function handleRemoveVisitor(index) {
    state.form = {
      ...state.form,
      visitors: removeVisitor(state.form.visitors, index),
    };
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function handleAddBaptism() {
    try {
      const captureStatus = getBaptismCaptureStatus(state.form.reportDate);
      const nextBaptism = createBaptismQuickForm(state.form.reportDate);
      state.form = {
        ...state.form,
        baptisms: [
          ...(Array.isArray(state.form.baptisms) ? state.form.baptisms : []),
          nextBaptism,
        ],
      };
      state.message = captureStatus.isAllowed
        ? ''
        : 'Bautismo agregado. Se guardará para promoverlo como miembro, pero no contará en el cierre cuatrimestral.';
      state.isError = false;
    } catch (error) {
      state.message = error.message;
      state.isError = true;
    }
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    render();
  }

  function handleUpdateBaptism(index, field, value) {
    state.form = {
      ...state.form,
      baptisms: updateBaptism(state.form.baptisms, index, {
        [field]: value,
      }),
    };
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    render();
  }

  function handleRemoveBaptism(index) {
    state.form = {
      ...state.form,
      baptisms: removeBaptism(state.form.baptisms, index),
    };
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    render();
  }

  function handleAddKid() {
    if (quickAddLock) return;
    quickAddLock = true;
    let addedKid = false;
    try {
      syncKidQuickFormFromDom();
      const kidName = String(state.kidQuickForm?.name || '').trim();
      if (!kidName && lastQuickAdd.kind === 'kid' && (Date.now() - lastQuickAdd.at) < 400) {
        quickAddLock = false;
        return;
      }
      state.form = {
        ...state.form,
        kids: addKid(state.form.kids, state.kidQuickForm),
      };
      state.kidQuickForm = createKidQuickForm();
      state.message = `Niño "${kidName}" agregado.`;
      state.isError = false;
      addedKid = true;
      lastQuickAdd = { kind: 'kid', at: Date.now() };
    } catch (error) {
      state.message = error.message;
      state.isError = true;
    }
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
    if (addedKid) {
      highlightLastRow('#kids-table-body tr');
      focusField('#kid-quick-name');
    }
    queueMicrotask(() => {
      quickAddLock = false;
    });
  }

  function handleRemoveKid(index) {
    state.form = {
      ...state.form,
      kids: removeKid(state.form.kids, index),
    };
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    render();
  }

  function stageHasCapturedData(stage, formData = state.form) {
    const members = Array.isArray(formData?.memberAttendance) ? formData.memberAttendance : [];
    const visitors = Array.isArray(formData?.visitors)
      ? formData.visitors.filter((entry) => String(entry?.name || '').trim())
      : [];
    const kids = Array.isArray(formData?.kids)
      ? formData.kids.filter((entry) => String(entry?.name || '').trim())
      : [];
    const baptisms = Array.isArray(formData?.baptisms)
      ? formData.baptisms.filter((entry) => String(entry?.name || '').trim())
      : [];
    if (stage === 'planificacion') {
      return members.some((entry) => entry?.planningAttended || (entry?.planningStatus && entry.planningStatus !== 'pending'));
    }
    if (stage === 'alcance') {
      if (members.some((entry) => entry?.reachAttended || entry?.reachPrivileged || (entry?.reachStatus && entry.reachStatus !== 'pending'))) return true;
      if (visitors.some((entry) => entry?.reachAttended)) return true;
      if (getReachExternalParticipants(formData?.externalParticipants, state.catalogs, formData?.cellNumber).length) return true;
      return false;
    }
    if (stage === 'culto') {
      if (members.some((entry) => entry?.sundayAttended || (entry?.sundayStatus && entry.sundayStatus !== 'pending'))) return true;
      if (visitors.some((entry) => entry?.sundayAttended)) return true;
      if (kids.some((entry) => entry?.sundayAttended)) return true;
      if (baptisms.length) return true;
      return false;
    }
    return true;
  }

  async function openExistingReportFromHeaderContinue(cellNumber, week, config = {}) {
    const opts = {
      confirmFinalizedEdit: true,
      refreshReports: true,
      ...config,
    };
    let existing = findExistingReportForCellWeek(cellNumber, week);
    if (!existing && opts.refreshReports) {
      state.reports = await fetchReports({ requestFn: options.requestFn });
      existing = findExistingReportForCellWeek(cellNumber, week);
    }
    if (!existing) return null;

    const editable = isReportEditable(existing);

    if (!editable) {
      state.message = 'Este reporte ya no puede editarse — la semana ha cerrado.';
      state.isError = true;
      render();
      return false;
    }

    if (opts.confirmFinalizedEdit && editable && !isReportEffectivelyDraft(existing)) {
      const confirmed = await appConfirm(
        `La semana ${week} ya tiene un reporte entregado.\n¿Deseas abrirlo para editarlo?`,
        'Reporte ya entregado'
      );
      if (!confirmed) {
        state.message = 'Se mantuvo el reporte enviado sin abrir para edición.';
        state.isError = false;
        render();
        return false;
      }
    }

    const loaded = await fetchReport(existing.id, { requestFn: options.requestFn });
    if (!loaded) {
      state.message = 'No se pudo abrir el reporte ya entregado. No se realizaron cambios.';
      state.isError = true;
      render();
      return false;
    }
    const loadedId = String(loaded?.id || existing?.id || '').trim();

    state.report = loaded;
    state.reportId = loadedId;
    state.context = {
      ...(state.context || {}),
      mode: 'view',
      reportId: loadedId,
      cellNumber: String(cellNumber || '').trim(),
      week: String(week || '').trim(),
    };
    state.form = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, loaded);
    state.isDraftReport = isDraftFormData(state.form);
    state.lastSavedStage = String(state.form?.lastStage || '').trim();
    state.activeStage = pickHeaderContinueStage(state.form);
    submittedEditConfirmedReportId = !isReportEffectivelyDraft(loaded) && opts.confirmFinalizedEdit ? loadedId : '';
    state.message = isReportEffectivelyDraft(loaded)
      ? `Semana ${week} ya tiene reporte; continuando captura existente.`
      : `Semana ${week} ya fue entregada; editando el reporte existente.`;
    state.isError = false;
    render({ scrollStageTab: true, preserveScroll: false });
    scrollToFormStart();
    return true;
  }

  async function tryOpenRecentFinalizedReportFromHeaderContinue(cellNumber, week, config = {}) {
    const opts = {
      confirmFinalizedEdit: false,
      ...config,
    };
    const normalizedCell = String(cellNumber || '').trim();
    const normalizedWeek = String(week || '').trim();
    const recent = recentFinalizedReportContext;
    if (!recent) return null;
    if (String(recent.cellNumber || '').trim() !== normalizedCell) return null;
    if (normalizeWeekKey(recent.week) !== normalizeWeekKey(normalizedWeek)) return null;
    if (!recent.reportId) return null;

    const report = await fetchReport(recent.reportId, { requestFn: options.requestFn });
    if (!report) {
      state.message = 'No se pudo recuperar el reporte recién finalizado. No se realizaron cambios.';
      state.isError = true;
      render();
      return false;
    }

    if (!isReportEditable(report)) {
      state.message = 'Este reporte ya no puede editarse — la semana ha cerrado.';
      state.isError = true;
      render();
      return false;
    }

    if (opts.confirmFinalizedEdit) {
      const confirmed = await appConfirm(
        `La semana ${normalizedWeek} ya tiene un reporte entregado.\n¿Deseas abrirlo para editarlo?`,
        'Reporte ya entregado'
      );
      if (!confirmed) {
        state.message = 'Se mantuvo el reporte enviado sin abrir para edición.';
        state.isError = false;
        render();
        return false;
      }
    }

    const loadedId = String(report?.id || recent.reportId || '').trim();
    state.report = report;
    state.reportId = loadedId;
    state.context = {
      ...(state.context || {}),
      mode: 'view',
      reportId: loadedId,
      cellNumber: normalizedCell,
      week: normalizedWeek,
    };
    state.form = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, report);
    state.isDraftReport = isDraftFormData(state.form);
    state.lastSavedStage = String(state.form?.lastStage || '').trim();
    state.activeStage = pickHeaderContinueStage(state.form);
    submittedEditConfirmedReportId = opts.confirmFinalizedEdit ? loadedId : '';
    state.message = `Semana ${normalizedWeek} ya fue entregada; editando el reporte existente.`;
    state.isError = false;
    recentFinalizedReportContext = null;
    return true;
  }

  async function tryOpenHeaderReportForContinue(cellNumber, week, config = {}) {
    const recentReopenResult = await tryOpenRecentFinalizedReportFromHeaderContinue(cellNumber, week, config);
    if (recentReopenResult !== null) {
      return recentReopenResult;
    }
    return openExistingReportFromHeaderContinue(cellNumber, week, config);
  }

  function reportHasMeaningfulData(formData = state.form) {
    const members = Array.isArray(formData?.memberAttendance) ? formData.memberAttendance : [];
    const visitors = Array.isArray(formData?.visitors) ? formData.visitors : [];
    const kids = Array.isArray(formData?.kids) ? formData.kids : [];
    const baptisms = Array.isArray(formData?.baptisms) ? formData.baptisms : [];
    const hasMemberData = members.some((entry) => {
      if (!entry) return false;
      if (entry.planningAttended || entry.reachAttended || entry.sundayAttended || entry.reachPrivileged) return true;
      if (String(entry.note || '').trim()) return true;

      const attendanceMode = String(entry.attendanceMode || 'normal').trim();
      const attendanceDefaults = entry.attendanceDefaults && typeof entry.attendanceDefaults === 'object'
        ? entry.attendanceDefaults
        : {};
      const expectedStatus = {
        planningStatus: attendanceMode === 'justified_default' && attendanceDefaults.planning ? 'justified' : 'pending',
        reachStatus: attendanceMode === 'justified_default' && attendanceDefaults.reach ? 'justified' : 'pending',
        sundayStatus: attendanceMode === 'justified_default' && attendanceDefaults.sunday ? 'justified' : 'pending',
      };

      const planningStatus = String(entry.planningStatus || 'pending').toLowerCase();
      const reachStatus = String(entry.reachStatus || 'pending').toLowerCase();
      const sundayStatus = String(entry.sundayStatus || 'pending').toLowerCase();
      return planningStatus !== expectedStatus.planningStatus
        || reachStatus !== expectedStatus.reachStatus
        || sundayStatus !== expectedStatus.sundayStatus;
    });
    const hasVisitorData = visitors.some((entry) => entry && String(entry.name || '').trim());
    const hasKidData = kids.some((entry) => entry && (
      entry.reachAttended
      || entry.sundayAttended
      || String(entry.note || '').trim()
      || (entry.source !== 'catalog' && String(entry.name || '').trim())
    ));
    const hasBaptismData = baptisms.some((entry) => entry && String(entry.name || '').trim());
    return hasMemberData || hasVisitorData || hasKidData || hasBaptismData;
  }

  async function submit(formData, nextStage = '', submittedStage = '', config = {}) {
    preview(formData);
    state.form = applyCellToReportForm(state.form, state.catalogs);
    state.canEditCurrentReport = canEditCurrentReport();
    if (!state.canEditCurrentReport) {
      state.message = 'Solo el líder de esta célula puede guardar o finalizar este reporte.';
      state.isError = true;
      render();
      return;
    }
    const confirmEmptyStage = config.confirmEmptyStage === true;

    const activeSavedStage = String(submittedStage || state.activeStage || 'encabezado').trim();
    if (activeSavedStage === 'encabezado' && !state.reportId && !reportHasMeaningfulData(state.form)) {
      const cellValue = String(state.form.cellNumber || '').trim();
      const weekValue = String(state.form.week || '').trim();
      if (cellValue && weekValue) {
        const reopenResult = await tryOpenHeaderReportForContinue(cellValue, weekValue, {
          confirmFinalizedEdit: true,
          refreshReports: true,
        });
        if (reopenResult === false) return;
        if (reopenResult === true) {
          render({ scrollStageTab: true, preserveScroll: false });
          return;
        }
      }
    }

    try {
      const previousStage = state.activeStage;
      const savedStage = resolveDraftLastStage(submittedStage || state.activeStage || 'encabezado');

      if (state.reportId) {
        const editingExisting = (Array.isArray(state.reports) ? state.reports : [])
          .find((report) => String(report?.id || '') === String(state.reportId || '').trim());
        if (editingExisting && !isReportEditable(editingExisting)) {
          state.message = 'Este reporte ya no puede editarse — la semana ha cerrado.';
          state.isError = true;
          render();
          return;
        }
        if (editingExisting && !isReportEffectivelyDraft(editingExisting) && String(submittedEditConfirmedReportId || '') !== String(state.reportId || '').trim()) {
          const reportCell = String(editingExisting?.cellNumber || editingExisting?.formData?.cellNumber || '').trim() || '—';
          const reportWeek = String(editingExisting?.week || editingExisting?.formData?.week || '').trim() || '—';
          const confirmed = await appConfirm(
            `El reporte de célula ${reportCell}, semana ${reportWeek}, ya fue entregado.\n¿Deseas editarlo?`,
            'Editar reporte entregado'
          );
          if (!confirmed) {
            state.message = 'Se mantuvo el reporte enviado sin abrir para edición.';
            state.isError = false;
            render();
            return;
          }
          submittedEditConfirmedReportId = String(state.reportId || '').trim();
        }
      }

      if (confirmEmptyStage && ['planificacion', 'alcance', 'culto'].includes(activeSavedStage) && !stageHasCapturedData(activeSavedStage, state.form)) {
        const stageLabels = {
          planificacion: 'Planeación',
          alcance: 'Alcance',
          culto: 'Culto',
        };
        const confirmedNoData = await appConfirm(
          `No se registró información en ${stageLabels[activeSavedStage]}.\n¿Deseas guardar de todas formas?`,
          'Etapa sin datos'
        );
        if (!confirmedNoData) {
          return;
        }
      }

      const payload = buildReportPayload(state.form, {
        isDraft: true,
        lastStage: savedStage,
      });
      const result = await saveReport(payload, { requestFn: options.requestFn });
      state.message = `Borrador guardado — etapa ${savedStage}.`;
      state.isError = false;
      state.isDraftReport = true;
      state.lastSavedStage = savedStage;
      if (result?.id) {
        const savedReportId = String(result.id);
        state.reportId = savedReportId;
        state.catalogs = await fetchCatalogs({ requestFn: options.requestFn });
        state.reports = await fetchReports({ requestFn: options.requestFn });
        const freshReport = await fetchReport(savedReportId, { requestFn: options.requestFn });
        if (freshReport) {
          state.report = freshReport;
          state.context = {
            ...(state.context || {}),
            mode: 'view',
            reportId: savedReportId,
            cellNumber: String(freshReport?.cellNumber || freshReport?.formData?.cellNumber || state.form?.cellNumber || '').trim(),
            week: String(freshReport?.week || freshReport?.formData?.week || state.form?.week || '').trim(),
          };
          state.form = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, freshReport);
          state.isDraftReport = isDraftFormData(state.form);
          state.lastSavedStage = String(state.form?.lastStage || savedStage).trim() || savedStage;
        } else {
          state.context = {
            ...(state.context || {}),
            mode: 'view',
            reportId: savedReportId,
          };
        }
      }
      state.form = {
        ...state.form,
        _draft: true,
        lastStage: savedStage,
      };
      let stageAdvanced = false;
      if (nextStage && STAGE_ORDER.includes(nextStage)) {
        state.activeStage = nextStage;
        stageAdvanced = nextStage !== previousStage;
      }
      render({
        scrollStageTab: stageAdvanced,
        preserveScroll: !stageAdvanced,
      });
      if (stageAdvanced) {
        scrollToFormStart();
      }
    } catch (error) {
      state.message = error.message;
      state.isError = true;
      render();
    }
  }

  async function finalize(formData, submittedStage = 'cierre') {
    preview(formData);
    state.form = applyCellToReportForm(state.form, state.catalogs);
    state.canEditCurrentReport = canEditCurrentReport();
    if (!state.canEditCurrentReport) {
      state.message = 'Solo el líder de esta célula puede guardar o finalizar este reporte.';
      state.isError = true;
      render();
      return;
    }
    const payloadPreview = state.form;
    if (!String(payloadPreview?.week || '').trim() || !String(payloadPreview?.cellNumber || '').trim()) {
      state.message = 'Selecciona la semana y la célula antes de finalizar.';
      state.isError = true;
      render();
      return;
    }

    if (!reportHasMeaningfulData(payloadPreview)) {
      const ok = await appConfirm(
        'Este reporte no tiene asistencias, supervisión, visitas, niños ni bautismos capturados.\n¿Seguro que deseas finalizarlo así?',
        'Reporte sin datos'
      );
      if (!ok) return;
    }

    const emptyStages = [];
    if (!stageHasCapturedData('planificacion', payloadPreview)) emptyStages.push('Planeación');
    if (!stageHasCapturedData('alcance', payloadPreview)) emptyStages.push('Alcance');
    if (!stageHasCapturedData('culto', payloadPreview)) emptyStages.push('Culto');
    if (emptyStages.length) {
      const ok = await appConfirm(
        `No se registró información en: ${emptyStages.join(', ')}.\n¿Deseas finalizar el reporte de todas formas?`,
        'Etapa(s) sin información'
      );
      if (!ok) return;
    }

    if (state.reportId) {
      const editingExisting = (Array.isArray(state.reports) ? state.reports : [])
        .find((report) => String(report?.id || '') === String(state.reportId || '').trim());
      if (editingExisting && !isReportEditable(editingExisting)) {
        state.message = 'Este reporte ya no puede editarse — la semana ha cerrado.';
        state.isError = true;
        render();
        return;
      }
      if (editingExisting && !isReportEffectivelyDraft(editingExisting)) {
        const confirmed = await appConfirm(
          'Este reporte ya estaba finalizado.\n¿Seguro que deseas guardar los cambios y sobrescribir la versión entregada?',
          'Modificar reporte finalizado'
        );
        if (!confirmed) return;
      }
    }

    try {
      const payload = buildReportPayload(state.form, {
        isDraft: false,
      });
      delete payload._draft;
      delete payload.lastStage;
      const result = await saveReport(payload, { requestFn: options.requestFn });
      const savedCell = String(payload.cellNumber || '').trim();
      const savedWeek = String(payload.week || '').trim();
      const realCurrentWeek = String(getQuarterWeekNumber(state.settings));
      state.message = 'Reporte finalizado y guardado.';
      state.isError = false;
      state.isDraftReport = false;
      state.lastSavedStage = 'cierre';
      if (result?.id) {
        state.catalogs = await fetchCatalogs({ requestFn: options.requestFn });
        state.reports = await fetchReports({ requestFn: options.requestFn });
      }

      recentFinalizedReportContext = result?.id
        ? { reportId: String(result.id), cellNumber: savedCell, week: savedWeek }
        : null;

      state.activeStage = 'encabezado';
      state.previewReport = null;
      state.previewVisitorsOpen = false;

      const nextContext = {
        ...(state.context || {}),
      };
      delete nextContext.reportId;
      nextContext.mode = 'create';

      state.context = nextContext;
      state.report = null;
      state.reportId = '';
      state.lastSavedStage = '';
      state.isDraftReport = true;

      const freshForm = buildInitialReportForm(state.catalogs, state.settings, state.currentUser, state.context, null);
      state.form = applyCellToReportForm(applyWeekMeta({
        ...createReportFormData(),
        ...freshForm,
        cellNumber: savedCell || freshForm.cellNumber || '',
        week: realCurrentWeek || freshForm.week || savedWeek || '',
      }), state.catalogs);

      state.visitorQuickForm = createVisitorQuickForm();
      state.kidQuickForm = createKidQuickForm();
      state.baptismQuickForm = createBaptismQuickForm(state.form.reportDate);

      let switchedToCurrentDraftMessage = '';
      if (savedCell && realCurrentWeek && normalizeWeekKey(realCurrentWeek) !== normalizeWeekKey(savedWeek)) {
        const resumedCurrentWeek = await loadSelectedReportIntoState(savedCell, realCurrentWeek, {
          refreshReports: false,
        });
        if (resumedCurrentWeek && isReportEffectivelyDraft(resumedCurrentWeek)) {
          state.activeStage = pickHeaderContinueStage(state.form);
          switchedToCurrentDraftMessage = `Reporte de semana ${savedWeek} finalizado. Ahora continúas en la semana ${realCurrentWeek}, etapa ${STAGE_LABELS[state.activeStage] || state.activeStage}.`;
          state.message = switchedToCurrentDraftMessage;
        }
      }

      syncOptions();
      render({ scrollStageTab: true, preserveScroll: false });
      scrollToFormStart();
      if (switchedToCurrentDraftMessage) {
        await appAcknowledge(
          switchedToCurrentDraftMessage,
          'Cambio de reporte',
          'Continuar'
        );
      }
    } catch (error) {
      state.message = error.message;
      state.isError = true;
      render();
    }
  }

  async function openHistoryReport(reportId) {
    if (!reportId) return;
    let report = (Array.isArray(state.reports) ? state.reports : []).find((entry) => String(entry?.id || '') === String(reportId));
    if (!report || !report.formData) {
      report = await fetchReport(reportId, { requestFn: options.requestFn });
    }
    if (!report) return;
    state.previewReport = report;
    state.previewVisitorsOpen = false;
    render();
  }

  function closePreviewReport() {
    state.previewReport = null;
    state.previewVisitorsOpen = false;
    render();
  }

  function openPreviewVisitors() {
    if (!state.previewReport) return;
    state.previewVisitorsOpen = true;
    render();
  }

  function closePreviewVisitors() {
    state.previewVisitorsOpen = false;
    render();
  }

  async function openPreviewReportForm() {
    const previewReportId = String(state.previewReport?.id || '').trim();
    if (!previewReportId) return;
    if (typeof options.onNavigate === 'function') {
      await options.onNavigate('reporte', { mode: 'view', reportId: previewReportId });
      return;
    }
    state.context = { mode: 'view', reportId: previewReportId };
    state.previewReport = null;
    await load();
    render();
  }

  function openCurrentPreviewReport() {
    const formNode = currentRoot?.querySelector('#report-form, #reporte-form');
    if (formNode instanceof HTMLFormElement) {
      preview(new FormData(formNode));
      state.form = applyCellToReportForm(state.form, state.catalogs);
    }

    const snapshot = buildReportPayload(state.form, {
      isDraft: true,
      lastStage: String(state.lastSavedStage || state.activeStage || 'cierre').trim() || 'cierre',
    });
    state.previewReport = {
      id: state.reportId || '',
      week: snapshot.week,
      cellNumber: snapshot.cellNumber,
      reportDate: snapshot.reportDate,
      leaderName: snapshot.leaderName,
      formData: snapshot,
    };
    state.previewVisitorsOpen = false;
    render();
  }

  async function renderElementToPngBlob(element) {
    if (!element) return null;
    if (typeof window.html2canvas !== 'function') {
      window.alert('No se pudo cargar la utilidad de captura (html2canvas). Verifica tu conexión.');
      return null;
    }
    element.classList.add('is-capturing');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const fullWidth = Math.max(element.scrollWidth, element.offsetWidth, element.clientWidth);
      const fullHeight = Math.max(element.scrollHeight, element.offsetHeight, element.clientHeight);
      const canvas = await window.html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1) || 1,
        useCORS: true,
        logging: false,
        width: fullWidth,
        height: fullHeight,
        windowWidth: Math.max(fullWidth, window.innerWidth),
        windowHeight: Math.max(fullHeight, window.innerHeight),
        scrollX: 0,
        scrollY: -window.scrollY,
      });
      return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
    } catch (error) {
      window.alert(`No se pudo generar la imagen: ${error.message || error}`);
      return null;
    } finally {
      element.classList.remove('is-capturing');
    }
  }

  async function downloadElementAsPng(element, filename) {
    const blob = await renderElementToPngBlob(element);
    if (!blob) return;
    const link = document.createElement('a');
    link.download = filename || 'reporte.png';
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    link.remove();
  }

  async function shareElementWithText(element, _text, filename) {
    const blob = await renderElementToPngBlob(element);
    if (!blob) return;
    const file = new File([blob], filename || 'reporte.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    await downloadElementAsPng(element, filename);
    window.alert('Se descargó la imagen. Abre WhatsApp y adjúntala manualmente con el clip.');
  }

  function buildPreviewWhatsAppText(report) {
    const formData = report?.formData || {};
    const attendanceSummary = formData.attendanceSummary || {};
    const visitors = (Array.isArray(formData.visitors) ? formData.visitors : []).filter((entry) => String(entry?.name || '').trim());
    const kids = (Array.isArray(formData.kids) ? formData.kids : []).filter((entry) => String(entry?.name || '').trim());
    const memberAttendance = Array.isArray(formData.memberAttendance) ? formData.memberAttendance : [];
    const planningPresent = Number(attendanceSummary.planningMembersPresent || memberAttendance.filter((entry) => entry?.planningAttended).length || 0);
    const reachMembers = Number(attendanceSummary.reachMembersPresent || memberAttendance.filter((entry) => entry?.reachAttended).length || 0);
    const sundayMembers = Number(attendanceSummary.sundayMembersPresent || memberAttendance.filter((entry) => entry?.sundayAttended).length || 0);
    const sundayVisitors = visitors.filter((entry) => entry?.sundayAttended).length;
    const sundayKids = kids.filter((entry) => entry?.sundayAttended).length;
    const lines = [
      `📋 *Reporte célula ${String(formData.cellNumber || report?.cellNumber || '—')} · Semana ${String(formData.week || report?.week || '—')}*`,
      formData.leaderName ? `Líder: ${formData.leaderName}` : '',
      '',
      '*PLANEACIÓN*',
      `• Miembros asistentes: ${planningPresent}`,
      '',
      '*ALCANCE*',
      `• Miembros: ${reachMembers}`,
      `• Amigos: ${visitors.length}`,
      `• Niños: ${kids.length}`,
      `• Conversiones: ${Number(attendanceSummary.reachConversions || visitors.filter((entry) => entry?.converted).length || 0)}`,
      '',
      '*CULTO INSPIRADOR*',
      `• Miembros: ${sundayMembers}`,
      `• Amigos: ${sundayVisitors}`,
      `• Niños: ${sundayKids}`,
    ].filter(Boolean);
    if (formData.notes) {
      lines.push('', '*Notas*', formData.notes);
    }
    return lines.join('\n');
  }

  function syncPreviewDialogActions() {
    const previewDialogBody = currentRoot ? currentRoot.querySelector('#preview-dialog-body') : null;
    const cancelButton = currentRoot ? currentRoot.querySelector('#preview-cancel-btn') : null;
    const editButton = currentRoot ? currentRoot.querySelector('#preview-edit-from-seg-btn') : null;
    const downloadButton = currentRoot ? currentRoot.querySelector('#preview-download-btn') : null;
    const whatsappButton = currentRoot ? currentRoot.querySelector('#preview-whatsapp-btn') : null;
    const confirmButton = currentRoot ? currentRoot.querySelector('#preview-confirm-btn') : null;
    if (cancelButton instanceof HTMLButtonElement) {
      cancelButton.hidden = false;
    }
    if (editButton instanceof HTMLButtonElement) {
      editButton.hidden = true;
    }
    if (confirmButton instanceof HTMLButtonElement) {
      confirmButton.hidden = true;
    }
    const previewReport = state.previewReport;
    const filename = `reporte-celula${String(previewReport?.formData?.cellNumber || previewReport?.cellNumber || '—')}-S${String(previewReport?.formData?.week || previewReport?.week || '—')}.png`;
    if (downloadButton instanceof HTMLButtonElement) {
      downloadButton.hidden = !previewReport;
      downloadButton.onclick = previewReport && previewDialogBody instanceof HTMLElement
        ? () => { downloadElementAsPng(previewDialogBody, filename); }
        : null;
    }
    if (whatsappButton instanceof HTMLButtonElement) {
      whatsappButton.hidden = !previewReport;
      whatsappButton.onclick = previewReport && previewDialogBody instanceof HTMLElement
        ? () => { shareElementWithText(previewDialogBody, buildPreviewWhatsAppText(previewReport), filename); }
        : null;
    }
  }

  async function openSeguimiento() {
    if (typeof options.onNavigate === 'function') {
      await options.onNavigate('seguimiento', null);
    }
  }

  function render({ scrollStageTab = false, preserveScroll = true } = {}) {
    if (!currentRoot) return;
    const appContent = document.querySelector('#app-content');
    const windowScrollY = typeof window.scrollY === 'number' ? window.scrollY : window.pageYOffset || 0;
    const contentScrollTop = appContent instanceof HTMLElement ? appContent.scrollTop : 0;
    document.body.dataset.activeStage = state.activeStage || 'encabezado';
    const routeLabel = document.querySelector('#topbar-route-label');
    if (routeLabel) {
      const stageLabel = STAGE_LABELS[state.activeStage] || 'Inicio';
      const weekInfo = getRcmWeekInfo(state.form?.week);
      const verbLabel = String(weekInfo?.verb || '').trim();
      routeLabel.textContent = verbLabel
        ? `Reporte · ${stageLabel} · ${verbLabel}`
        : `Reporte · ${stageLabel}`;
    }
    state.planningSummary = getPlanningSummary(state.form.memberAttendance);
    state.reachSummary = getReachSummary(state.form.memberAttendance, state.form.visitors, state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.sundaySummary = getSundaySummary(state.form.memberAttendance, state.form.visitors, state.form.kids);
    state.weeklySummary = getWeeklySummary(state.form);
    state.baptismCaptureStatus = getBaptismCaptureStatus(state.form.reportDate);
    state.baptismRegistrationMessage = getBaptismRegistrationMessage(state.baptismCaptureStatus);
    state.baptismSummary = computeBaptismMetrics(state.reports, state.form, state.reportId || state.context?.reportId);
    state.invitedByOptions = buildInvitedByOptions(state.form, state.catalogs);
    state.visitorQuickForm = state.visitorQuickForm || createVisitorQuickForm();
    state.baptismQuickForm = state.baptismQuickForm || createBaptismQuickForm(state.form.reportDate);
    state.kidQuickForm = state.kidQuickForm || createKidQuickForm();
    state.visitorProcessOptions = getVisitorProcessOptions(state.form, state.settings, state.visitorQuickForm.kind);
    state.visitorProcessOptionsByKind = {
      amigo: getVisitorProcessOptions(state.form, state.settings, 'amigo'),
      visita: getVisitorProcessOptions(state.form, state.settings, 'visita'),
    };
    state.visitorHistory = buildVisitorHistory(state.reports, state.form.cellNumber, state.reportId || state.context?.reportId);
    state.findVisitorHistoryEntry = findVisitorHistoryEntry;
    state.getVisitorProcessStatusLabel = getVisitorProcessStatusLabel;
    state.reachExternalCandidates = getReachExternalParticipantCandidates(state.catalogs, state.form.cellNumber);
    state.reachExternalSelected = getReachExternalParticipants(state.form.externalParticipants, state.catalogs, state.form.cellNumber);
    state.reachExternalKindLabel = getExternalParticipantKindLabel;
    state.reportHistory = buildReportHistoryState(state.reports, state.currentUser, state.settings);
    currentRoot.innerHTML = renderReporteShell(state);
    syncStageBadges();
    const activeTab = scrollStageTab
      ? currentRoot.querySelector(`.stage-tab.is-active[data-stage="${state.activeStage}"]`)
      : null;
    if (activeTab && typeof activeTab.scrollIntoView === 'function') {
      try {
        const useMobileAlignment = typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 768px)').matches;
        activeTab.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: useMobileAlignment ? 'start' : 'center',
        });
      } catch {
        // Ignore older browsers that do not support scroll options.
      }
    }
    attachReporteController(currentRoot, {
      setStage,
      continueFromHeader,
      getNextStage,
      preview,
      updateReportField,
      changeCell,
      maybeOpenExisting,
      submit,
      finalize,
      updatePlanning,
      fillPlanning,
      clearPlanning,
      clearActiveMemberActivities,
      updateAttendance,
      updateReach,
      updateMemberEvent,
      updateReachMeta,
      toggleExternalParticipant,
      copyPlanningToReach: handleCopyPlanningToReach,
      fillReachMembers,
      fillReachPrivileges,
      clearReach,
      updateSunday,
      copyReachToSunday: handleCopyReachToSunday,
      fillSundayMembers,
      fillSundayVisitors,
      copyVisitorReachToSunday: handleCopyVisitorReachToSunday,
      clearSunday,
      updateVisitorQuick,
      resetVisitorQuick: handleResetVisitorQuick,
      updateVisitor: handleUpdateVisitor,
      updateKid: updateKidEntry,
      updateKidQuick,
      resetKidQuick: handleResetKidQuick,
      fillSundayKids: handleFillSundayKids,
      copyKidReachToSunday: handleCopyKidReachToSunday,
      clearVisitors: handleClearVisitors,
      clearKids: handleClearKids,
      addKid: handleAddKid,
      removeKid: handleRemoveKid,
      updateBaptismQuick,
      addBaptism: handleAddBaptism,
      updateBaptism: handleUpdateBaptism,
      removeBaptism: handleRemoveBaptism,
      addVisitor: handleAddVisitor,
      addExternalMemberVisit,
      hideVisitorHistorySelection: handleHideVisitorHistorySelection,
      restoreHiddenVisitorHistory: handleRestoreHiddenVisitorHistory,
      removeVisitor: handleRemoveVisitor,
      openHistoryReport,
      closeGraceBanner,
      captureGraceReport,
      closePreviewReport,
      openPreviewVisitors,
      closePreviewVisitors,
      openPreviewReportForm,
      openCurrentPreviewReport,
      openSeguimiento,
    });
    syncGraceBannerUi();
    syncPreviewDialogActions();
    syncGlobalFeedback();
    if (preserveScroll) {
      try {
        window.scrollTo(0, windowScrollY);
      } catch {
        // Ignore environments without window scrolling support.
      }
      if (appContent instanceof HTMLElement) {
        appContent.scrollTop = contentScrollTop;
      }
    }
    const previewDialog = currentRoot.querySelector('#report-preview-dialog');
    if (previewDialog instanceof HTMLDialogElement && state.previewReport && !previewDialog.open) {
      previewDialog.showModal();
    }
    const previewVisitorsDialog = currentRoot.querySelector('#preview-visitors-dialog');
    if (previewVisitorsDialog instanceof HTMLDialogElement && state.previewVisitorsOpen && !previewVisitorsDialog.open) {
      previewVisitorsDialog.showModal();
    }
  }

  return {
    async mount(root) {
      currentRoot = root || null;
      if (!currentRoot) return;
      state.context = normalizeReporteContext(options.initialContext);
      try {
        await load();
        state.message = '';
        state.isError = false;
      } catch (error) {
        state.message = error.message;
        state.isError = true;
        syncOptions();
      }
      render({
        scrollStageTab: state.activeStage !== 'encabezado',
        preserveScroll: true,
      });
    },
    unmount(root) {
      delete document.body.dataset.activeStage;
      if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      if (visitorInlineMessageTimer) {
        clearTimeout(visitorInlineMessageTimer);
        visitorInlineMessageTimer = null;
      }
      clearGraceBannerTimer();
      if (rowHighlightTimer) {
        clearTimeout(rowHighlightTimer);
        rowHighlightTimer = null;
      }
      clearGlobalFeedback();
      currentRoot = null;
      if (root) {
        root.innerHTML = '';
      }
    },
  };
}
