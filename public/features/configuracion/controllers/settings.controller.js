export function attachSettingsController(root, actions) {
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

  cycleForm?.addEventListener('input', () => {
    actions.preview(new FormData(cycleForm));
  });

  cycleForm?.addEventListener('change', () => {
    actions.preview(new FormData(cycleForm));
  });

  cycleSaveButton?.addEventListener('click', async () => {
    if (!cycleForm) return;
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
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
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