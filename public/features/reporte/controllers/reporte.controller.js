function callAction(action, args = []) {
  if (typeof action !== 'function') {
    return Promise.resolve(undefined);
  }
  return Promise.resolve(action(...args));
}

function readVisitorQuickSnapshot(scope) {
  if (!(scope instanceof Element)) return null;
  const nameField = scope.querySelector('#visitor-quick-name');
  const historyField = scope.querySelector('#visitor-quick-history');
  const kindField = scope.querySelector('#visitor-quick-kind');
  const invitedByField = scope.querySelector('#visitor-quick-invited-by');
  const processField = scope.querySelector('#visitor-quick-process-entry');
  const reachField = scope.querySelector('input[data-visitor-field="reachAttended"]');
  const firstVisitField = scope.querySelector('input[data-visitor-field="firstVisit"]');
  const convertedField = scope.querySelector('input[data-visitor-field="converted"]');
  const sundayField = scope.querySelector('input[data-visitor-field="sundayAttended"]');
  const eventProgress = Array.from(scope.querySelectorAll('input[data-visitor-field="eventProgress"]')).reduce((result, field) => {
    if (!(field instanceof HTMLInputElement)) return result;
    const rcmKey = String(field.dataset.rcmKey || '').trim();
    if (!rcmKey) return result;
    result[rcmKey] = field.checked;
    return result;
  }, {});
  return {
    historySelection: historyField instanceof HTMLSelectElement ? historyField.value : '',
    name: nameField instanceof HTMLInputElement ? nameField.value : '',
    kind: kindField instanceof HTMLSelectElement ? kindField.value : 'amigo',
    invitedBy: invitedByField instanceof HTMLSelectElement ? invitedByField.value : '',
    processEntry: processField instanceof HTMLSelectElement ? processField.value : 'none',
    reachAttended: reachField instanceof HTMLInputElement ? reachField.checked : true,
    firstVisit: firstVisitField instanceof HTMLInputElement ? firstVisitField.checked : false,
    converted: convertedField instanceof HTMLInputElement ? convertedField.checked : false,
    eventAttended: Object.values(eventProgress).some(Boolean),
    eventProgress,
    sundayAttended: sundayField instanceof HTMLInputElement ? sundayField.checked : false,
  };
}

export function attachReporteController(root, actions) {
  if (!root) return;

  const previousAbortController = root.__reporteControllerAbort;
  if (previousAbortController && typeof previousAbortController.abort === 'function') {
    previousAbortController.abort();
  }

  const abortController = new AbortController();
  const signal = abortController.signal;
  root.__reporteControllerAbort = abortController;

  const form = root.querySelector('#report-form, #reporte-form');
  const addBaptismButton = root.querySelector('#add-baptism-button');

  root.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button[data-action="add-visitor"]');
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
  }, { signal });

  async function submitOrFinalize(nextStage, currentStage, config = {}) {
    if (!form) return;
    const shouldFinalize = nextStage === 'cierre' && currentStage === 'cierre' && typeof actions.finalize === 'function';
    if (shouldFinalize) {
      await actions.finalize(new FormData(form), currentStage);
      return;
    }
    await actions.submit(new FormData(form), nextStage, currentStage, config);
  }

  if (addBaptismButton) {
    addBaptismButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await callAction(actions.addBaptism);
    }, { signal });
  }

  root.addEventListener('keydown', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (event.key !== 'Enter') return;
    if (!target.closest('.visitor-quick-form') && !target.closest('#kid-quick-form')) return;

    event.preventDefault();
    if (target.closest('#kid-quick-form')) {
      await callAction(actions.addKid);
      return;
    }
    await callAction(actions.addVisitor);
  }, { signal });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const reportField = String(target.dataset.reportField || '').trim();
    if (!reportField) return;

    callAction(actions.updateReportField, [
      reportField,
      target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value,
      { render: false },
    ]);
  }, { signal });

  if (form) {
    form.addEventListener('change', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (target.name === 'cellNumber') {
        await callAction(actions.changeCell, [new FormData(form)]);
        await callAction(actions.maybeOpenExisting, [new FormData(form), 'cellNumber']);
        return;
      }
      if (target.name === 'week') {
        await callAction(actions.maybeOpenExisting, [new FormData(form), 'week']);
      }
    }, { signal });

    form.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }

      const visitorField = String(target.dataset.visitorField || '');
      if (visitorField && target.type === 'text') {
        callAction(actions.updateVisitorQuick, [visitorField, target.value, { render: false }]);
        return;
      }

      const kidQuickField = String(target.dataset.kidQuickField || '');
      if (kidQuickField && target.type === 'text') {
        callAction(actions.updateKidQuick, [kidQuickField, target.value]);
        return;
      }

      const baptismField = String(target.dataset.baptismField || '');
      if (baptismField) {
        callAction(actions.updateBaptismQuick, [baptismField, target.value]);
        return;
      }

      actions.preview(new FormData(form), target.name);
    }, { signal });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const nextStage = String(submitter && submitter.dataset ? submitter.dataset.nextStage || '' : '').trim();
      const activeStageTab = root.querySelector('.stage-tab.is-active');
      const currentStage = String(activeStageTab && activeStageTab.dataset ? activeStageTab.dataset.stage || '' : '').trim();
      await submitOrFinalize(nextStage, currentStage, { confirmEmptyStage: true });
    }, { signal });
  }

  root.addEventListener('click', async (event) => {
    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) return;

    const stageTab = clickTarget.closest('.stage-tab[data-stage]');
    if (stageTab instanceof HTMLElement) {
      const nextStage = String(stageTab.dataset.stage || 'encabezado').trim() || 'encabezado';
      const activeStageTab = root.querySelector('.stage-tab.is-active');
      const currentStage = String(activeStageTab && activeStageTab.dataset ? activeStageTab.dataset.stage || '' : '').trim();
      if (form && currentStage === 'encabezado' && nextStage !== 'encabezado') {
        await callAction(actions.continueFromHeader, [nextStage, new FormData(form)]);
        return;
      }
      await callAction(actions.setStage, [nextStage]);
      return;
    }

    const button = clickTarget.closest('button[data-action]');
    if (!(button instanceof HTMLButtonElement)) return;

    const actionName = String(button.dataset.action || '').trim();
    if (actionName === 'toggle-visitor') {
      const row = button.closest('tr');
      if (row instanceof HTMLTableRowElement) {
        const collapsed = row.classList.toggle('is-collapsed');
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      return;
    }
    if ((actionName === 'save-next' || actionName === 'save-stage' || actionName === 'save-report-stage') && form) {
      const nextStage = String(button.dataset.nextStage || '').trim();
      const activeStageTab = root.querySelector('.stage-tab.is-active');
      const currentStage = String(activeStageTab && activeStageTab.dataset ? activeStageTab.dataset.stage || '' : '').trim();
      await submitOrFinalize(nextStage, currentStage, { confirmEmptyStage: true });
      return;
    }

    if (actionName === 'view-report') {
      await callAction(actions.openHistoryReport, [String(button.dataset.id || '').trim()]);
      return;
    }
    if (actionName === 'close-grace-banner') {
      await callAction(actions.closeGraceBanner);
      return;
    }
    if (actionName === 'capture-grace-report') {
      await callAction(actions.captureGraceReport);
      return;
    }
    if (actionName === 'close-preview-report') {
      await callAction(actions.closePreviewReport);
      return;
    }
    if (actionName === 'open-preview-visitors') {
      await callAction(actions.openPreviewVisitors);
      return;
    }
    if (actionName === 'close-preview-visitors') {
      await callAction(actions.closePreviewVisitors);
      return;
    }
    if (actionName === 'open-preview-report-form') {
      await callAction(actions.openPreviewReportForm);
      return;
    }
    if (actionName === 'open-preview-current-report') {
      await callAction(actions.openCurrentPreviewReport);
      return;
    }
    if (actionName === 'go-seguimiento') {
      await callAction(actions.openSeguimiento);
      return;
    }
    if (actionName === 'fill-planning-members') {
      await callAction(actions.fillPlanning);
      return;
    }
    if (actionName === 'clear-planning-members') {
      await callAction(actions.clearPlanning);
      return;
    }
    if (actionName === 'clear-member-activities') {
      await callAction(actions.clearActiveMemberActivities);
      return;
    }
    if (actionName === 'copy-planning-to-reach') {
      await callAction(actions.copyPlanningToReach);
      return;
    }
    if (actionName === 'fill-reach-members') {
      await callAction(actions.fillReachMembers);
      return;
    }
    if (actionName === 'fill-reach-privileges') {
      await callAction(actions.fillReachPrivileges);
      return;
    }
    if (actionName === 'clear-reach-members') {
      await callAction(actions.clearReach);
      return;
    }
    if (actionName === 'clear-visitors') {
      await callAction(actions.clearVisitors);
      return;
    }
    if (actionName === 'copy-reach-to-sunday') {
      await callAction(actions.copyReachToSunday);
      return;
    }
    if (actionName === 'fill-sunday-members') {
      await callAction(actions.fillSundayMembers);
      return;
    }
    if (actionName === 'fill-sunday-visitors') {
      await callAction(actions.fillSundayVisitors);
      return;
    }
    if (actionName === 'copy-visitor-reach-to-sunday') {
      await callAction(actions.copyVisitorReachToSunday);
      return;
    }
    if (actionName === 'fill-sunday-kids') {
      await callAction(actions.fillSundayKids);
      return;
    }
    if (actionName === 'copy-kid-reach-to-sunday') {
      await callAction(actions.copyKidReachToSunday);
      return;
    }
    if (actionName === 'clear-sunday-members') {
      await callAction(actions.clearSunday);
      return;
    }
    if (actionName === 'clear-kids') {
      await callAction(actions.clearKids);
      return;
    }
    if (actionName === 'add-kid') {
      await callAction(actions.addKid);
      return;
    }
    if (actionName === 'reset-kid-quick') {
      await callAction(actions.resetKidQuick);
      return;
    }
    if (actionName === 'add-baptism') {
      await callAction(actions.addBaptism);
      return;
    }
    if (actionName === 'add-visitor') {
      const snapshot = readVisitorQuickSnapshot(button.closest('.visitor-quick-form') || root);
      await callAction(actions.addVisitor, [snapshot]);
      return;
    }
    if (actionName === 'add-external-member-visit') {
      const select = root.querySelector('select[data-external-member-visit-select]');
      if (select instanceof HTMLSelectElement) {
        await callAction(actions.addExternalMemberVisit, [String(select.value || '').trim()]);
      }
      return;
    }
    if (actionName === 'reset-visitor-quick') {
      await callAction(actions.resetVisitorQuick);
      return;
    }
    if (actionName === 'hide-visitor-history-selection') {
      await callAction(actions.hideVisitorHistorySelection);
      return;
    }
    if (actionName === 'restore-hidden-visitor-history') {
      await callAction(actions.restoreHiddenVisitorHistory);
      return;
    }
    if (actionName === 'remove-baptism') {
      const baptismIndex = parseInt(String(button.dataset.baptismIndex || ''), 10);
      if (Number.isInteger(baptismIndex)) {
        await actions.removeBaptism(baptismIndex);
      }
      return;
    }
    if (actionName === 'remove-visitor') {
      const visitorIndex = parseInt(String(button.dataset.visitorIndex || ''), 10);
      if (Number.isInteger(visitorIndex)) {
        await actions.removeVisitor(visitorIndex);
      }
      return;
    }
    if (actionName === 'remove-kid') {
      const kidIndex = parseInt(String(button.dataset.kidIndex || ''), 10);
      if (Number.isInteger(kidIndex)) {
        await actions.removeKid(kidIndex);
      }
    }
  }, { signal });

  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const attendanceIndex = parseInt(String(target.dataset.attendanceIndex || ''), 10);
    const attendanceField = String(target.dataset.attendanceField || '');
    if (Number.isInteger(attendanceIndex) && attendanceField) {
      await callAction(actions.updateAttendance, [
        attendanceIndex,
        attendanceField,
        target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value,
        {
          personId: String(target.dataset.personId || ''),
          rcmKey: String(target.dataset.rcmKey || ''),
        }
      ]);
      return;
    }

    const entryIndex = parseInt(String(target.dataset.planningIndex || ''), 10);
    const planningField = String(target.dataset.planningField || '');
    if (Number.isInteger(entryIndex) && planningField) {
      await actions.updatePlanning(entryIndex, planningField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const reachIndex = parseInt(String(target.dataset.reachIndex || ''), 10);
    const reachField = String(target.dataset.reachField || '');
    if (Number.isInteger(reachIndex) && reachField) {
      await actions.updateReach(reachIndex, reachField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const memberEventIndex = parseInt(String(target.dataset.memberEventIndex || ''), 10);
    const memberEventKey = String(target.dataset.memberEventKey || '');
    if (Number.isInteger(memberEventIndex) && memberEventKey) {
      await actions.updateMemberEvent(memberEventIndex, memberEventKey, target instanceof HTMLInputElement ? target.checked : Boolean(target.value));
      return;
    }

    const reachMetaField = String(target.dataset.reachMetaField || '');
    if (reachMetaField) {
      await actions.updateReachMeta(reachMetaField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const externalKind = String(target.dataset.externalKind || '');
    if (externalKind) {
      await actions.toggleExternalParticipant({
        personId: String(target.dataset.externalPersonId || '').trim() || null,
        name: String(target.dataset.externalName || '').trim(),
        kind: externalKind,
        relatedSector: String(target.dataset.externalSector || '').trim(),
        homeCellNumber: String(target.dataset.externalHomeCell || '').trim(),
        countsAs: 'member_present',
        stages: ['reach']
      }, target instanceof HTMLInputElement ? target.checked : false);
      return;
    }

    const sundayIndex = parseInt(String(target.dataset.sundayIndex || ''), 10);
    const sundayField = String(target.dataset.sundayField || '');
    if (Number.isInteger(sundayIndex) && sundayField) {
      await actions.updateSunday(sundayIndex, sundayField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const visitorField = String(target.dataset.visitorField || '');
    if (visitorField) {
      if (target instanceof HTMLInputElement && target.type === 'text') return;
      const resolvedVisitorField = visitorField === 'eventProgress'
        ? `eventProgress:${String(target.dataset.rcmKey || '').trim()}`
        : visitorField;
      await actions.updateVisitorQuick(resolvedVisitorField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const baptismField = String(target.dataset.baptismField || '');
    if (baptismField) {
      if (target instanceof HTMLInputElement && target.type === 'text') return;
      await actions.updateBaptismQuick(baptismField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const kidQuickField = String(target.dataset.kidQuickField || '');
    if (kidQuickField) {
      if (target instanceof HTMLInputElement && target.type === 'text') return;
      await actions.updateKidQuick(kidQuickField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const visitorIndex = parseInt(String(target.dataset.visitorIndex || ''), 10);
    const visitorUpdateField = String(target.dataset.visitorUpdateField || '');
    if (Number.isInteger(visitorIndex) && visitorUpdateField) {
      await actions.updateVisitor(visitorIndex, visitorUpdateField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const kidIndex = parseInt(String(target.dataset.kidIndex || ''), 10);
    const kidField = String(target.dataset.kidField || '');
    if (Number.isInteger(kidIndex) && kidField) {
      await actions.updateKid(kidIndex, kidField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
      return;
    }

    const baptismIndex = parseInt(String(target.dataset.baptismIndex || ''), 10);
    const baptismUpdateField = String(target.dataset.baptismUpdateField || '');
    if (Number.isInteger(baptismIndex) && baptismUpdateField) {
      await actions.updateBaptism(baptismIndex, baptismUpdateField, target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value);
    }
  }, { signal });

  const previewDialog = root.querySelector('#report-preview-dialog');
  if (previewDialog instanceof HTMLDialogElement) {
    previewDialog.addEventListener('click', (event) => {
      if (event.target === previewDialog) {
        callAction(actions.closePreviewReport);
      }
    }, { signal });
  }

  const previewVisitorsDialog = root.querySelector('#preview-visitors-dialog');
  if (previewVisitorsDialog instanceof HTMLDialogElement) {
    previewVisitorsDialog.addEventListener('click', (event) => {
      if (event.target === previewVisitorsDialog) {
        callAction(actions.closePreviewVisitors);
      }
    }, { signal });
  }
}
