export function attachSettingsController(root, actions) {
  if (!root) return;

  const previousAbortController = root.__settingsControllerAbort;
  if (previousAbortController && typeof previousAbortController.abort === 'function') {
    previousAbortController.abort();
  }

  const abortController = new AbortController();
  const signal = abortController.signal;
  root.__settingsControllerAbort = abortController;

  const mobileNavButtons = Array.from(root.querySelectorAll('.settings-mobile-nav__chip'));
  const mobileSections = Array.from(root.querySelectorAll('.settings-mobile-section'));
  const cycleForm = root.querySelector('#settings-cycle-form');
  const goalsForm = root.querySelector('#settings-goals-form');
  const preferencesForm = root.querySelector('#configuracion-preferences-form');
  const languageForm = root.querySelector('#configuracion-language-form');
  const cycleSaveButton = root.querySelector('#settings-save-btn');
  const goalsSaveButton = root.querySelector('#settings-goals-save-btn');
  const prefsSaveButton = root.querySelector('#settings-prefs-save-btn');
  const verbsSaveButton = root.querySelector('#settings-rcm-verbs-save-btn');
  const verbsResetButton = root.querySelector('#settings-rcm-verbs-reset-btn');
  const verbsAddButton = root.querySelector('#rcm-verbs-add-btn');
  const mobileRcmToggleButton = root.querySelector('#settings-rcm-mobile-toggle');

  function syncMobileSections(sectionName) {
    const activeSection = sectionName || 'cycle';
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    mobileNavButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const isActive = button.dataset.section === activeSection;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    mobileSections.forEach((section) => {
      if (!(section instanceof HTMLElement)) return;
      const isActive = section.dataset.mobileSection === activeSection;
      section.classList.toggle('is-active', !isMobile || isActive);
      if (isMobile) {
        section.hidden = !isActive;
      } else {
        section.hidden = false;
      }
    });
  }

  syncMobileSections(actions.getMobileSection?.() || 'cycle');

  mobileNavButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener('click', () => {
      const nextSection = String(button.dataset.section || 'cycle');
      actions.setMobileSection?.(nextSection);
      syncMobileSections(nextSection);
      root.querySelector('#settings-section-' + nextSection)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, { signal });
  });

  mobileRcmToggleButton?.addEventListener('click', () => {
    actions.toggleMobileRcmExpanded?.();
  }, { signal });

  cycleForm?.addEventListener('input', () => {
    actions.preview(new FormData(cycleForm));
  }, { signal });

  cycleForm?.addEventListener('change', () => {
    actions.preview(new FormData(cycleForm));
  }, { signal });

  cycleSaveButton?.addEventListener('click', async () => {
    if (!cycleForm) return;
    if (goalsForm && typeof actions.saveCycleSection === 'function') {
      await actions.saveCycleSection(new FormData(cycleForm), new FormData(goalsForm));
      return;
    }
    await actions.saveCycle(new FormData(cycleForm));
  }, { signal });

  goalsSaveButton?.addEventListener('click', async () => {
    if (!goalsForm) return;
    await actions.saveGoals(new FormData(goalsForm));
  }, { signal });

  prefsSaveButton?.addEventListener('click', async () => {
    if (!preferencesForm) return;
    await actions.savePreferences(new FormData(preferencesForm));
  }, { signal });

  languageForm?.addEventListener('change', async () => {
    await actions.setLanguage(new FormData(languageForm));
  }, { signal });

  verbsAddButton?.addEventListener('click', async () => {
    await actions.addRcmWeek();
  }, { signal });

  verbsSaveButton?.addEventListener('click', async () => {
    await actions.saveRcmWeeks();
  }, { signal });

  verbsResetButton?.addEventListener('click', async () => {
    await actions.resetRcmWeeks();
  }, { signal });

  function readWeekSpecialEvents(weekNumber, includeBlank = false) {
    const items = Array.from(root.querySelectorAll(`.rvt-special-event-item[data-week="${weekNumber}"]`));
    return items
      .map((item) => {
        const eventField = item.querySelector('.rvt-special-event');
        const captureModeField = item.querySelector('.rvt-special-capture-mode');
        const eventName = eventField instanceof HTMLSelectElement ? eventField.value : '';
        return {
          event: eventName,
          captureMode: captureModeField instanceof HTMLSelectElement ? captureModeField.value : 'separate',
        };
      })
      .filter((entry) => includeBlank || String(entry.event || '').trim());
  }

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const openEditButton = target.closest('.rvt-special-edit');
    if (openEditButton instanceof HTMLButtonElement) {
      const weekNumber = parseInt(String(openEditButton.dataset.week || ''), 10);
      if (!Number.isInteger(weekNumber)) return;
      actions.openRcmEventsDialog?.(weekNumber);
      return;
    }
    const closeDialogButton = target.closest('[data-action="close-rcm-events-dialog"]');
    if (closeDialogButton instanceof HTMLButtonElement) {
      actions.closeRcmEventsDialog?.();
      return;
    }
    const addEventButton = target.closest('.rvt-special-add');
    if (addEventButton instanceof HTMLButtonElement) {
      const weekNumber = parseInt(String(addEventButton.dataset.week || ''), 10);
      if (!Number.isInteger(weekNumber)) return;
      const nextSpecialEvents = readWeekSpecialEvents(weekNumber);
      nextSpecialEvents.push({ event: 'Levantate', captureMode: 'separate' });
      await actions.updateRcmWeek(weekNumber, { specialEvents: nextSpecialEvents });
      return;
    }
    const removeEventButton = target.closest('.rvt-special-remove');
    if (removeEventButton instanceof HTMLButtonElement) {
      const weekNumber = parseInt(String(removeEventButton.dataset.week || ''), 10);
      const eventIndex = parseInt(String(removeEventButton.dataset.eventIndex || ''), 10);
      if (!Number.isInteger(weekNumber) || !Number.isInteger(eventIndex)) return;
      const nextSpecialEvents = readWeekSpecialEvents(weekNumber);
      nextSpecialEvents.splice(eventIndex, 1);
      await actions.updateRcmWeek(weekNumber, { specialEvents: nextSpecialEvents });
      return;
    }
    const removeButton = target.closest('.rvt-remove');
    if (!(removeButton instanceof HTMLButtonElement)) return;
    const weekNumber = parseInt(String(removeButton.dataset.week || ''), 10);
    if (!Number.isInteger(weekNumber)) return;
    await actions.removeRcmWeek(weekNumber);
  }, { signal });

  const rcmEventsDialog = root.querySelector('#settings-rcm-events-dialog');
  if (rcmEventsDialog instanceof HTMLDialogElement) {
    rcmEventsDialog.addEventListener('click', (event) => {
      if (event.target === rcmEventsDialog) {
        actions.closeRcmEventsDialog?.();
      }
    }, { signal });
    rcmEventsDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      actions.closeRcmEventsDialog?.();
    }, { signal });
  }

  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const weekNumber = parseInt(String(target.dataset.week || ''), 10);
    if (!Number.isInteger(weekNumber)) return;
    if (target.classList.contains('rvt-phase')) {
      await actions.updateRcmWeek(weekNumber, { phase: target.value });
      return;
    }
    if (target.classList.contains('rvt-verb')) {
      await actions.updateRcmWeek(weekNumber, { verb: target.value.toUpperCase() });
      return;
    }
    if (target.classList.contains('rvt-desc')) {
      await actions.updateRcmWeek(weekNumber, { verbDesc: target.value });
      return;
    }
    if (target.classList.contains('rvt-special-event') || target.classList.contains('rvt-special-capture-mode')) {
      await actions.updateRcmWeek(weekNumber, { specialEvents: readWeekSpecialEvents(weekNumber, true) });
      return;
    }
  }, { signal });
}