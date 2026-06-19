export function attachSettingsController(root, actions) {
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
    });
  });

  mobileRcmToggleButton?.addEventListener('click', () => {
    actions.toggleMobileRcmExpanded?.();
  });

  cycleForm?.addEventListener('input', () => {
    actions.preview(new FormData(cycleForm));
  });

  cycleForm?.addEventListener('change', () => {
    actions.preview(new FormData(cycleForm));
  });

  cycleSaveButton?.addEventListener('click', async () => {
    if (!cycleForm) return;
    if (goalsForm && typeof actions.saveCycleSection === 'function') {
      await actions.saveCycleSection(new FormData(cycleForm), new FormData(goalsForm));
      return;
    }
    await actions.saveCycle(new FormData(cycleForm));
  });

  goalsSaveButton?.addEventListener('click', async () => {
    if (!goalsForm) return;
    await actions.saveGoals(new FormData(goalsForm));
  });

  prefsSaveButton?.addEventListener('click', async () => {
    if (!preferencesForm) return;
    await actions.savePreferences(new FormData(preferencesForm));
  });

  languageForm?.addEventListener('change', async () => {
    await actions.setLanguage(new FormData(languageForm));
  });

  verbsAddButton?.addEventListener('click', async () => {
    await actions.addRcmWeek();
  });

  verbsSaveButton?.addEventListener('click', async () => {
    await actions.saveRcmWeeks();
  });

  verbsResetButton?.addEventListener('click', async () => {
    await actions.resetRcmWeeks();
  });

  root.querySelector('#rcm-verbs-tbody')?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const removeButton = target.closest('.rvt-remove');
    if (!(removeButton instanceof HTMLButtonElement)) return;
    const weekNumber = parseInt(String(removeButton.dataset.week || ''), 10);
    if (!Number.isInteger(weekNumber)) return;
    await actions.removeRcmWeek(weekNumber);
  });

  root.querySelector('#rcm-verbs-tbody')?.addEventListener('change', async (event) => {
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
    if (target.classList.contains('rvt-event')) {
      await actions.updateRcmWeek(weekNumber, { event: target.value });
    }
  });
}