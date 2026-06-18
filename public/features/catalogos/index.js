import { addCellMember, deleteCell, removeCellMember, renumberCells, saveCell, updateCellMember } from './data/cells.repository.js';
import { fetchCatalogs } from './data/catalogos.repository.js';
import { adminResetPassword, deletePerson, movePersonMembership, savePerson, updatePersonAdmin, updatePersonRcm, updatePersonSystemAccount } from './data/people.repository.js';
import { createCatalogosViewState, createEmptyCatalogs, getCellById, normalizeCellMemberAttendanceDefaults, normalizeCellMemberAttendanceMode } from './models/catalogs-state.js';
import { attachCellsFormController } from './controllers/cells-form.controller.js';
import { attachCellsListController } from './controllers/cells-list.controller.js';
import { attachPeopleFormController } from './controllers/people-form.controller.js';
import { attachPeopleListController } from './controllers/people-list.controller.js';
import { renderCatalogosShell } from './views/catalogos-shell.js';

export function createCatalogosFeature(options = {}) {
  const state = {
    catalogs: createEmptyCatalogs(),
    view: createCatalogosViewState(),
  };

  let currentRoot = null;
  let feedbackTimer = 0;

  function showFloatingFeedback(message, isError = false) {
    const feedback = document.querySelector('#feedback');
    if (!(feedback instanceof HTMLElement) || !message) return;
    feedback.hidden = false;
    feedback.textContent = String(message);
    feedback.style.background = isError ? '#fdf0ee' : '#edf7f2';
    feedback.style.color = isError ? '#7a1f14' : '#145c38';
    feedback.style.borderColor = isError ? '#e8b4ae' : '#91d5b3';
    feedback.style.opacity = '1';
    clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => {
      feedback.style.opacity = '0';
      window.setTimeout(() => {
        feedback.hidden = true;
        feedback.textContent = '';
      }, 280);
    }, isError ? 6000 : 3500);
  }

  function setCellsFeedback(message, isError = false) {
    state.view.cellsFormError = isError;
    state.view.cellsFormMessage = '';
    showFloatingFeedback(message, isError);
  }

  function setActiveAdminSection(sectionId) {
    const nextSection = String(sectionId || 'admin-overview-section');
    if (state.view.activeAdminSection === nextSection) return false;
    state.view.activeAdminSection = nextSection;
    return true;
  }

  function syncAdminNavUI() {
    if (!currentRoot) return;
    currentRoot.querySelectorAll('#admin-section-nav button[data-admin-target]').forEach((button) => {
      const target = String(button.dataset.adminTarget || '');
      button.classList.toggle('is-active', target === state.view.activeAdminSection);
    });
  }

  function syncCatalogDialogs() {
    if (!currentRoot) return;
    const peopleDialog = currentRoot.querySelector('#catalogos-people-dialog');
    const cellsDialog = currentRoot.querySelector('#catalogos-cells-dialog');

    if (peopleDialog instanceof HTMLDialogElement) {
      if (state.view.isPeopleDialogOpen && !peopleDialog.open) {
        peopleDialog.showModal();
      } else if (!state.view.isPeopleDialogOpen && peopleDialog.open) {
        peopleDialog.close();
      }
    }

    if (cellsDialog instanceof HTMLDialogElement) {
      if (state.view.isCellsDialogOpen && !cellsDialog.open) {
        cellsDialog.showModal();
      } else if (!state.view.isCellsDialogOpen && cellsDialog.open) {
        cellsDialog.close();
      }

      if (state.view.isCellsDialogOpen) {
        const dialogBody = cellsDialog.querySelector('.dialog-body');
        if (dialogBody instanceof HTMLElement) {
          const nextScrollTop = Number(state.view.cellsDialogScrollTop || 0);
          requestAnimationFrame(() => {
            dialogBody.scrollTop = nextScrollTop;
          });
        }
      }
    }
  }

  function syncViewportFlags() {
    state.view.isMobileViewport = window.innerWidth <= 820;
  }

  function syncAdminSummaryPreviewCount() {
    const gridGap = state.view.isMobileViewport ? 6 : 12;
    const minCardWidth = state.view.isMobileViewport ? 0 : 150;
    if (state.view.isMobileViewport) {
      state.view.adminSummaryPreviewCount = 3;
      return;
    }

    const overviewSection = currentRoot?.querySelector('#admin-overview-section');
    const availableWidth = overviewSection instanceof HTMLElement
      ? Math.max(overviewSection.clientWidth - 2, 0)
      : window.innerWidth;
    const columnsThatFit = Math.max(1, Math.floor((availableWidth + gridGap) / (minCardWidth + gridGap)));
    state.view.adminSummaryPreviewCount = columnsThatFit;
  }

  function handleViewportResize() {
    const nextIsMobileViewport = window.innerWidth <= 820;
    const viewportChanged = state.view.isMobileViewport !== nextIsMobileViewport;
    state.view.isMobileViewport = nextIsMobileViewport;
    syncAdminSummaryPreviewCount();
    if (viewportChanged) {
      state.view.showAllAdminSummaryCards = false;
    }
    render();
  }

  function syncRenderedAdminSummaryPreview() {
    if (!currentRoot || state.view.showAllAdminSummaryCards) return;
    const renderedCards = Array.from(currentRoot.querySelectorAll('#admin-summary-cards .summary-card'));
    if (!renderedCards.length) return;

    const firstRowTop = renderedCards[0].offsetTop;
    const firstRowCount = renderedCards.filter((card) => Math.abs(card.offsetTop - firstRowTop) <= 1).length;
    if (!firstRowCount || firstRowCount === state.view.adminSummaryPreviewCount) return;

    state.view.adminSummaryPreviewCount = firstRowCount;
    render();
  }

  function scrollAdminSectionIntoView(sectionId, behavior = 'smooth') {
    if (!currentRoot) return;
    const section = currentRoot.querySelector(`#${sectionId}`);
    if (!(section instanceof HTMLElement) || typeof section.scrollIntoView !== 'function') return;
    try {
      section.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
    } catch {
      // Ignore environments with partial scrollIntoView support.
    }
  }

  function syncAdminSectionFromViewport() {
    if (!currentRoot) return;
    const sections = Array.from(currentRoot.querySelectorAll('.admin-section-anchor'));
    if (!sections.length) return;

    const viewportTop = window.innerHeight ? window.innerHeight * 0.2 : 120;
    let activeId = sections[0]?.id || 'admin-overview-section';

    sections.forEach((section) => {
      if (!(section instanceof HTMLElement) || !section.id) return;
      const rect = section.getBoundingClientRect();
      if (rect.top <= viewportTop) {
        activeId = section.id;
      }
    });

    if (setActiveAdminSection(activeId)) {
      syncAdminNavUI();
    }
  }

  async function reloadCatalogs() {
    state.catalogs = await fetchCatalogs({ requestFn: options.requestFn });
  }

  async function submitPeopleForm(formData) {
    const personId = String(formData.get('personId') || '');
    const person = (state.catalogs.people || []).find((item) => String(item.id) === personId) || null;
    const isKid = formData.get('isKid') === 'on';
    const isPastor = formData.get('isPastor') === 'on';
    const isSystemAccount = Boolean(options.currentUser?.isSystemAccount);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      role: isPastor ? 'pastor' : isKid ? 'kid' : 'member',
      phone: String(formData.get('phone') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      guardianPersonId: String(formData.get('guardianPersonId') || '').trim(),
      guardianName: String(formData.get('guardianName') || '').trim(),
      supervisorSector: String(formData.get('supervisorSector') || '').trim(),
      isCoordinator: formData.get('isCoordinator') === 'on',
    };
    if (isSystemAccount) {
      payload.username = String(formData.get('username') || '').trim();
    }
    const newCellId = String(formData.get('assignedCellId') || '').trim();
    const oldCellId = String(person?.assignedCellId || '');

    try {
      const saved = await savePerson(payload, {
        requestFn: options.requestFn,
        currentUser: options.currentUser,
        personId,
      });
      await movePersonMembership({
        oldCellId,
        newCellId,
        personId: saved.id,
      }, {
        requestFn: options.requestFn,
      });
      if (isSystemAccount) {
        await updatePersonAdmin(saved.id, formData.get('isAdmin') === 'on', {
          requestFn: options.requestFn,
          currentUser: options.currentUser,
        });
      }
      await reloadCatalogs();
      state.view.editingPersonId = '';
      state.view.isPeopleDialogOpen = false;
      state.view.peopleFormError = false;
      state.view.peopleFormMessage = saved.created ? 'Persona agregada.' : 'Persona actualizada.';
      render();
    } catch (error) {
      state.view.peopleFormError = true;
      state.view.peopleFormMessage = error.message;
      render();
    }
  }

  async function removePerson(personId) {
    try {
      await deletePerson(personId, { requestFn: options.requestFn });
      await reloadCatalogs();
      if (state.view.editingPersonId === personId) {
        state.view.editingPersonId = '';
      }
      state.view.peopleFormError = false;
      state.view.peopleFormMessage = 'Persona eliminada.';
      render();
    } catch (error) {
      state.view.peopleFormError = true;
      state.view.peopleFormMessage = error.message;
      render();
    }
  }

  async function resetPersonPassword(personId) {
    try {
      await adminResetPassword(personId, {
        requestFn: options.requestFn,
        currentUser: options.currentUser,
      });
      state.view.peopleFormError = false;
      state.view.peopleFormMessage = 'Contraseña reseteada.';
      render();
    } catch (error) {
      state.view.peopleFormError = true;
      state.view.peopleFormMessage = error.message;
      render();
    }
  }

  async function togglePersonSystemAccount(personId) {
    const person = (state.catalogs.people || []).find((item) => String(item.id) === String(personId || ''))
      || (state.catalogs.systemPeople || []).find((item) => String(item.id) === String(personId || ''))
      || null;
    if (!person) return;

    const becoming = !Boolean(person.isSystemAccount);
    const ok = window.confirm(
      becoming
        ? `¿Convertir a "${person.name}" en cuenta de sistema? Dejará de aparecer en listados, RCM y reportes.`
        : `¿Convertir a "${person.name}" en miembro real? Volverá a aparecer en listados, RCM y reportes.`
    );
    if (!ok) return;

    try {
      await updatePersonSystemAccount(personId, becoming, {
        requestFn: options.requestFn,
        currentUser: options.currentUser,
      });
      await reloadCatalogs();
      if (!becoming && state.view.activeAdminSection === 'admin-system-section') {
        state.view.activeAdminSection = 'admin-people-section';
      }
      state.view.peopleFormError = false;
      state.view.peopleFormMessage = becoming ? 'Convertida en cuenta de sistema.' : 'Convertida en miembro real.';
      render();
    } catch (error) {
      state.view.peopleFormError = true;
      state.view.peopleFormMessage = error.message;
      render();
    }
  }

  async function patchPersonRcm(personId, payload) {
    const result = await updatePersonRcm(personId, payload, { requestFn: options.requestFn });
    const person = (state.catalogs.people || []).find((item) => String(item.id) === String(personId || ''))
      || (state.catalogs.systemPeople || []).find((item) => String(item.id) === String(personId || ''))
      || null;
    if (person) {
      person.rcmProgress = result?.rcmProgress || { ...(person.rcmProgress || {}), ...payload };
    }
    return result;
  }

  async function submitCellsForm(formData) {
    const cellId = String(formData.get('cellId') || '');
    const payload = {
      cellNumber: String(formData.get('cellNumber') || '').trim(),
      networkName: String(formData.get('networkName') || '').trim(),
      sector: String(formData.get('sector') || '').trim(),
      zoneName: String(formData.get('zoneName') || '').trim(),
      districtName: String(formData.get('districtName') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      leaderPersonId: String(formData.get('leaderPersonId') || '').trim(),
      assistantPersonId: String(formData.get('assistantPersonId') || '').trim(),
      hostPersonId: String(formData.get('hostPersonId') || '').trim(),
    };

    try {
      const saved = await saveCell(payload, {
        requestFn: options.requestFn,
        cellId,
      });
      await reloadCatalogs();
      state.view.editingCellId = '';
      state.view.isCellsDialogOpen = false;
      setCellsFeedback(saved.created ? 'Celula agregada.' : 'Celula actualizada.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function removeCell(cellId) {
    try {
      await deleteCell(cellId, { requestFn: options.requestFn });
      await reloadCatalogs();
      if (state.view.editingCellId === cellId) {
        state.view.editingCellId = '';
      }
      setCellsFeedback('Celula eliminada.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function reorderCells() {
    try {
      await renumberCells({ requestFn: options.requestFn });
      await reloadCatalogs();
      setCellsFeedback('Células reorganizadas.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function submitCellMemberForm(formData) {
    const cellId = state.view.editingCellId;
    const personId = String(formData.get('personId') || '');
    if (!cellId || !personId) {
      setCellsFeedback('Selecciona una persona valida.', true);
      render();
      return;
    }

    try {
      await addCellMember(cellId, personId, { requestFn: options.requestFn });
      await reloadCatalogs();
      setCellsFeedback('Miembro agregado.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function detachCellMember(personId) {
    const cellId = state.view.editingCellId;
    if (!cellId || !personId) return;

    try {
      await removeCellMember(cellId, personId, { requestFn: options.requestFn });
      await reloadCatalogs();
      setCellsFeedback('Miembro removido.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function setCellRole(params) {
    const cellId = state.view.editingCellId;
    const { personId, role } = params;
    const cell = getCellById(state.catalogs, cellId);
    if (!cell || !personId || !role) return;

    const isActive = (role === 'leader' && String(cell.leaderPersonId || '') === personId)
      || (role === 'assistant' && String(cell.assistantPersonId || '') === personId)
      || (role === 'host' && String(cell.hostPersonId || '') === personId);

    const payload = {
      cellNumber: cell.cellNumber,
      networkName: cell.networkName || '',
      sector: cell.sector || '',
      zoneName: cell.zoneName || '',
      districtName: cell.districtName || '',
      address: cell.address || '',
      leaderPersonId: role === 'leader' ? (isActive ? '' : personId) : String(cell.leaderPersonId || ''),
      assistantPersonId: role === 'assistant' ? (isActive ? '' : personId) : String(cell.assistantPersonId || ''),
      hostPersonId: role === 'host' ? (isActive ? '' : personId) : String(cell.hostPersonId || ''),
    };

    try {
      await saveCell(payload, { requestFn: options.requestFn, cellId });
      await reloadCatalogs();
      setCellsFeedback('Rol de celula actualizado.');
      render();
    } catch (error) {
      setCellsFeedback(error.message, true);
      render();
    }
  }

  async function updateCellMemberMode(params) {
    const cellId = state.view.editingCellId;
    const { personId, row } = params;
    if (!cellId || !personId || !row) return;

    const mode = normalizeCellMemberAttendanceMode(row.querySelector('[data-action="set-membership-mode"]')?.value);
    const attendanceDefaults = normalizeCellMemberAttendanceDefaults({
      planning: row.querySelector('[data-action="set-membership-default"][data-stage="planning"]')?.checked,
      reach: row.querySelector('[data-action="set-membership-default"][data-stage="reach"]')?.checked,
      sunday: row.querySelector('[data-action="set-membership-default"][data-stage="sunday"]')?.checked,
    }, mode);

    try {
      await updateCellMember(cellId, personId, {
        attendanceMode: mode,
        attendanceDefaults,
      }, { requestFn: options.requestFn });
      const cell = getCellById(state.catalogs, cellId);
      const member = Array.isArray(cell?.members)
        ? cell.members.find((item) => String(item.id) === String(personId))
        : null;
      if (member) {
        member.attendanceMode = mode;
        member.attendanceDefaults = attendanceDefaults;
      }
      setCellsFeedback('Modo de asistencia actualizado.');
    } catch (error) {
      setCellsFeedback(error.message, true);
    }
  }

  function render() {
    if (!currentRoot) return;
    currentRoot.innerHTML = renderCatalogosShell(state);
    syncAdminNavUI();
    syncCatalogDialogs();
    const adminSectionNav = currentRoot.querySelector('#admin-section-nav');
    adminSectionNav?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-admin-target]');
      if (!button) return;
      const targetSectionId = String(button.dataset.adminTarget || 'admin-overview-section');
      if (setActiveAdminSection(targetSectionId)) {
        syncAdminNavUI();
      }
      scrollAdminSectionIntoView(targetSectionId, 'smooth');
    });
    currentRoot.querySelector('[data-action="toggle-admin-summary-cards"]')?.addEventListener('click', () => {
      state.view.showAllAdminSummaryCards = !state.view.showAllAdminSummaryCards;
      render();
    });
    attachPeopleListController(currentRoot, state, {
      rerender: render,
      updatePersonRcm: patchPersonRcm,
      refreshCatalogs: async () => {
        await reloadCatalogs();
        render();
      },
    });
    attachCellsListController(currentRoot, state, { rerender: render, renumberCells: reorderCells });
    attachPeopleFormController(currentRoot, state, {
      rerender: render,
      submitPeopleForm,
      deletePerson: removePerson,
      resetPassword: resetPersonPassword,
      toggleSystemAccount: togglePersonSystemAccount,
    });
    attachCellsFormController(currentRoot, state, {
      rerender: render,
      submitCellsForm,
      deleteCell: removeCell,
      addCellMember: submitCellMemberForm,
      removeCellMember: detachCellMember,
      setCellRole,
      updateCellMemberMode,
    });
    syncRenderedAdminSummaryPreview();
  }

  return {
    async mount(root) {
      currentRoot = root || null;
      state.view.actorPersonId = String(options.currentUser?.personId || '');
      state.view.actorIsSystemAccount = Boolean(options.currentUser?.isSystemAccount);
      state.view.actorIsAdmin = Boolean(options.currentUser?.isAdmin);
      syncViewportFlags();
      syncAdminSummaryPreviewCount();
      await reloadCatalogs();
      render();
      window.addEventListener('scroll', syncAdminSectionFromViewport, { passive: true });
      window.addEventListener('resize', handleViewportResize, { passive: true });
      return state.catalogs;
    },
    unmount(root) {
      window.removeEventListener('scroll', syncAdminSectionFromViewport);
      window.removeEventListener('resize', handleViewportResize);
      currentRoot = null;
      if (root) {
        root.innerHTML = '';
      }
    },
    getState() {
      return state;
    },
  };
}
