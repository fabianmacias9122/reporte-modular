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

export function attachCellsListController(root, state, actions) {
  const searchInput = root.querySelector('#catalogos-cell-search');
  const renumberButton = root.querySelector('#catalogos-renumber-cells');

  searchInput?.addEventListener('input', (event) => {
    const nextValue = String(event.target?.value || '').trim().toLowerCase();
    const nextScrollY = window.scrollY;
    state.view.activeCellSearch = nextValue;
    state.view.mobileCellsVisibleCount = 8;
    actions.rerender();
    restoreInputFocus('#catalogos-cell-search', nextValue, nextScrollY);
  });

  root.querySelector('[data-action="show-more-cells"]')?.addEventListener('click', () => {
    state.view.mobileCellsVisibleCount = Number(state.view.mobileCellsVisibleCount || 8) + 8;
    actions.rerender();
  });

  renumberButton?.addEventListener('click', async () => {
    const ok = window.confirm('Se reorganizarán los números de célula para cerrar huecos. ¿Deseas continuar?');
    if (!ok) return;
    await actions.renumberCells();
  });
}