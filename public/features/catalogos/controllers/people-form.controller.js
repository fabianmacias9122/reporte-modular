export function attachPeopleFormController(root, state, actions) {
  const openButton = root.querySelector('#catalogos-open-people-form');
  const resetButton = root.querySelector('#catalogos-people-form-reset');
  const closeButton = root.querySelector('#catalogos-people-dialog-close');
  const dialog = root.querySelector('#catalogos-people-dialog');
  const form = root.querySelector('#catalogos-people-form');
  const editButtons = root.querySelectorAll('[data-action="edit-person"]');
  const deleteButtons = root.querySelectorAll('[data-action="delete-person"]');
  const resetPasswordButtons = root.querySelectorAll('[data-action="reset-password"]');
  const toggleSystemButtons = root.querySelectorAll('[data-action="toggle-system-account"]');

  openButton?.addEventListener('click', () => {
    state.view.editingPersonId = '';
    state.view.peopleFormMessage = '';
    state.view.peopleFormError = false;
    state.view.isPeopleDialogOpen = true;
    state.view.isCellsDialogOpen = false;
    actions.rerender();
  });

  const closeDialog = () => {
    state.view.isPeopleDialogOpen = false;
    state.view.editingPersonId = '';
    state.view.peopleFormMessage = '';
    state.view.peopleFormError = false;
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
      state.view.editingPersonId = String(button.dataset.id || '');
      state.view.peopleFormMessage = '';
      state.view.peopleFormError = false;
      state.view.isPeopleDialogOpen = true;
      state.view.isCellsDialogOpen = false;
      actions.rerender();
    });
  });

  deleteButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = String(button.dataset.id || '');
      if (!personId) return;
      const ok = window.confirm('Esta accion eliminara la persona del catalogo. Deseas continuar?');
      if (!ok) return;
      await actions.deletePerson(personId);
    });
  });

  resetPasswordButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = String(button.dataset.id || '');
      if (!personId) return;
      const ok = window.confirm('Se reseteará la contraseña y la persona deberá configurarla de nuevo. ¿Deseas continuar?');
      if (!ok) return;
      await actions.resetPassword(personId);
    });
  });

  toggleSystemButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = String(button.dataset.id || '');
      if (!personId) return;
      await actions.toggleSystemAccount(personId);
    });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await actions.submitPeopleForm(new FormData(form));
  });
}