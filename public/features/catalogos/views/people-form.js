import {
  getPeopleFormData,
  getSectorOptions,
  isSystemAccountActor,
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

export function renderPeopleForm(state) {
  const form = getPeopleFormData(state.catalogs, state.view);
  const sectors = getSectorOptions(state.catalogs);
  const editing = Boolean(state.view.editingPersonId);
  const isSystemAccount = isSystemAccountActor(state.catalogs, state.view);
  const guardianOptions = (state.catalogs.people || [])
    .filter((person) => String(person.id) !== String(state.view.editingPersonId || ''))
    .map((person) => `<option value="${escapeHtml(String(person.id))}"${String(person.id) === form.guardianPersonId ? ' selected' : ''}>${escapeHtml(person.name)}</option>`)
    .join('');
  const isKid = form.role === 'kid';
  const isPastor = form.role === 'pastor';
  const assignedCellOptions = (state.catalogs.cells || []).map((cell) => `<option value="${escapeHtml(String(cell.id))}"${String(cell.id) === form.assignedCellId ? ' selected' : ''}>Célula ${escapeHtml(String(cell.cellNumber))}${cell.networkName ? ` · ${escapeHtml(cell.networkName)}` : ''}</option>`).join('');

  return `
    <dialog id="catalogos-people-dialog" class="app-dialog">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Catálogo</p>
          <h3>${editing ? 'Editar persona' : 'Nueva persona'}</h3>
        </div>
        <button id="catalogos-people-dialog-close" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body">
      ${state.view.peopleFormMessage ? `<p class="cell-dialog-msg${state.view.peopleFormError ? ' cell-dialog-msg--error' : ' cell-dialog-msg--ok'}">${escapeHtml(state.view.peopleFormMessage)}</p>` : ''}
      <form id="catalogos-people-form" class="stack-grid compact-stack">
        <input type="hidden" name="personId" value="${escapeHtml(String(state.view.editingPersonId || ''))}">
        <label class="fn-field">
          <span>Nombre</span>
          <input name="name" class="fn-input" value="${escapeHtml(form.name)}" required>
        </label>
        <div class="split-grid">
          <label style="flex-direction:row;align-items:center;gap:10px;cursor:pointer">
            <input name="isKid" type="checkbox" style="width:18px;height:18px;accent-color:var(--brand);cursor:pointer"${isKid ? ' checked' : ''}>
            <span>Es menor de edad <small style="font-weight:400;opacity:.6">(niño/a)</small></span>
          </label>
          <label>
            <span>Teléfono</span>
            <input name="phone" class="fn-input" value="${escapeHtml(form.phone)}">
          </label>
        </div>
        <div class="split-grid guardian-grid"${isKid ? '' : ' hidden'}>
          <label>
            <span>Responsable en catálogo</span>
            <select name="guardianPersonId" class="fn-select">
              <option value="">Sin responsable</option>
              ${guardianOptions}
            </select>
          </label>
          <label>
            <span>Responsable de referencia</span>
            <input name="guardianName" class="fn-input" value="${escapeHtml(form.guardianName)}" placeholder="Ej. mamá de la visita">
          </label>
        </div>
        <label>
          <span>Correo</span>
          <input name="email" type="email" class="fn-input" value="${escapeHtml(form.email)}">
        </label>
        <div class="dialog-section-divider">
          <span>Célula</span>
        </div>
        <label>
          <span>Asignar a célula <small style="font-weight:400;opacity:.6">(mover retira de la anterior)</small></span>
          <select name="assignedCellId" class="fn-select">
            <option value="">— Sin célula —</option>
            ${assignedCellOptions}
          </select>
        </label>
        <div class="dialog-section-divider">
          <span>Función en la célula</span>
        </div>
        <div class="stack-grid compact-stack">
          <label>
            <span>Supervisa sector <small style="font-weight:400;opacity:.6">(dejar vacío si no aplica)</small></span>
            <select name="supervisorSector" class="fn-select">
              <option value="">— No es supervisor —</option>
              ${sectors.map((sector) => `<option value="${escapeHtml(sector)}"${sector === form.supervisorSector ? ' selected' : ''}>Sector ${escapeHtml(sector)}</option>`).join('')}
            </select>
          </label>
          <label class="people-access-toggle">
            <input name="isPastor" type="checkbox"${isPastor ? ' checked' : ''}>
            <span>Es pastor <small>(mismo acceso que coordinador)</small></span>
          </label>
          <label class="people-access-toggle">
            <input name="isCoordinator" type="checkbox"${form.isCoordinator ? ' checked' : ''}>
            <span>Es coordinador <small>(acceso total)</small></span>
          </label>
          <label${isSystemAccount ? '' : ' hidden'}>
            <span>Usuario para login <small style="font-weight:400;opacity:.6">(letras, números, '.', '_' o '-')</small></span>
            <input name="username" type="text" class="fn-input" value="${escapeHtml(form.username)}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ej. fabian.macias">
          </label>
          <label class="people-access-toggle"${isSystemAccount ? '' : ' hidden'}>
            <input name="isAdmin" type="checkbox"${form.isAdmin ? ' checked' : ''}>
            <span>Administrador <small>(puede administrar miembros y células)</small></span>
          </label>
        </div>
      </form>
      </div>
      <div class="dialog-footer">
        <button type="button" id="catalogos-people-form-reset" class="btn btn-ghost">${renderButtonIcon('cancel')} <span>Cancelar</span></button>
        <button type="submit" form="catalogos-people-form" class="btn btn-primary">${renderButtonIcon('save')} <span>${editing ? 'Guardar persona' : 'Crear persona'}</span></button>
      </div>
    </dialog>
  `;
}