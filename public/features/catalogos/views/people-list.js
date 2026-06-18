import {
  formatRole,
  getDerivedFunctions,
  getPersonAssignmentLabel,
  getVisiblePeople,
  isSystemAccountActor,
} from '../models/catalogs-state.js';
import { renderButtonIcon } from './button-icons.js';
import {
  canPersonLogin,
  CLASS_MILESTONES,
  getPersonRcmSummary,
  renderRcmProgressBadges,
} from './people-rcm.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPersonInitial(person) {
  const firstChar = String(person?.name || '').trim().charAt(0);
  if (!firstChar) return '#';
  const normalized = firstChar.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /[A-Z]/.test(normalized) ? normalized : '#';
}

function renderFunctionTags(person) {
  return getDerivedFunctions(person)
    .map((role) => `<span class="fn-tag fn-tag--${escapeHtml(role)}">${escapeHtml(formatRole(role))}</span>`)
    .join(' ');
}

function renderRcmInline(person) {
  const summary = getPersonRcmSummary(person);
  if (!summary.isTrackable) {
    return '<span class="member-admin-caption">-</span>';
  }
  return `
    <button type="button" class="rcm-inline-btn" data-action="open-rcm" data-id="${escapeHtml(String(person.id))}">
      <span class="rcm-inline-bar"><span class="rcm-inline-fill" style="width:${summary.pct}%"></span></span>
      <span class="rcm-inline-label">${summary.activeCount}/${summary.totalCount}</span>
    </button>
  `;
}

function renderPeopleRows(people, catalogs, showResetPassword) {
  if (!people.length) {
    return '<tr><td colspan="5" class="empty-state">No hay personas para este filtro.</td></tr>';
  }

  return people.map((person) => `
    <tr>
      <td data-label="Nombre">
        <strong>${escapeHtml(person.name || '')}</strong><br>
        <span class="member-admin-caption">${escapeHtml(person.phone || person.email || 'Sin contacto')}</span>
      </td>
      <td data-label="Función">${renderFunctionTags(person)}</td>
      <td data-label="Asignación"><span class="catalog-assignment-chip${person.assignedCellNumber ? '' : ' is-unassigned'}">${escapeHtml(getPersonAssignmentLabel(person))}</span></td>
      <td class="col-rcm" data-label="Progreso RCM">${renderRcmInline(person)}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button type="button" class="fn-btn fn-btn--small" data-action="edit-person" data-id="${escapeHtml(String(person.id))}" data-tooltip="Editar datos de ${escapeHtml(person.name || '')}">${renderButtonIcon('edit', 12)} Editar</button>
          ${showResetPassword(person) ? `<button type="button" class="fn-btn fn-btn--small" data-action="reset-password" data-id="${escapeHtml(String(person.id))}" data-tooltip="Resetear contraseña de ${escapeHtml(person.name || '')}">${renderButtonIcon('lock', 12)} Resetear pwd</button>` : ''}
          <button type="button" class="fn-btn fn-btn--small danger" data-action="delete-person" data-id="${escapeHtml(String(person.id))}" data-tooltip="Eliminar permanentemente a ${escapeHtml(person.name || '')}">${renderButtonIcon('delete', 12)} Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPeopleCards(people, catalogs, showResetPassword) {
  if (!people.length) {
    return '<p class="pc-empty">No hay personas para este filtro.</p>';
  }

  return people.map((person) => `
    <details class="pc-card">
      <summary class="pc-sum">
        <div class="pc-row1">
          <span class="pc-name">${escapeHtml(person.name || '')}</span>
          <span class="catalog-assignment-chip${person.assignedCellNumber ? '' : ' is-unassigned'}">${escapeHtml(getPersonAssignmentLabel(person))}</span>
        </div>
        <div class="pc-fns">${renderFunctionTags(person)}</div>
        ${getPersonRcmSummary(person).isTrackable ? `<div class="pc-rcm-row"><span class="rcm-inline-bar pc-rcm-bar"><span class="rcm-inline-fill" style="width:${getPersonRcmSummary(person).pct}%"></span></span><span class="pc-rcm-label">${getPersonRcmSummary(person).activeCount}/${getPersonRcmSummary(person).totalCount}</span></div>` : ''}
      </summary>
      <div class="pc-body">
        ${getPersonRcmSummary(person).isTrackable ? `<button type="button" class="rcm-action-btn" data-action="open-rcm" data-id="${escapeHtml(String(person.id))}"><span class="rcm-action-header">${renderButtonIcon('pulse', 14)}<span class="rcm-action-label">Proceso R.C.M</span><span class="rcm-action-badge">${getPersonRcmSummary(person).activeCount}<span class="rcm-action-total">/${getPersonRcmSummary(person).totalCount}</span></span></span><span class="rcm-action-track"><span class="rcm-action-fill" style="width:${getPersonRcmSummary(person).pct}%"></span></span></button>` : ''}
        <span class="member-admin-caption">${escapeHtml(person.phone || person.email || 'Sin contacto')}</span>
        ${renderRcmProgressBadges(person.rcmProgress)}
        <div class="pc-actions">
          <button type="button" class="pc-icon-btn" data-action="edit-person" data-id="${escapeHtml(String(person.id))}" title="Editar">${renderButtonIcon('edit', 15)}</button>
          ${showResetPassword(person) ? `<button type="button" class="pc-icon-btn" data-action="reset-password" data-id="${escapeHtml(String(person.id))}" title="Resetear pwd">${renderButtonIcon('lock', 15)}</button>` : ''}
          <button type="button" class="pc-icon-btn danger" data-action="delete-person" data-id="${escapeHtml(String(person.id))}" title="Eliminar">${renderButtonIcon('delete', 15)}</button>
        </div>
      </div>
    </details>
  `).join('');
}

function renderMobilePeoplePager(totalCount, pageSize, page) {
  if (!totalCount) return '';
  const normalizedPageSize = Math.max(8, Number(pageSize || 8));
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const start = ((currentPage - 1) * normalizedPageSize) + 1;
  const end = Math.min(totalCount, currentPage * normalizedPageSize);

  return `
    <div class="catalog-mobile-pager">
      <button type="button" class="btn-ghost catalog-mobile-more" data-action="people-mobile-prev-page"${currentPage <= 1 ? ' disabled' : ''}>Anterior</button>
      <span class="member-admin-caption">${start}-${end} de ${totalCount}</span>
      <button type="button" class="btn-ghost catalog-mobile-more" data-action="people-mobile-next-page"${currentPage >= totalPages ? ' disabled' : ''}>Siguiente</button>
    </div>
  `;
}

function renderMobilePeopleAlphaRail(people, page, pageSize) {
  if (!people.length) return '';
  const letters = [];
  const seenLetters = new Set();
  people.forEach((person, index) => {
    const letter = getPersonInitial(person);
    if (seenLetters.has(letter)) return;
    seenLetters.add(letter);
    letters.push({ letter, page: Math.floor(index / pageSize) + 1 });
  });

  if (letters.length <= 1) return '';
  const activeLetter = getPersonInitial(people[(Math.max(1, Number(page || 1)) - 1) * pageSize] || null);
  return `
    <nav class="catalog-mobile-alpha-rail" aria-label="Indice alfabetico de miembros">
      ${letters.map(({ letter, page: targetPage }) => `
        <button
          type="button"
          class="catalog-mobile-alpha-rail-link${letter === activeLetter ? ' is-active' : ''}"
          data-action="people-mobile-letter-page"
          data-letter="${escapeHtml(letter)}"
          data-page="${targetPage}"
          aria-label="Ir a ${escapeHtml(letter)}"
        >${escapeHtml(letter)}</button>
      `).join('')}
    </nav>
  `;
}

function renderPeopleTablePager(totalCount, pageSize, page) {
  if (!totalCount) return '';
  const normalizedPageSize = Math.max(10, Number(pageSize || 10));
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const start = ((currentPage - 1) * normalizedPageSize) + 1;
  const end = Math.min(totalCount, currentPage * normalizedPageSize);

  return `
    <div class="catalog-table-pager">
      <label class="catalog-table-page-size">
        <span>Ver</span>
        <select id="catalogos-people-page-size">
          ${[10, 20, 30, 40, 50].map((size) => `<option value="${size}"${size === normalizedPageSize ? ' selected' : ''}>${size}</option>`).join('')}
        </select>
        <span>registros</span>
      </label>
      <span class="member-admin-caption">Mostrando ${start}-${end} de ${totalCount}</span>
      <div class="catalog-table-page-actions">
        <button type="button" class="btn-ghost" data-action="people-prev-page"${currentPage <= 1 ? ' disabled' : ''}>Anterior</button>
        <span class="member-admin-caption">Página ${currentPage} de ${totalPages}</span>
        <button type="button" class="btn-ghost" data-action="people-next-page"${currentPage >= totalPages ? ' disabled' : ''}>Siguiente</button>
      </div>
    </div>
  `;
}

function renderRcmDialog() {
  return `
    <dialog id="catalogos-rcm-dialog" class="app-dialog app-dialog-wide">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Progreso RCM</p>
          <h3 id="catalogos-rcm-title">Persona</h3>
        </div>
        <button id="catalogos-rcm-close" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div id="catalogos-rcm-body" class="dialog-body rcm-dialog-body"></div>
      <div class="dialog-footer">
        <button id="catalogos-rcm-done" type="button" class="btn btn-primary">${renderButtonIcon('save')} <span>Listo</span></button>
      </div>
    </dialog>
  `;
}

function renderClassDialog(kind) {
  const isConvocar = kind === 'convocar';
  const prefix = `catalogos-${kind}`;
  return `
    <dialog id="${prefix}-dialog" class="app-dialog">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">${isConvocar ? 'Convocatoria' : 'Graduacion'}</p>
          <h3>${isConvocar ? 'Registrar inicio de clase' : 'Marcar clase como completada'}</h3>
        </div>
        <button id="${prefix}-close" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body">
        <div class="field-row">
          <label for="${prefix}-class">Clase</label>
          <select id="${prefix}-class">${CLASS_MILESTONES.map((milestone) => `<option value="${escapeHtml(milestone.key)}">${escapeHtml(`${milestone.sectionLabel} · ${milestone.label}`)}</option>`).join('')}</select>
        </div>
        <div id="${prefix}-members" class="convocar-member-list"></div>
        ${isConvocar ? '' : `<div id="catalogos-graduar-next-wrap" class="field-row" style="display:none;"><label class="convocar-next-option"><input type="checkbox" id="catalogos-graduar-next" checked><span id="catalogos-graduar-next-label">Inscribir ademas a la siguiente clase</span></label></div>`}
      </div>
      <div class="dialog-footer">
        <button id="${prefix}-cancel" type="button" class="btn btn-ghost">Cancelar</button>
        <button id="${prefix}-confirm" type="button" class="btn btn-primary">${renderButtonIcon(isConvocar ? 'calendar' : 'graduate')} <span>${isConvocar ? 'Registrar convocatoria' : 'Registrar graduacion'}</span></button>
      </div>
    </dialog>
  `;
}

export function renderPeopleList(state) {
  const visiblePeople = getVisiblePeople(state.catalogs, state.view);
  const pageSize = Math.max(10, Number(state.view?.peopleTablePageSize || 10));
  const totalPages = Math.max(1, Math.ceil(visiblePeople.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.view?.peopleTablePage || 1)), totalPages);
  const tablePeople = visiblePeople.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const mobilePageSize = 8;
  const mobileTotalPages = Math.max(1, Math.ceil(visiblePeople.length / mobilePageSize));
  const mobilePage = Math.min(Math.max(1, Number(state.view?.mobilePeoplePage || 1)), mobileTotalPages);
  const mobilePeople = visiblePeople.slice((mobilePage - 1) * mobilePageSize, mobilePage * mobilePageSize);
  const mobileAlphaRail = renderMobilePeopleAlphaRail(visiblePeople, mobilePage, mobilePageSize);
  const actorIsSystemAccount = isSystemAccountActor(state.catalogs, state.view);
  const actorCanManageClasses = Boolean(state.view?.actorIsAdmin || actorIsSystemAccount);
  const showResetPassword = (person) => actorIsSystemAccount && canPersonLogin(person, state.catalogs.cells || []);
  const filterOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'coordinator', label: 'Coordinadores' },
    { value: 'supervisor', label: 'Supervisores' },
    { value: 'leader', label: 'Lideres' },
    { value: 'assistant', label: 'Asistentes' },
    { value: 'host', label: 'Anfitriones' },
    { value: 'member', label: 'Miembros' },
    { value: 'kid', label: 'Ninos' },
  ];

  return `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h2>Miembros</h2>
      </div>
      <span class="panel-tag">Líderes y miembros</span>
    </div>
    <p class="admin-section-copy">Consulta, agrega y edita personas desde la tabla. Usa los filtros para navegar rápido.</p>
    <div class="admin-catalog-grid admin-catalog-grid-people">
      <section class="catalog-card catalog-card-list catalog-card-full">
        <div class="catalog-card-head">
          <div>
            <p class="eyebrow">Listado</p>
            <h3>Estado del catálogo</h3>
          </div>
          <div class="catalog-head-actions">
            <button id="catalogos-open-people-form" type="button" class="btn btn-sm btn-primary" data-tooltip="Agregar una nueva persona al catálogo">${renderButtonIcon('personPlus')} <span>Nueva persona</span></button>
            ${actorCanManageClasses ? `<button id="catalogos-open-convocar" type="button" class="btn btn-sm btn-outline-brand" data-tooltip="Registrar convocatoria a clase RCM para miembros seleccionados">${renderButtonIcon('calendar')} <span>Convocar a clase</span></button>` : ''}
            ${actorCanManageClasses ? `<button id="catalogos-open-graduar" type="button" class="btn btn-sm btn-outline-brand" data-tooltip="Marcar como completada una clase RCM para miembros que ya la terminaron">${renderButtonIcon('graduate')} <span>Graduar clase</span></button>` : ''}
          </div>
        </div>
        <div class="catalog-list-controls">
          <div id="people-filter-tabs" class="filter-tabs" role="tablist" aria-label="Filtros de personas">
            ${filterOptions.map((option) => `<button type="button" class="filter-tab${option.value === state.view.activePeopleFilter ? ' is-active' : ''}" data-role-filter="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}
          </div>
          <select id="catalogos-people-filter" class="people-filter-select">
            ${filterOptions.map((option) => `
              <option value="${escapeHtml(option.value)}"${option.value === state.view.activePeopleFilter ? ' selected' : ''}>${escapeHtml(option.label)}</option>
            `).join('')}
          </select>
          <label class="search-field">
            <span>Buscar persona</span>
            <input
              id="catalogos-people-search"
              type="search"
              placeholder="Nombre, correo, teléfono o célula"
              value="${escapeHtml(state.view.activePeopleSearch)}"
            >
          </label>
        </div>
        ${renderPeopleTablePager(visiblePeople.length, pageSize, currentPage)}
        <div class="catalog-table-scroll">
          <table class="catalog-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Función</th>
              <th>Asignación</th>
              <th class="col-rcm">Progreso RCM</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="catalogos-people-table-body">${renderPeopleRows(tablePeople, state.catalogs, showResetPassword)}</tbody>
        </table>
        </div>
        <div class="catalog-mobile-people-shell">
          <div id="catalogos-people-card-grid" class="catalog-card-grid">${renderPeopleCards(mobilePeople, state.catalogs, showResetPassword)}</div>
          ${mobileAlphaRail}
        </div>
        ${renderMobilePeoplePager(visiblePeople.length, mobilePageSize, mobilePage)}
      </section>
    </div>
    ${renderRcmDialog()}
    ${actorCanManageClasses ? renderClassDialog('convocar') : ''}
    ${actorCanManageClasses ? renderClassDialog('graduar') : ''}
  `;
}