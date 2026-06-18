import { getCellKids, getCellMembers, getVisibleCells } from '../models/catalogs-state.js';
import { renderButtonIcon } from './button-icons.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCellLeaderName(catalogs, cell) {
  const leader = (catalogs?.people || []).find((person) => String(person.id) === String(cell.leaderPersonId || ''));
  return leader?.name || 'Sin líder';
}

function getCellMembersText(cell) {
  const memberCount = getCellMembers(cell).length;
  const kidCount = getCellKids(cell).length;
  return `${String(memberCount)} miembro${memberCount !== 1 ? 's' : ''}${kidCount ? ` · ${String(kidCount)} niño${kidCount !== 1 ? 's' : ''}` : ''}`;
}

function renderCellsRows(catalogs, cells) {
  if (!cells.length) {
    return '<tr><td colspan="5" class="empty-state">No hay celulas para esta busqueda.</td></tr>';
  }

  return cells.map((cell) => {
    return `
      <tr>
        <td><strong>Célula ${escapeHtml(cell.cellNumber || '')}</strong></td>
        <td><span class="member-admin-caption">${escapeHtml(cell.networkName || '-')} · Sector ${escapeHtml(cell.sector || '-')}</span></td>
        <td>${escapeHtml(getCellLeaderName(catalogs, cell))}</td>
        <td><span class="member-admin-caption">${escapeHtml(getCellMembersText(cell))}</span></td>
        <td>
          <div class="pc-actions">
            <button type="button" class="fn-btn fn-btn--small" data-action="edit-cell" data-id="${escapeHtml(String(cell.id))}">${renderButtonIcon('edit', 12)} Editar</button>
            <button type="button" class="fn-btn fn-btn--small danger" data-action="delete-cell" data-id="${escapeHtml(String(cell.id))}">${renderButtonIcon('delete', 12)} Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCellsCards(catalogs, cells) {
  if (!cells.length) {
    return '<p class="pc-empty">No hay células para esta búsqueda.</p>';
  }

  return cells.map((cell) => {
    const leaderName = getCellLeaderName(catalogs, cell);
    return `
      <details class="pc-card">
        <summary class="pc-sum">
          <span class="pc-name">Célula ${escapeHtml(cell.cellNumber || '')}</span>
          <span class="pc-caption">${escapeHtml(leaderName)}</span>
        </summary>
        <div class="pc-body">
          <div class="pc-row">${escapeHtml(cell.networkName || '-')} · Sector ${escapeHtml(cell.sector || '-')}</div>
          <div class="pc-row">${escapeHtml(getCellMembersText(cell))}</div>
          <div class="pc-actions">
            <button type="button" class="pc-icon-btn" data-action="edit-cell" data-id="${escapeHtml(String(cell.id))}" title="Editar Célula ${escapeHtml(String(cell.cellNumber || ''))}">${renderButtonIcon('edit', 14)}</button>
            <button type="button" class="pc-icon-btn danger" data-action="delete-cell" data-id="${escapeHtml(String(cell.id))}" title="Eliminar Célula ${escapeHtml(String(cell.cellNumber || ''))}">${renderButtonIcon('delete', 14)}</button>
          </div>
        </div>
      </details>
    `;
  }).join('');
}

function renderMobileMoreButton(totalCount, visibleCount) {
  const remaining = Math.max(0, totalCount - visibleCount);
  if (!remaining) return '';
  const nextBatch = Math.min(8, remaining);
  return `
    <div class="catalog-mobile-more-wrap">
      <button type="button" class="btn-ghost catalog-mobile-more" data-action="show-more-cells">Ver ${nextBatch} más</button>
    </div>
  `;
}

export function renderCellsList(state) {
  const visibleCells = getVisibleCells(state.catalogs, state.view);
  const mobileVisibleCount = Math.max(8, Number(state.view?.mobileCellsVisibleCount || 8));
  const mobileCells = visibleCells.slice(0, mobileVisibleCount);
  return `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h2>Células</h2>
      </div>
    </div>
    <div class="admin-catalog-grid admin-catalog-grid-people">
      <section class="catalog-card catalog-card-list catalog-card-full">
        <div class="catalog-card-head">
          <div>
            <p class="eyebrow">Listado</p>
            <h3>Estado del catálogo</h3>
          </div>
          <div class="catalog-head-actions">
            <button id="catalogos-renumber-cells" type="button" class="btn-secondary">${renderButtonIcon('renumber')} <span>Reorganizar</span></button>
            <button id="catalogos-open-cells-form" type="button" class="btn-primary">${renderButtonIcon('cellPlus')} <span>Nueva célula</span></button>
          </div>
        </div>
        <div class="catalog-list-controls">
          <label class="search-field">
            <span>Buscar célula</span>
            <input
              id="catalogos-cell-search"
              type="search"
              placeholder="Número, red, sector…"
              value="${escapeHtml(state.view.activeCellSearch)}"
            >
          </label>
        </div>
        <div class="catalog-table-scroll">
          <table class="catalog-table">
          <thead>
            <tr>
              <th>Célula</th>
              <th>Red · Sector</th>
              <th>Líder</th>
              <th>Miembros</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="catalogos-cells-table-body">${renderCellsRows(state.catalogs, visibleCells)}</tbody>
        </table>
        </div>
        <div id="catalogos-cells-card-grid" class="catalog-card-grid">${renderCellsCards(state.catalogs, mobileCells)}</div>
        ${renderMobileMoreButton(visibleCells.length, mobileVisibleCount)}
      </section>
    </div>
  `;
}