import {
  getAssignableAdults,
  getAvailablePeopleForCell,
  getCellById,
  getCellMemberRole,
  getCellRoster,
  getCellFormData,
  normalizeCellMemberAttendanceDefaults,
  normalizeCellMemberAttendanceMode,
  getSectorOptions,
} from '../models/catalogs-state.js';
import { renderButtonIcon } from './button-icons.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPersonOptions(people, selectedId) {
  return people.map((person) => `
    <option value="${escapeHtml(String(person.id))}"${String(person.id) === String(selectedId || '') ? ' selected' : ''}>${escapeHtml(person.name)}</option>
  `).join('');
}

function renderAttendanceModeOptions(selectedValue) {
  const selected = normalizeCellMemberAttendanceMode(selectedValue);
  return [
    ['normal', 'Asistencia normal'],
    ['justified_default', 'Justificada por defecto'],
  ].map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
}

function renderRoleButtons(cell, person) {
  if (person.role === 'kid') {
    return '<span class="fn-tag fn-tag--kid">Niño</span>';
  }
  const currentRole = getCellMemberRole(cell, person.id);
  return [
    ['leader', 'Líder'],
    ['assistant', 'Asistente'],
    ['host', 'Anfitrión'],
  ].map(([role, label]) => {
    const active = currentRole === role;
    return `<button type="button" class="fn-tag ${active ? `fn-tag--${role}` : 'fn-tag--off'}" data-action="set-cell-role" data-person-id="${escapeHtml(String(person.id))}" data-role="${role}">${label}</button>`;
  }).join(' ');
}

export function renderCellsForm(state) {
  const form = getCellFormData(state.catalogs, state.view);
  const cell = getCellById(state.catalogs, state.view.editingCellId);
  const sectors = getSectorOptions(state.catalogs);
  const adults = getAssignableAdults(state.catalogs);
  const availablePeople = getAvailablePeopleForCell(state.catalogs, state.view);
  const roster = getCellRoster(state.catalogs, state.view);
  const editing = Boolean(state.view.editingCellId);
  const dialogTitle = editing
    ? `Editar: Célula ${escapeHtml(String(cell?.cellNumber || ''))}`
    : 'Nueva célula';

  return `
    <dialog id="catalogos-cells-dialog" class="app-dialog app-dialog-wide">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Catálogo</p>
          <h3>${dialogTitle}</h3>
        </div>
        <button id="catalogos-cells-dialog-close" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body">
      <form id="catalogos-cells-form" class="stack-grid compact-stack">
        <input type="hidden" name="cellId" value="${escapeHtml(String(state.view.editingCellId || ''))}">
        <div class="split-grid split-grid-4">
          <label>
            <span>Célula #</span>
            <input name="cellNumber" class="fn-input" value="${escapeHtml(form.cellNumber)}" required placeholder="Ej. 12">
          </label>
          <label>
            <span>Red</span>
            <input name="networkName" class="fn-input" value="${escapeHtml(form.networkName)}" placeholder="Ej. Rosarito">
          </label>
          <label>
            <span>Sector</span>
            <input name="sector" list="catalogos-sector-options" class="fn-input" value="${escapeHtml(form.sector)}" required>
            <datalist id="catalogos-sector-options">
              ${sectors.map((sector) => `<option value="${escapeHtml(sector)}"></option>`).join('')}
            </datalist>
          </label>
          <label>
            <span>Zona</span>
            <input name="zoneName" class="fn-input" value="${escapeHtml(form.zoneName)}">
          </label>
        </div>
        <div class="split-grid split-grid-2">
          <label>
            <span>Distrito</span>
            <input name="districtName" class="fn-input" value="${escapeHtml(form.districtName)}">
          </label>
          <label style="flex:2">
            <span>Domicilio</span>
            <input name="address" class="fn-input" value="${escapeHtml(form.address)}" placeholder="Calle, número, colonia…">
          </label>
        </div>
        <div class="split-grid split-grid-3">
          <label>
            <span>Líder</span>
            <select name="leaderPersonId" class="fn-select">
              <option value="">Sin líder</option>
              ${renderPersonOptions(adults, form.leaderPersonId)}
            </select>
          </label>
          <label>
            <span>Asistente</span>
            <select name="assistantPersonId" class="fn-select">
              <option value="">Sin asistente</option>
              ${renderPersonOptions(adults, form.assistantPersonId)}
            </select>
          </label>
          <label>
            <span>Anfitrión</span>
            <select name="hostPersonId" class="fn-select">
              <option value="">Sin anfitrión</option>
              ${renderPersonOptions(adults, form.hostPersonId)}
            </select>
          </label>
        </div>
      </form>
      <div class="dialog-section-divider"><span>Miembros y roles</span></div>
      <p class="member-admin-caption" style="margin:0 0 8px">${editing ? 'Asigna roles y administra asistencia por defecto para esta célula.' : 'Guarda la célula primero para administrar sus miembros.'}</p>
      ${editing ? `
        <form id="catalogos-cell-member-form" class="member-form">
          <select name="personId" class="fn-select">
            <option value="">Agregar miembro...</option>
            ${availablePeople.map((person) => `<option value="${escapeHtml(String(person.id))}">${escapeHtml(person.name)}</option>`).join('')}
          </select>
          <button type="submit" class="btn-primary">${renderButtonIcon('add')} <span>Agregar</span></button>
        </form>
        <div class="cells-dialog-table-scroll">
          ${roster.length ? `
            <div class="cells-members-grid" role="table" aria-label="Miembros y roles de la célula">
              <div class="cells-members-grid-head" role="row">
                <div class="cells-members-grid-cell" role="columnheader">Nombre</div>
                <div class="cells-members-grid-cell" role="columnheader">Rol en la célula</div>
                <div class="cells-members-grid-cell" role="columnheader">Asistencia semanal</div>
                <div class="cells-members-grid-cell" role="columnheader"></div>
              </div>
              <div class="cells-members-grid-body">
                ${roster.map((person) => {
                  const attendanceMode = normalizeCellMemberAttendanceMode(person.attendanceMode);
                  const attendanceDefaults = normalizeCellMemberAttendanceDefaults(person.attendanceDefaults, attendanceMode);
                  return `
                    <article class="cells-members-grid-row" role="row">
                      <div class="cells-members-grid-cell cells-members-grid-cell--name" role="cell" data-label="Nombre"><strong>${escapeHtml(person.name || '')}</strong></div>
                      <div class="cells-members-grid-cell cells-members-grid-cell--roles" role="cell" data-label="Rol en la célula">${renderRoleButtons(cell, person)}</div>
                      <div class="cells-members-grid-cell cells-members-grid-cell--mode" role="cell" data-label="Asistencia semanal">
                        <div class="cell-member-mode-wrap">
                          <select class="cell-member-mode-select" data-action="set-membership-mode" data-person-id="${escapeHtml(String(person.id))}" aria-label="Asistencia semanal de ${escapeHtml(person.name || '')}">
                            ${renderAttendanceModeOptions(attendanceMode)}
                          </select>
                          <div class="cell-member-defaults"${attendanceMode === 'justified_default' ? '' : ' hidden'}>
                            <span>Justificar en:</span>
                            <label><input type="checkbox" data-action="set-membership-default" data-person-id="${escapeHtml(String(person.id))}" data-stage="planning"${attendanceDefaults.planning ? ' checked' : ''}> Planeación</label>
                            <label><input type="checkbox" data-action="set-membership-default" data-person-id="${escapeHtml(String(person.id))}" data-stage="reach"${attendanceDefaults.reach ? ' checked' : ''}> Alcance</label>
                            <label><input type="checkbox" data-action="set-membership-default" data-person-id="${escapeHtml(String(person.id))}" data-stage="sunday"${attendanceDefaults.sunday ? ' checked' : ''}> Culto</label>
                          </div>
                        </div>
                      </div>
                      <div class="cells-members-grid-cell cells-members-grid-cell--actions" role="cell" data-label="Acciones"><button type="button" class="btn-remove-member" data-action="remove-member" data-person-id="${escapeHtml(String(person.id))}" aria-label="Quitar ${escapeHtml(person.name || '')} de la célula" title="Quitar de la célula">✕</button></div>
                    </article>
                  `;
                }).join('')}
              </div>
            </div>
          ` : '<p class="empty-state">Sin miembros asignados todavía.</p>'}
        </div>
      ` : '<p class="member-admin-caption">Guarda la célula para empezar a asignar miembros.</p>'}
      </div>
      <div class="dialog-footer">
        <button type="button" id="catalogos-cells-form-reset" class="btn-secondary">${renderButtonIcon('cancel')} <span>Cancelar</span></button>
        <button type="submit" form="catalogos-cells-form" class="btn-primary">${renderButtonIcon('save')} <span>${editing ? 'Guardar célula' : 'Crear célula'}</span></button>
      </div>
    </dialog>
  `;
}