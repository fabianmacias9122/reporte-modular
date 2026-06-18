import { formatRole, getDerivedFunctions, isSystemAccountActor } from '../models/catalogs-state.js';
import { renderButtonIcon } from './button-icons.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPermissionTags(person) {
  const tags = [];
  if (person.isSystemAccount) tags.push('<span class="fn-tag fn-tag--leader">Cuenta sistema</span>');
  if (person.isAdmin) tags.push('<span class="fn-tag fn-tag--leader">Administrador</span>');
  if (person.role === 'pastor') tags.push('<span class="fn-tag fn-tag--pastor">Pastor</span>');
  else if (getDerivedFunctions(person).includes('coordinator')) tags.push('<span class="fn-tag fn-tag--assistant">Coord.</span>');
  if (person.supervisorSector) tags.push(`<span class="fn-tag">Sup. ${escapeHtml(person.supervisorSector)}</span>`);
  return tags.join(' ') || '<span class="muted">-</span>';
}

export function renderSystemAccountsList(state) {
  const people = state.catalogs.systemPeople || [];
  const showActions = isSystemAccountActor(state.catalogs, state.view);

  return `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h2>Cuentas de sistema</h2>
      </div>
      <span class="panel-tag">Accesos internos</span>
    </div>
    <p class="admin-section-copy">Estas cuentas no aparecen en los listados normales, RCM ni reportes.</p>
    <div class="admin-catalog-grid admin-catalog-grid-people">
      <section class="catalog-card catalog-card-list catalog-card-full">
        <div class="catalog-card-head">
          <div>
            <p class="eyebrow">Listado</p>
            <h3>Accesos del sistema</h3>
          </div>
        </div>
        <div class="catalog-table-scroll">
          <table class="catalog-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Permisos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${people.length ? people.map((person) => `
                <tr>
                  <td><strong>${escapeHtml(person.name || '')}</strong></td>
                  <td>${escapeHtml(person.username || '-')}</td>
                  <td>${escapeHtml(formatRole(person.role) || person.role || '-')}</td>
                  <td>${renderPermissionTags(person)}</td>
                  <td>
                    <div class="pc-actions">
                      <button type="button" class="fn-btn fn-btn--small" data-action="edit-person" data-id="${escapeHtml(String(person.id))}">${renderButtonIcon('edit', 12)} Editar</button>
                      ${showActions ? `<button type="button" class="fn-btn fn-btn--small" data-action="reset-password" data-id="${escapeHtml(String(person.id))}">${renderButtonIcon('lock', 12)} Resetear pwd</button>` : ''}
                      ${showActions ? `<button type="button" class="fn-btn fn-btn--small danger" data-action="toggle-system-account" data-id="${escapeHtml(String(person.id))}">${renderButtonIcon('undoPerson', 12)} Volver a miembro real</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="5" class="empty-state">Sin cuentas de sistema.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}