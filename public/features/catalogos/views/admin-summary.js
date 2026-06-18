import { getCatalogosAdminSummary } from '../models/catalogs-state.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSummaryPreviewCards(cards, previewCount) {
  const priorityLabels = ['Celulas', 'Miembros', 'Coordinadores'];
  const prioritizedCards = priorityLabels
    .map((label) => cards.find((card) => card.label === label))
    .filter(Boolean);

  const remainingCards = cards.filter((card) => !prioritizedCards.includes(card));
  const normalizedPreviewCount = Math.max(1, Number(previewCount || 1));
  return [...prioritizedCards, ...remainingCards].slice(0, normalizedPreviewCount);
}

export function renderAdminSummary(state) {
  const cards = getCatalogosAdminSummary(state.catalogs);
  const previewCount = Math.max(1, Number(state.view?.adminSummaryPreviewCount || 3));
  const previewCards = getSummaryPreviewCards(cards, previewCount);
  const showAllCards = Boolean(state.view?.showAllAdminSummaryCards);
  const visibleCards = showAllCards ? cards : previewCards;
  const hiddenCount = Math.max(0, cards.length - previewCards.length);
  return `
    <div class="panel-head admin-overview-head">
      <div>
        <p class="eyebrow">Panorama</p>
        <h2>Resumen operativo</h2>
      </div>
      <span class="panel-tag">Catálogos vivos</span>
    </div>
    <div id="admin-summary-cards" class="summary-grid">
        ${visibleCards.map((card) => `
          <article class="summary-card">
            <span class="summary-label">${escapeHtml(card.label)}</span>
            <strong class="summary-value">${escapeHtml(String(card.value))}</strong>
            <span class="summary-hint">${escapeHtml(card.hint)}</span>
          </article>
        `).join('')}
    </div>
    ${hiddenCount ? `
      <div class="admin-summary-mobile-actions">
        <button type="button" class="btn-ghost catalog-mobile-more" data-action="toggle-admin-summary-cards" aria-expanded="${showAllCards ? 'true' : 'false'}">${showAllCards ? 'Ver menos' : `Ver ${hiddenCount} más`}</button>
      </div>
    ` : ''}
  `;
}