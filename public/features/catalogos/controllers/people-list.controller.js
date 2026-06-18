import { formatRole } from '../models/catalogs-state.js';
import {
  CLASS_MILESTONES,
  getNextClassMilestone,
  getPersonRcmSummary,
  RCM_MILESTONES,
} from '../views/people-rcm.js';

function closeDialog(dialog) {
  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close();
  }
}

function restoreInputFocus(selector, value, scrollY) {
  requestAnimationFrame(() => {
    const input = document.querySelector(selector);
    if (!(input instanceof HTMLInputElement)) return;
    window.scrollTo(0, scrollY);
    input.focus({ preventScroll: true });
    const nextValue = String(value || '');
    const cursor = nextValue.length;
    try {
      input.setSelectionRange(cursor, cursor);
    } catch {
      // Ignore inputs without selection support.
    }
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  });
}

function parseRcmMilestoneValue(value, type) {
  if (!value) return { state: 'none', date: '' };
  const raw = String(value || '');
  if (type === 'clase' && raw.startsWith('en_curso:')) {
    return { state: 'en_curso', date: raw.slice(9) };
  }
  return { state: 'done', date: raw };
}

function renderRcmDialogBody(person) {
  if (!person || person.role === 'kid') {
    return '<p class="empty-state">Esta persona no lleva seguimiento RCM.</p>';
  }

  const summary = getPersonRcmSummary(person);
  const sectionLabels = {
    ganar: 'Fase Ganar',
    consolidar: 'Fase Consolidar',
    discipular: 'Fase Discipular',
    escuelas: 'Escuelas',
  };
  const sectionPhase = {
    ganar: 'ganar',
    consolidar: 'consolidar',
    discipular: 'discipular',
    escuelas: 'escuelas',
  };
  const groups = ['ganar', 'consolidar', 'discipular', 'escuelas']
    .map((section) => {
      const rows = RCM_MILESTONES.filter((milestone) => milestone.section === section)
        .map((milestone) => {
          const { state, date } = parseRcmMilestoneValue(person.rcmProgress?.[milestone.key], milestone.type);
          const rowClass = state === 'en_curso' ? ' is-en-curso' : state === 'done' ? ' is-done' : '';
          const checkClass = state === 'en_curso' ? ' is-en-curso' : '';
          const checkLabel = state === 'en_curso' ? '↻' : state === 'done' ? '✓' : '';
          const pressed = state === 'en_curso' ? 'mixed' : state === 'done' ? 'true' : 'false';
          const dateLabel = milestone.type === 'clase' && state === 'en_curso' ? 'Inicio' : 'Fecha';
          const dateState = state === 'en_curso' ? 'en_curso' : 'done';
          return `
            <div class="rcm-milestone-row${rowClass}">
              <button type="button" class="rcm-milestone-toggle" data-rcm-person-id="${String(person.id || '')}" data-rcm-key="${milestone.key}" aria-pressed="${pressed}">
                <span class="rcm-milestone-check${checkClass}">${checkLabel}</span>
                <span class="rcm-milestone-label">${milestone.label}</span>
              </button>
              ${state === 'none' ? '' : `<span class="rcm-date-wrap"><span class="rcm-date-label">${dateLabel}</span><input type="date" class="rcm-date-input" data-rcm-person-id="${String(person.id || '')}" data-rcm-key="${milestone.key}" data-rcm-state="${dateState}" value="${date}"></span>`}
            </div>
          `;
        })
        .join('');
      return `<div class="rcm-panel-section"><p class="rcm-panel-section-title phase-badge-${sectionPhase[section]}">${sectionLabels[section]}</p>${rows}</div>`;
    })
    .join('');

  return `
    <div class="rcm-profile-panel">
      <div class="rcm-panel-progress">
        <span class="rcm-panel-pct">${summary.activeCount}/${summary.totalCount}</span>
        <div class="rcm-panel-bar"><div class="rcm-panel-bar-fill" style="width:${summary.pct}%"></div></div>
      </div>
      <div class="rcm-panel-body">${groups}</div>
    </div>
  `;
}

export function attachPeopleListController(root, state, actions) {
  const searchInput = root.querySelector('#catalogos-people-search');
  const filterSelect = root.querySelector('#catalogos-people-filter');
  const pageSizeSelect = root.querySelector('#catalogos-people-page-size');
  const filterTabs = root.querySelectorAll('#people-filter-tabs [data-role-filter]');
  const openRcmButtons = root.querySelectorAll('[data-action="open-rcm"]');
  const rcmDialog = root.querySelector('#catalogos-rcm-dialog');
  const rcmTitle = root.querySelector('#catalogos-rcm-title');
  const rcmBody = root.querySelector('#catalogos-rcm-body');
  const rcmClose = root.querySelector('#catalogos-rcm-close');
  const rcmDone = root.querySelector('#catalogos-rcm-done');
  const convocarOpen = root.querySelector('#catalogos-open-convocar');
  const convocarDialog = root.querySelector('#catalogos-convocar-dialog');
  const convocarClass = root.querySelector('#catalogos-convocar-class');
  const convocarMembers = root.querySelector('#catalogos-convocar-members');
  const convocarClose = root.querySelector('#catalogos-convocar-close');
  const convocarCancel = root.querySelector('#catalogos-convocar-cancel');
  const convocarConfirm = root.querySelector('#catalogos-convocar-confirm');
  const graduarOpen = root.querySelector('#catalogos-open-graduar');
  const graduarDialog = root.querySelector('#catalogos-graduar-dialog');
  const graduarClass = root.querySelector('#catalogos-graduar-class');
  const graduarMembers = root.querySelector('#catalogos-graduar-members');
  const graduarClose = root.querySelector('#catalogos-graduar-close');
  const graduarCancel = root.querySelector('#catalogos-graduar-cancel');
  const graduarConfirm = root.querySelector('#catalogos-graduar-confirm');
  const graduarNextWrap = root.querySelector('#catalogos-graduar-next-wrap');
  const graduarNext = root.querySelector('#catalogos-graduar-next');
  const graduarNextLabel = root.querySelector('#catalogos-graduar-next-label');
  let activeRcmPersonId = '';

  const rerenderActiveRcmPerson = () => {
    if (!rcmBody) return;
    const person = (state.catalogs.people || []).find((item) => String(item.id || '') === activeRcmPersonId) || null;
    if (!person) return;
    if (rcmTitle) rcmTitle.textContent = String(person.name || 'Persona');
    rcmBody.innerHTML = renderRcmDialogBody(person);
  };

  const trackablePeople = () => (state.catalogs.people || []).filter((person) => person.role !== 'kid');

  const populateConvocarMembers = () => {
    if (!convocarMembers || !convocarClass) return;
    const classKey = String(convocarClass.value || CLASS_MILESTONES[0]?.key || '');
    const eligible = trackablePeople()
      .filter((person) => !person.rcmProgress?.[classKey])
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
    if (!eligible.length) {
      convocarMembers.innerHTML = '<p class="empty-state">Todos los miembros ya tienen esta clase en curso o completada.</p>';
      return;
    }
    convocarMembers.innerHTML = eligible
      .map((person) => `<label class="convocar-member-row"><input type="checkbox" value="${String(person.id)}"><span>${person.name || ''}</span><span class="member-admin-caption">${formatRole(person.role)}</span></label>`)
      .join('');
  };

  const populateGraduarMembers = () => {
    if (!graduarMembers || !graduarClass) return;
    const classKey = String(graduarClass.value || CLASS_MILESTONES[0]?.key || '');
    const eligible = trackablePeople()
      .filter((person) => String(person.rcmProgress?.[classKey] || '').startsWith('en_curso:'))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
    if (!eligible.length) {
      graduarMembers.innerHTML = '<p class="empty-state">Ningun miembro tiene esta clase en curso.</p>';
      return;
    }
    graduarMembers.innerHTML = eligible
      .map((person) => {
        const startDate = String(person.rcmProgress?.[classKey] || '').slice(9);
        return `<label class="convocar-member-row"><input type="checkbox" value="${String(person.id)}" checked><span>${person.name || ''}</span><span class="member-admin-caption">${formatRole(person.role)}${startDate ? ` · Inicio ${startDate}` : ''}</span></label>`;
      })
      .join('');
  };

  const refreshGraduarNext = () => {
    if (!graduarClass || !graduarNextWrap || !graduarNext || !graduarNextLabel) return;
    const nextMilestone = getNextClassMilestone(graduarClass.value);
    if (nextMilestone) {
      graduarNextWrap.style.display = '';
      graduarNextLabel.textContent = `Inscribir ademas a la siguiente clase (${nextMilestone.label})`;
      graduarNext.disabled = false;
      return;
    }
    graduarNextWrap.style.display = 'none';
    graduarNext.checked = false;
  };

  searchInput?.addEventListener('input', (event) => {
    const nextValue = String(event.target?.value || '').trim().toLowerCase();
    const nextScrollY = window.scrollY;
    state.view.activePeopleSearch = nextValue;
    state.view.peopleTablePage = 1;
    state.view.mobilePeoplePage = 1;
    actions.rerender();
    restoreInputFocus('#catalogos-people-search', nextValue, nextScrollY);
  });

  filterSelect?.addEventListener('change', (event) => {
    state.view.activePeopleFilter = String(event.target?.value || 'all');
    state.view.peopleTablePage = 1;
    state.view.mobilePeoplePage = 1;
    actions.rerender();
  });

  pageSizeSelect?.addEventListener('change', (event) => {
    state.view.peopleTablePageSize = Math.max(10, Number(event.target?.value || 10));
    state.view.peopleTablePage = 1;
    actions.rerender();
  });

  filterTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.view.activePeopleFilter = String(button.dataset.roleFilter || 'all');
      state.view.peopleTablePage = 1;
      state.view.mobilePeoplePage = 1;
      actions.rerender();
    });
  });

  root.querySelector('[data-action="people-prev-page"]')?.addEventListener('click', () => {
    state.view.peopleTablePage = Math.max(1, Number(state.view.peopleTablePage || 1) - 1);
    actions.rerender();
  });

  root.querySelector('[data-action="people-next-page"]')?.addEventListener('click', () => {
    state.view.peopleTablePage = Math.max(1, Number(state.view.peopleTablePage || 1) + 1);
    actions.rerender();
  });

  root.querySelector('[data-action="people-mobile-prev-page"]')?.addEventListener('click', () => {
    state.view.mobilePeoplePage = Math.max(1, Number(state.view.mobilePeoplePage || 1) - 1);
    actions.rerender();
  });

  root.querySelector('[data-action="people-mobile-next-page"]')?.addEventListener('click', () => {
    state.view.mobilePeoplePage = Math.max(1, Number(state.view.mobilePeoplePage || 1) + 1);
    actions.rerender();
  });

  root.querySelectorAll('[data-action="people-mobile-letter-page"]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetPage = Math.max(1, Number(button.dataset.page || 1));
      state.view.mobilePeoplePage = targetPage;
      actions.rerender();
    });
  });

  openRcmButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const person = (state.catalogs.people || []).find((item) => String(item.id || '') === String(button.dataset.id || '')) || null;
      if (!person || !(rcmDialog instanceof HTMLDialogElement)) return;
      activeRcmPersonId = String(person.id || '');
      if (rcmTitle) rcmTitle.textContent = String(person.name || 'Persona');
      if (rcmBody) rcmBody.innerHTML = renderRcmDialogBody(person);
      rcmDialog.showModal();
    });
  });

  rcmBody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button.rcm-milestone-toggle');
    if (!(button instanceof HTMLButtonElement) || typeof actions.updatePersonRcm !== 'function') return;
    const personId = String(button.dataset.rcmPersonId || '').trim();
    const milestoneKey = String(button.dataset.rcmKey || '').trim();
    if (!personId || !milestoneKey) return;
    const person = (state.catalogs.people || []).find((item) => String(item.id || '') === personId) || null;
    const milestone = RCM_MILESTONES.find((item) => item.key === milestoneKey) || null;
    if (!person || !milestone) return;
    const currentValue = person.rcmProgress?.[milestoneKey] ?? null;
    const today = new Date().toISOString().slice(0, 10);
    let nextValue = null;
    if (milestone.type === 'clase') {
      if (!currentValue) nextValue = `en_curso:${today}`;
      else if (String(currentValue).startsWith('en_curso:')) nextValue = today;
    } else if (!currentValue) {
      nextValue = today;
    }
    await actions.updatePersonRcm(personId, { [milestoneKey]: nextValue });
    rerenderActiveRcmPerson();
  });

  rcmBody?.addEventListener('change', async (event) => {
    const input = event.target.closest('input.rcm-date-input');
    if (!(input instanceof HTMLInputElement) || typeof actions.updatePersonRcm !== 'function') return;
    const personId = String(input.dataset.rcmPersonId || '').trim();
    const milestoneKey = String(input.dataset.rcmKey || '').trim();
    const dateValue = String(input.value || '').trim();
    if (!personId || !milestoneKey || !dateValue) return;
    const nextValue = input.dataset.rcmState === 'en_curso' ? `en_curso:${dateValue}` : dateValue;
    await actions.updatePersonRcm(personId, { [milestoneKey]: nextValue });
    rerenderActiveRcmPerson();
  });

  rcmClose?.addEventListener('click', () => {
    activeRcmPersonId = '';
    closeDialog(rcmDialog);
  });
  rcmDone?.addEventListener('click', () => {
    activeRcmPersonId = '';
    closeDialog(rcmDialog);
  });
  rcmDialog?.addEventListener('click', (event) => {
    if (event.target === rcmDialog) {
      activeRcmPersonId = '';
      closeDialog(rcmDialog);
    }
  });

  convocarOpen?.addEventListener('click', () => {
    populateConvocarMembers();
    if (convocarDialog instanceof HTMLDialogElement) {
      convocarDialog.showModal();
    }
  });
  convocarClass?.addEventListener('change', populateConvocarMembers);
  convocarClose?.addEventListener('click', () => closeDialog(convocarDialog));
  convocarCancel?.addEventListener('click', () => closeDialog(convocarDialog));
  convocarDialog?.addEventListener('click', (event) => {
    if (event.target === convocarDialog) closeDialog(convocarDialog);
  });
  convocarConfirm?.addEventListener('click', async () => {
    if (!convocarMembers || !convocarClass || typeof actions.updatePersonRcm !== 'function') return;
    const classKey = String(convocarClass.value || '');
    const today = new Date().toISOString().slice(0, 10);
    const selected = Array.from(convocarMembers.querySelectorAll('input[type="checkbox"]:checked'));
    if (!selected.length) return;
    await Promise.all(selected.map((input) => actions.updatePersonRcm(String(input.value), { [classKey]: `en_curso:${today}` })));
    closeDialog(convocarDialog);
    if (typeof actions.refreshCatalogs === 'function') {
      await actions.refreshCatalogs();
    }
  });

  graduarOpen?.addEventListener('click', () => {
    populateGraduarMembers();
    refreshGraduarNext();
    if (graduarDialog instanceof HTMLDialogElement) {
      graduarDialog.showModal();
    }
  });
  graduarClass?.addEventListener('change', () => {
    populateGraduarMembers();
    refreshGraduarNext();
  });
  graduarClose?.addEventListener('click', () => closeDialog(graduarDialog));
  graduarCancel?.addEventListener('click', () => closeDialog(graduarDialog));
  graduarDialog?.addEventListener('click', (event) => {
    if (event.target === graduarDialog) closeDialog(graduarDialog);
  });
  graduarConfirm?.addEventListener('click', async () => {
    if (!graduarMembers || !graduarClass || typeof actions.updatePersonRcm !== 'function') return;
    const classKey = String(graduarClass.value || '');
    const nextMilestone = getNextClassMilestone(classKey);
    const shouldEnrollNext = Boolean(nextMilestone && graduarNext?.checked);
    const today = new Date().toISOString().slice(0, 10);
    const selected = Array.from(graduarMembers.querySelectorAll('input[type="checkbox"]:checked'));
    if (!selected.length) return;
    await Promise.all(selected.map((input) => {
      const payload = { [classKey]: today };
      if (shouldEnrollNext && nextMilestone) {
        payload[nextMilestone.key] = `en_curso:${today}`;
      }
      return actions.updatePersonRcm(String(input.value), payload);
    }));
    closeDialog(graduarDialog);
    if (typeof actions.refreshCatalogs === 'function') {
      await actions.refreshCatalogs();
    }
  });
}