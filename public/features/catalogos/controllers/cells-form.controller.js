export function attachCellsFormController(root, state, actions) {
  const openButton = root.querySelector('#catalogos-open-cells-form');
  const resetButton = root.querySelector('#catalogos-cells-form-reset');
  const closeButton = root.querySelector('#catalogos-cells-dialog-close');
  const dialog = root.querySelector('#catalogos-cells-dialog');
  const dialogBody = root.querySelector('#catalogos-cells-dialog .dialog-body');
  const form = root.querySelector('#catalogos-cells-form');
  const memberForm = root.querySelector('#catalogos-cell-member-form');
  const editButtons = root.querySelectorAll('[data-action="edit-cell"]');
  const deleteButtons = root.querySelectorAll('[data-action="delete-cell"]');
  const removeMemberButtons = root.querySelectorAll('[data-action="remove-member"]');
  const roleButtons = root.querySelectorAll('[data-action="set-cell-role"]');
  const membershipModeSelects = root.querySelectorAll('[data-action="set-membership-mode"]');
  const membershipDefaultCheckboxes = root.querySelectorAll('[data-action="set-membership-default"]');

  const syncMemberDefaultsRow = (row) => {
    if (!row) return;
    const modeSelect = row.querySelector('[data-action="set-membership-mode"]');
    const defaultsWrap = row.querySelector('.cell-member-defaults');
    if (!(modeSelect instanceof HTMLSelectElement) || !(defaultsWrap instanceof HTMLElement)) return;

    const isJustifiedDefault = modeSelect.value === 'justified_default';
    defaultsWrap.hidden = !isJustifiedDefault;
    if (!isJustifiedDefault) return;

    const checkboxes = Array.from(defaultsWrap.querySelectorAll('[data-action="set-membership-default"]'));
    const checkedCount = checkboxes.filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked).length;
    if (!checkedCount) {
      checkboxes.forEach((checkbox) => {
        if (checkbox instanceof HTMLInputElement) checkbox.checked = true;
      });
    }
  };

  openButton?.addEventListener('click', () => {
    state.view.editingCellId = '';
    state.view.cellsDialogScrollTop = 0;
    state.view.cellsFormMessage = '';
    state.view.cellsFormError = false;
    state.view.isCellsDialogOpen = true;
    state.view.isPeopleDialogOpen = false;
    actions.rerender();
  });

  const closeDialog = () => {
    state.view.isCellsDialogOpen = false;
    state.view.editingCellId = '';
    state.view.cellsDialogScrollTop = 0;
    state.view.cellsFormMessage = '';
    state.view.cellsFormError = false;
    actions.rerender();
  };

  resetButton?.addEventListener('click', () => {
    closeDialog();
  });

  closeButton?.addEventListener('click', closeDialog);

  dialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  editButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.view.editingCellId = String(button.dataset.id || '');
      state.view.cellsDialogScrollTop = 0;
      state.view.cellsFormMessage = '';
      state.view.cellsFormError = false;
      state.view.isCellsDialogOpen = true;
      state.view.isPeopleDialogOpen = false;
      actions.rerender();
    });
  });

  deleteButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const cellId = String(button.dataset.id || '');
      if (!cellId) return;
      const ok = window.confirm('Esta accion eliminara la celula y sus membresias. Deseas continuar?');
      if (!ok) return;
      await actions.deleteCell(cellId);
    });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await actions.submitCellsForm(new FormData(form));
  });

  memberForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await actions.addCellMember(new FormData(memberForm));
  });

  removeMemberButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = String(button.dataset.personId || '');
      if (!personId) return;
      const ok = window.confirm('Esta accion quitara a la persona de la celula actual. Deseas continuar?');
      if (!ok) return;
      await actions.removeCellMember(personId);
    });
  });

  roleButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = String(button.dataset.personId || '');
      const role = String(button.dataset.role || '');
      if (!personId || !role) return;
      await actions.setCellRole({ personId, role });
    });
  });

  membershipModeSelects.forEach((select) => {
    select.addEventListener('change', async () => {
      const personId = String(select.dataset.personId || '');
      if (!personId) return;
      state.view.cellsDialogScrollTop = dialogBody?.scrollTop || 0;
      const row = select.closest('.cells-members-grid-row') || select.closest('tr');
      syncMemberDefaultsRow(row);
      await actions.updateCellMemberMode({
        personId,
        row,
      });
    });
  });

  membershipDefaultCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const personId = String(checkbox.dataset.personId || '');
      if (!personId) return;
      state.view.cellsDialogScrollTop = dialogBody?.scrollTop || 0;
      const row = checkbox.closest('.cells-members-grid-row') || checkbox.closest('tr');
      syncMemberDefaultsRow(row);
      await actions.updateCellMemberMode({
        personId,
        row,
      });
    });
  });
}