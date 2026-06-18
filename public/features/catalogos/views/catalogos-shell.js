import { renderAdminSummary } from './admin-summary.js';
import { renderPeopleList } from './people-list.js';
import { renderCellsList } from './cells-list.js';
import { renderPeopleForm } from './people-form.js';
import { renderCellsForm } from './cells-form.js';
import { renderSystemAccountsList } from './system-accounts-list.js';
import { isSystemAccountActor } from '../models/catalogs-state.js';

export function renderCatalogosShell(state) {
  const activeSection = String(state.view?.activeAdminSection || 'admin-overview-section');
  const sectionButtonClass = (sectionId) => `admin-section-button${activeSection === sectionId ? ' is-active' : ''}`;
  const showSystemAccounts = isSystemAccountActor(state.catalogs, state.view);

  return `
    <aside id="admin-view" class="workspace-side stack-grid admin-shell">
      <nav id="admin-section-nav" class="admin-section-nav admin-overview-span" aria-label="Navegación de catálogos">
        <button type="button" class="${sectionButtonClass('admin-overview-section')}" data-admin-target="admin-overview-section">Resumen</button>
        <button type="button" class="${sectionButtonClass('admin-people-section')}" data-admin-target="admin-people-section">Miembros</button>
        <button type="button" class="${sectionButtonClass('admin-cells-section')}" data-admin-target="admin-cells-section">Células</button>
        ${showSystemAccounts ? `<button type="button" class="${sectionButtonClass('admin-system-section')}" data-admin-target="admin-system-section">Sistema</button>` : ''}
      </nav>

      <section id="admin-overview-section" class="panel panel-soft admin-overview admin-overview-span admin-section-anchor">
        ${renderAdminSummary(state)}
      </section>

      <section id="admin-people-section" class="panel panel-strong admin-section-anchor">
        ${renderPeopleList(state)}
      </section>

      <section id="admin-cells-section" class="panel panel-strong admin-section-anchor">
        ${renderCellsList(state)}
      </section>

      ${showSystemAccounts ? `
        <section id="admin-system-section" class="panel panel-strong admin-section-anchor">
          ${renderSystemAccountsList(state)}
        </section>
      ` : ''}
    </aside>

    ${renderPeopleForm(state)}
    ${renderCellsForm(state)}
  `;
}