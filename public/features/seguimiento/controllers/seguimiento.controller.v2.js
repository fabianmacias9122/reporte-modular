async function renderElementToPngBlob(element) {
  if (!element) return null;
  if (typeof window.html2canvas !== 'function') {
    window.alert('No se pudo cargar la utilidad de captura (html2canvas). Verifica tu conexión.');
    return null;
  }
  element.classList.add('is-capturing');
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const fullWidth = Math.max(element.scrollWidth, element.offsetWidth, element.clientWidth);
    const fullHeight = Math.max(element.scrollHeight, element.offsetHeight, element.clientHeight);
    const canvas = await window.html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1) || 1,
      useCORS: true,
      logging: false,
      width: fullWidth,
      height: fullHeight,
      windowWidth: Math.max(fullWidth, window.innerWidth),
      windowHeight: Math.max(fullHeight, window.innerHeight),
      scrollX: 0,
      scrollY: -window.scrollY,
    });
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  } catch (error) {
    window.alert(`No se pudo generar la imagen: ${error.message || error}`);
    return null;
  } finally {
    element.classList.remove('is-capturing');
  }
}

async function downloadElementAsPng(element, filename) {
  const blob = await renderElementToPngBlob(element);
  if (!blob) return;
  const link = document.createElement('a');
  link.download = filename || 'reporte.png';
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  link.remove();
}

function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`;
  window.open(url, '_blank', 'noopener');
}

async function shareElementWithText(element, text, filename) {
  const blob = await renderElementToPngBlob(element);
  if (!blob) return;
  const file = new File([blob], filename || 'reporte.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }
  await downloadElementAsPng(element, filename);
  const shareText = String(text || '').trim();
  if (shareText && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // ignore clipboard failures and still open WhatsApp
    }
  }
  if (shareText) {
    openWhatsApp(shareText);
    window.alert('Se descargó la imagen y se abrió WhatsApp con el texto del consolidado. Adjunta la imagen manualmente con el clip.');
    return;
  }
  window.alert('Se descargó la imagen. Abre WhatsApp y adjúntala manualmente con el clip.');
}

function sanitizeFileName(value) {
  return String(value || 'reporte').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 60);
}

export function attachSeguimientoController(root, actions) {
  root.__seguimientoActions = actions;

  function closeSegTabMenu() {
    const menu = root.querySelector('#seg-view-mobile-menu');
    const picker = root.querySelector('#seg-view-mobile-picker');
    const button = root.querySelector('#seg-view-mobile-button');
    if (menu) menu.hidden = true;
    if (picker) picker.classList.remove('is-open');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function toggleSegTabMenu(forceOpen = null) {
    const menu = root.querySelector('#seg-view-mobile-menu');
    const picker = root.querySelector('#seg-view-mobile-picker');
    const button = root.querySelector('#seg-view-mobile-button');
    if (!menu || !picker || !button) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : menu.hidden;
    menu.hidden = !shouldOpen;
    if (picker) picker.classList.toggle('is-open', shouldOpen);
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  const form = root.querySelector('#seguimiento-scope-form');
  form?.addEventListener('change', async () => {
    await actions.changeFilters(new FormData(form));
  });

  root.querySelector('#sup-supervisor-select')?.addEventListener('change', (event) => {
    actions.changeSupervisor(String(event.target?.value || ''));
  });
  root.querySelector('#sup-week-select')?.addEventListener('change', (event) => {
    actions.changeSupervisorWeek(String(event.target?.value || ''));
  });
  root.querySelector('#dashboard-period-select')?.addEventListener('change', (event) => {
    actions.changeDashboardPeriod(String(event.target?.value || ''));
  });

  root.querySelector('#seg-totals-show-offering')?.addEventListener('change', (event) => {
    actions.toggleShowOffering(Boolean(event.target?.checked));
  });

  if (!root.__seguimientoDelegatedChangeBound) {
    root.addEventListener('change', async (event) => {
      const select = event.target.closest('select[data-action]');
      if (!select) return;
      const currentActions = root.__seguimientoActions;
      if (!currentActions) return;
      const action = String(select.dataset.action || '');
      if (action === 'change-tab-select') {
        currentActions.changeTab(String(select.value || ''));
        return;
      }
      if (action === 'change-metas-cell') {
        await currentActions.changeMetasCellFilter(String(select.value || ''));
      }
      if (action === 'change-supervisor') {
        currentActions.changeSupervisor(String(select.value || ''));
      }
      if (action === 'change-supervisor-week') {
        currentActions.changeSupervisorWeek(String(select.value || ''));
      }
    });
    root.__seguimientoDelegatedChangeBound = true;
  }

  const previewDialog = root.querySelector('#seguimiento-report-preview-dialog');
  previewDialog?.addEventListener('close', () => {
    actions.closePreview();
  });
  previewDialog?.addEventListener('click', (event) => {
    if (event.target === previewDialog) {
      actions.closePreview();
    }
  });
  root.querySelector('#seguimiento-preview-close-btn')?.addEventListener('click', () => {
    actions.closePreview();
  });
  root.querySelector('#seguimiento-preview-done-btn')?.addEventListener('click', () => {
    actions.closePreview();
  });

  const controlDetailDialog = root.querySelector('#seguimiento-control-detail-dialog');
  controlDetailDialog?.addEventListener('close', () => {
    actions.closeControlDetail();
  });
  controlDetailDialog?.addEventListener('click', (event) => {
    if (event.target === controlDetailDialog) {
      actions.closeControlDetail();
    }
  });
  root.querySelector('#seguimiento-control-detail-close-btn')?.addEventListener('click', () => {
    actions.closeControlDetail();
  });
  root.querySelector('#seguimiento-control-detail-done-btn')?.addEventListener('click', () => {
    actions.closeControlDetail();
  });

  if (!root.__seguimientoDelegatedClickBound) {
    root.addEventListener('click', async (event) => {
      const currentActions = root.__seguimientoActions;
      if (!currentActions) return;
      const picker = root.querySelector('#seg-view-mobile-picker');
      if (picker && !picker.contains(event.target)) {
        closeSegTabMenu();
      }

      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = String(button.dataset.action || '');
      if (action === 'toggle-tab-menu') {
        toggleSegTabMenu();
        return;
      }
      if (action === 'change-tab-menu') {
        closeSegTabMenu();
        currentActions.changeTab(String(button.dataset.tab || ''));
        return;
      }
      if (action === 'select-card-detail') {
        await currentActions.selectCardDetail(String(button.dataset.cardKey || ''));
        return;
      }
      if (action === 'change-tab') {
        currentActions.changeTab(String(button.dataset.tab || ''));
        return;
      }
      if (action === 'change-access-scope') {
        currentActions.changeAccessScope(String(button.dataset.scope || ''));
        return;
      }
      if (action === 'change-week-offset') {
        currentActions.changeWeekOffset(String(button.dataset.weekoff || '-1'));
        return;
      }
      if (action === 'change-dashboard-time-scope') {
        currentActions.changeDashboardTimeScope(String(button.dataset.scope || 'week'));
        return;
      }
      if (action === 'change-dashboard-attendance-tab') {
        currentActions.changeDashboardAttendanceTab(String(button.dataset.tab || 'hermanos'));
        return;
      }
      if (action === 'toggle-dashboard-summary-cards') {
        currentActions.toggleDashboardSummaryCards();
        return;
      }
      if (action === 'toggle-metas-summary-cards') {
        currentActions.toggleMetasSummaryCards();
        return;
      }
      if (action === 'change-totals-scope') {
        currentActions.changeTotalsScope(String(button.dataset.scope || 'cell'));
        return;
      }
      if (action === 'goto-cell') {
        currentActions.gotoCell(String(button.dataset.cell || ''));
        return;
      }
      if (action === 'view-report') {
        await currentActions.selectReportDetail(String(button.dataset.cardKey || ''), String(button.dataset.id || ''));
        return;
      }
      if (action === 'open-capture') {
        await currentActions.openCapture({
          cellNumber: String(button.dataset.cell || ''),
          week: String(button.dataset.week || ''),
        });
        return;
      }
      if (action === 'preview-share') {
        await currentActions.getPreviewSharePayload?.();
        return;
      }
      if (action === 'open-supervisor-report') {
        await currentActions.openSupervisorReport(String(button.dataset.id || ''));
        return;
      }
      if (action === 'open-control-detail') {
        currentActions.openControlDetail(String(button.dataset.controlKey || ''));
        return;
      }
      if (action === 'submit-approval-action') {
        await currentActions.submitApprovalAction(
          String(button.dataset.approvalAction || ''),
          String(button.dataset.sector || ''),
          String(button.dataset.week || ''),
        );
        return;
      }
      if (action === 'download-supervisor-capture') {
        const capture = button.closest('.sup-capture');
        const sector = capture?.dataset.supSector || 'supervisor';
        const week = capture?.dataset.supWeek || '';
        await downloadElementAsPng(capture, `reporte-${sanitizeFileName(sector)}-S${week}.png`);
        return;
      }
      if (action === 'share-supervisor-capture') {
        const capture = button.closest('.sup-capture');
        const sector = capture?.dataset.supSector || 'supervisor';
        const week = capture?.dataset.supWeek || '';
        const payload = typeof currentActions.getSupervisorSharePayload === 'function'
          ? currentActions.getSupervisorSharePayload()
          : null;
        await shareElementWithText(
          capture,
          payload?.text || '',
          payload?.filename || `reporte-${sanitizeFileName(sector)}-S${week}.png`,
        );
        return;
      }
      if (action === 'download-preview-report') {
        const previewBody = root.querySelector('#seguimiento-report-preview-dialog .preview-dialog-body');
        const payload = typeof currentActions.getPreviewSharePayload === 'function'
          ? currentActions.getPreviewSharePayload()
          : null;
        await downloadElementAsPng(previewBody, payload?.filename || 'reporte.png');
        return;
      }
      if (action === 'share-preview-report') {
        const previewBody = root.querySelector('#seguimiento-report-preview-dialog .preview-dialog-body');
        const payload = typeof currentActions.getPreviewSharePayload === 'function'
          ? currentActions.getPreviewSharePayload()
          : null;
        await shareElementWithText(previewBody, payload?.text || '', payload?.filename || 'reporte.png');
        return;
      }
      if (action === 'new-report-for-cell') {
        await currentActions.openCapture({
          cellNumber: String(button.dataset.cell || ''),
          week: String(button.dataset.week || ''),
        });
        return;
      }
    });
    root.__seguimientoDelegatedClickBound = true;
  }
}