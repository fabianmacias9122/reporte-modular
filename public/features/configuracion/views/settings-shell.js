import { RCM_EVENT_CAPTURE_MODE_OPTIONS } from '../../../core/rcm/index.js';
import { getCurrentQuarterSummary, getGoalsScopeLabel, getWeekPreviewSummary } from '../models/settings-state.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSettingsInsights() {
  return '';
}

function renderStatus(status) {
  if (!status?.message) return '';
  return `<span class="settings-save-status${status.isError ? ' is-error' : ' is-ok'}">${escapeHtml(status.message)}</span>`;
}

const RCM_EVENT_OPTIONS = [
  ['', '—'],
  ['Levantate', 'Levantate'],
  ['Fiesta del Amigo', 'Fiesta del Amigo'],
  ['Restauracion', 'Restauracion'],
  ['Cielos Abiertos', 'Cielos Abiertos'],
];

function getWeekSpecialEvents(week) {
  const specialEvents = Array.isArray(week?.specialEvents)
    ? week.specialEvents.filter((entry) => String(entry?.event || '').trim())
    : [];
  if (specialEvents.length) return specialEvents;
  if (week?.event) {
    return [{
      event: week.event,
      captureMode: week.captureMode || 'separate',
    }];
  }
  return [];
}

function getCaptureModeLabel(value) {
  return RCM_EVENT_CAPTURE_MODE_OPTIONS.find((option) => option.value === value)?.label || 'Aparte';
}

function renderRcmSpecialEventSummary(week) {
  const specialEvents = getWeekSpecialEvents(week);
  const summaryCountLabel = `${specialEvents.length || 0} ${specialEvents.length === 1 ? 'evento' : 'eventos'}`;
  if (!specialEvents.length) {
    return `
      <div class="rvt-special-summary is-empty">
        <div class="rvt-special-summary-head">
          <span class="rvt-special-summary-kicker">Eventos</span>
          <span class="rvt-special-summary-count is-empty">0</span>
        </div>
        <div class="rvt-special-empty-state">
          <div class="rvt-special-empty-copy">
            <strong>Sin eventos configurados</strong>
            <span>Agrega uno o varios eventos.</span>
          </div>
        </div>
        <button type="button" class="rvt-special-edit is-primary" data-week="${escapeHtml(week.week)}">Agregar eventos</button>
      </div>
    `;
  }
  return `
    <div class="rvt-special-summary">
      <div class="rvt-special-summary-head">
        <span class="rvt-special-summary-kicker">Eventos</span>
        <span class="rvt-special-summary-count">${escapeHtml(specialEvents.length)}</span>
      </div>
      <p class="rvt-special-summary-note">${escapeHtml(summaryCountLabel)} configurados para esta semana.</p>
      <div class="rvt-special-detail-list">
        ${specialEvents.map((eventEntry) => `
          <div class="rvt-special-detail-row" data-capture-mode="${escapeHtml(String(eventEntry.captureMode || 'separate'))}">
            <strong>${escapeHtml(eventEntry.event || 'Evento')}</strong>
            <span>${escapeHtml(getCaptureModeLabel(String(eventEntry.captureMode || 'separate')))}</span>
          </div>
        `).join('')}
      </div>
      <button type="button" class="rvt-special-edit" data-week="${escapeHtml(week.week)}">Editar eventos</button>
    </div>
  `;
}

function renderRcmSpecialEventEditor(week) {
  const specialEvents = getWeekSpecialEvents(week);
  return `
    <div class="rvt-special-events">
      ${specialEvents.map((eventEntry, eventIndex) => `
        <div class="rvt-special-event-item" data-week="${escapeHtml(week.week)}" data-event-index="${escapeHtml(eventIndex)}">
          <div class="rvt-special-event-head">
            <span class="rvt-special-event-title">Evento ${escapeHtml(eventIndex + 1)}</span>
            <button type="button" class="rvt-special-remove" data-week="${escapeHtml(week.week)}" data-event-index="${escapeHtml(eventIndex)}" title="Quitar evento" aria-label="Quitar evento">✕</button>
          </div>
          <label class="rvt-special-field">
            <span class="rvt-special-field-label">Evento</span>
            <select class="rvt-special-event" data-week="${escapeHtml(week.week)}" data-event-index="${escapeHtml(eventIndex)}">
              ${[
                ...RCM_EVENT_OPTIONS,
                ...((eventEntry.event && !RCM_EVENT_OPTIONS.some(([value]) => value === eventEntry.event)) ? [[eventEntry.event, eventEntry.event]] : []),
              ].map(([value, label]) => `<option value="${escapeHtml(value)}"${String(eventEntry.event || '') === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
          <label class="rvt-special-field">
            <span class="rvt-special-field-label">Captura</span>
            <select class="rvt-special-capture-mode" data-week="${escapeHtml(week.week)}" data-event-index="${escapeHtml(eventIndex)}"${eventEntry.event ? '' : ' disabled'}>
              ${RCM_EVENT_CAPTURE_MODE_OPTIONS.map(({ value, label }) => `<option value="${escapeHtml(value)}"${String(eventEntry.captureMode || 'separate') === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
        </div>
      `).join('')}
      <button type="button" class="rvt-special-add" data-week="${escapeHtml(week.week)}">+ Agregar evento</button>
    </div>
  `;
}

function renderRcmEventsDialog(state) {
  const activeWeekNumber = Number(state.rcmEditorWeek || 0);
  const activeWeek = (Array.isArray(state.rcmWeeks) ? state.rcmWeeks : []).find((week) => week.week === activeWeekNumber) || null;
  if (!activeWeek) return '';
  return `
    <dialog id="settings-rcm-events-dialog" class="app-dialog app-dialog-wide settings-rcm-events-dialog">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Semana ${escapeHtml(activeWeek.week)}</p>
          <h3>Editar eventos RCM</h3>
        </div>
        <button type="button" class="btn-icon-round" data-action="close-rcm-events-dialog" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body rcm-dialog-body settings-rcm-events-dialog__body">
        <div class="settings-rcm-events-dialog__meta">
          <span class="settings-rcm-events-dialog__verb">${escapeHtml(activeWeek.phaseLabel || activeWeek.phase || '')}</span>
          <strong>${escapeHtml(activeWeek.verb || '')}</strong>
          <span>${escapeHtml(activeWeek.verbDesc || '')}</span>
        </div>
        ${renderRcmSpecialEventEditor(activeWeek)}
      </div>
      <div class="dialog-footer">
        <button type="button" class="secondary" data-action="close-rcm-events-dialog">Listo</button>
      </div>
    </dialog>
  `;
}

function renderAppConfirmDialog() {
  return `
    <dialog id="app-confirm-dialog" class="app-dialog">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Confirmación</p>
          <h3 id="app-confirm-title">Confirmar</h3>
        </div>
      </div>
      <div class="dialog-body">
        <p id="app-confirm-message"></p>
      </div>
      <div class="dialog-footer">
        <button type="button" id="app-confirm-cancel" class="btn-ghost">Cancelar</button>
        <button type="button" id="app-confirm-ok" class="btn-primary">Confirmar</button>
      </div>
    </dialog>
  `;
}

export function renderSettingsQuarterBody() {
  const quarter = getCurrentQuarterSummary();
  return `
    <div class="sq-row"><span class="sq-badge">${escapeHtml(quarter.label.split(' ')[0])}</span><strong>${escapeHtml(quarter.label)}</strong></div>
    <div class="sq-row sq-muted">${escapeHtml(quarter.months)} · ${escapeHtml(quarter.dateRange)}</div>
    <div class="sq-divider"></div>
    <div class="sq-row sq-muted">Q1 · Ene-Abr &nbsp;·&nbsp; Q2 · May-Ago &nbsp;·&nbsp; Q3 · Sep-Dic</div>
  `;
}

export function renderSettingsWeekPreview(settings) {
  const preview = getWeekPreviewSummary(settings);
  if (preview.status === 'empty') {
    return '<span style="color:var(--muted);font-size:0.8rem">Ingresa una fecha para ver la semana actual y la fecha de cierre del ciclo.</span>';
  }
  if (preview.status === 'invalid') {
    return '<span style="color:var(--danger);font-size:0.8rem">La fecha de inicio no es valida.</span>';
  }
  if (preview.status === 'pending') {
    return `<span style="color:var(--warning)">⚠ ${escapeHtml(preview.detail)}</span>`;
  }
  return `
    <div class="sq-row" style="margin-bottom:4px"><span class="sq-badge" style="font-size:0.7rem">${escapeHtml(preview.title)}</span><strong>${escapeHtml(preview.detail)}</strong></div>
    <div style="font-size:0.78rem;color:var(--muted);line-height:1.5">${escapeHtml(preview.meta || '')}</div>
  `;
}

function renderRcmVerbsRows(rcmWeeks) {
  return (Array.isArray(rcmWeeks) ? rcmWeeks : []).map((week) => `
    <tr data-week="${escapeHtml(week.week)}" class="rvt-row-${escapeHtml(String(week.phase || '').toLowerCase())}">
      <td><span class="rcm-verbs-week-badge">${escapeHtml(week.week)}</span></td>
      <td>
        <select class="rvt-phase" data-week="${escapeHtml(week.week)}" style="width:100%;font-size:0.78rem;padding:4px">
          ${[
            ['GANAR', 'Ganar'],
            ['CONSOLIDAR', 'Consolidar'],
            ['DISCIPULAR', 'Discipular'],
          ].map(([value, label]) => `<option value="${value}"${String(week.phase || '').toUpperCase() === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" class="rvt-verb" data-week="${escapeHtml(week.week)}" value="${escapeHtml(week.verb || '')}" maxlength="20" style="text-transform:uppercase"></td>
      <td><textarea class="rvt-desc" data-week="${escapeHtml(week.week)}" maxlength="120" rows="3">${escapeHtml(week.verbDesc || '')}</textarea></td>
      <td>
        ${renderRcmSpecialEventSummary(week)}
      </td>
      <td>
        <button type="button" class="rvt-remove" data-week="${escapeHtml(week.week)}" title="Quitar semana" aria-label="Quitar semana ${escapeHtml(week.week)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderRcmMobileSummary(rcmWeeks) {
  const weeks = Array.isArray(rcmWeeks) ? rcmWeeks : [];
  const totalWeeks = weeks.length;
  const eventWeeks = weeks.filter((week) => String(week.event || '').trim());
  const phaseCounts = weeks.reduce((counts, week) => {
    const key = String(week.phase || '').toUpperCase();
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const phaseSummary = [
    ['GANAR', 'Ganar'],
    ['CONSOLIDAR', 'Consolidar'],
    ['DISCIPULAR', 'Discipular'],
  ].filter(([key]) => phaseCounts[key]).map(([key, label]) => `${label} ${phaseCounts[key]}`);

  return `
    <div class="settings-rcm-mobile-summary">
      <div class="settings-rcm-mobile-summary__stats">
        <span class="settings-rcm-mobile-summary__pill">${escapeHtml(String(totalWeeks))} semanas</span>
        <span class="settings-rcm-mobile-summary__pill">${escapeHtml(String(eventWeeks.length))} hitos</span>
      </div>
      <p class="settings-rcm-mobile-summary__text">${escapeHtml(phaseSummary.join(' · ') || 'Sin fases configuradas')}</p>
      <p class="settings-rcm-mobile-summary__text settings-rcm-mobile-summary__text--muted">${escapeHtml(eventWeeks.map((week) => `S${week.week} ${week.event}`).join(' · ') || 'No hay eventos catalizadores marcados')}</p>
    </div>
  `;
}

export function renderSettingsShell(state) {
  const settings = state.settings;
  const historyScope = state.preferences.history_scope;
  const currentLang = state.currentLang;
  const isRcmExpanded = Boolean(state.mobileRcmExpanded);
  const canEditOperational = Boolean(state.canEditOperational);
  const goalsReadOnlyNote = canEditOperational
    ? ''
    : '<div class="settings-inline-note">Solo administradores pueden cambiar estas metas.</div>';
  return `
    <section class="workspace-main">
      <div class="page-shell settings-layout" style="padding-top:0">
        <div class="panel-head settings-head" style="margin-bottom:20px">
          <div>
            <p class="eyebrow">Sistema</p>
            <h2>Configuración</h2>
            <p class="settings-page-intro">Centraliza el ciclo, metas y semanas del proceso RCM sin perder el historial ya capturado.</p>
          </div>
        </div>
        <nav class="settings-mobile-nav" aria-label="Secciones de configuracion">
          <button type="button" class="settings-mobile-nav__chip" data-section="cycle" aria-controls="settings-section-cycle">Ciclo</button>
          <button type="button" class="settings-mobile-nav__chip" data-section="preferences" aria-controls="settings-section-preferences">Preferencias</button>
          ${canEditOperational ? '<button type="button" class="settings-mobile-nav__chip" data-section="rcm" aria-controls="settings-section-rcm">RCM</button>' : ''}
        </nav>
        <div class="settings-grid">
          <section class="settings-mobile-section settings-column settings-column--primary" id="settings-section-cycle" data-mobile-section="cycle">
            ${canEditOperational ? `
            <div class="settings-section-label">
              <span class="settings-section-kicker">Operación</span>
              <strong class="settings-section-title">Ciclo del periodo</strong>
            </div>
            <div class="settings-card" id="settings-cycle-card">
              <div class="settings-card-header">
                <div>
                  <strong class="settings-card-title">Configuración del ciclo RCM</strong>
                  <p class="settings-card-desc">Define inicio, semana y metas del ciclo actual. El sistema calcula la semana en curso automáticamente a partir de esta base.</p>
                </div>
              </div>
              <form id="settings-cycle-form"></form>
              <div class="settings-card-body">
                <div class="settings-cycle-layout">
                  <div class="settings-cycle-basics">
                    <div class="settings-cycle-top-row">
                      <div class="settings-field-block">
                        <label class="settings-label" for="setting-cycle-start">Fecha de inicio del ciclo</label>
                        <input id="setting-cycle-start" name="cycle_start_date" type="date" class="settings-input" form="settings-cycle-form" value="${escapeHtml(settings.cycle_start_date || '')}">
                      </div>
                      <div class="settings-field-block">
                        <label class="settings-label" for="setting-week-start-day">Día de inicio de semana</label>
                        <select id="setting-week-start-day" name="week_start_day" class="settings-input" form="settings-cycle-form">
                          ${[
                            ['0', 'Domingo'],
                            ['1', 'Lunes'],
                            ['2', 'Martes'],
                            ['3', 'Miércoles'],
                            ['4', 'Jueves'],
                            ['5', 'Viernes'],
                            ['6', 'Sábado'],
                          ].map(([value, label]) => `<option value="${value}"${String(settings.week_start_day) === value ? ' selected' : ''}>${label}</option>`).join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-subsection settings-subsection--goals-block">
                      <div class="settings-subsection-head">
                        <strong class="settings-subsection-title">Metas del ciclo</strong>
                        <span class="settings-subsection-kicker">Objetivos</span>
                      </div>
                      <p class="settings-help-text">Define las metas RCM del periodo actual. Se usarán en Seguimiento y se guardarán para la célula activa.</p>
                      <form id="settings-goals-form">
                        <div class="settings-card-body settings-card-body--goals-inline">
                          <div id="settings-goals-scope" class="settings-inline-note">${escapeHtml(getGoalsScopeLabel(state.currentUser))}</div>
                          <div class="settings-metrics-grid">
                            <label class="settings-metric-field" for="setting-goal-levantate">
                              <span class="settings-label">Evento Levántate</span>
                              <input id="setting-goal-levantate" name="rcm_goal_levantate" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="4" value="${escapeHtml(settings.rcm_goal_levantate || '4')}">
                            </label>
                            <label class="settings-metric-field" for="setting-goal-restauracion">
                              <span class="settings-label">Evento Santificar</span>
                              <input id="setting-goal-restauracion" name="rcm_goal_restauracion" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="3" value="${escapeHtml(settings.rcm_goal_restauracion || '3')}">
                            </label>
                            <label class="settings-metric-field" for="setting-goal-bautismos">
                              <span class="settings-label">Bautismo</span>
                              <input id="setting-goal-bautismos" name="rcm_goal_bautismos" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="2" value="${escapeHtml(settings.rcm_goal_bautismos || '2')}">
                            </label>
                          </div>
                        </div>
                      </form>
                    </div>
                    <div class="settings-cycle-compact-row">
                      <div class="settings-field-block settings-field-block--compact">
                        <label class="settings-label" for="setting-grace-hours">Horas de gracia al inicio de semana</label>
                        <input id="setting-grace-hours" name="report_grace_hours" type="number" min="0" max="48" step="1" class="settings-input settings-input--compact" form="settings-cycle-form" placeholder="0" value="${escapeHtml(settings.report_grace_hours || '0')}">
                        <p class="settings-help-text">Durante este tiempo el sistema puede sugerir la semana anterior.</p>
                      </div>
                      <div class="settings-field-block settings-field-block--compact">
                        <label class="settings-label" for="setting-process-late-weeks">Prórroga para anotar tardío</label>
                        <input id="setting-process-late-weeks" name="process_entry_late_weeks" type="number" min="0" max="14" step="1" class="settings-input settings-input--compact" form="settings-cycle-form" placeholder="0" value="${escapeHtml(settings.process_entry_late_weeks || '14')}">
                        <p class="settings-help-text">Semanas extra para registrar proceso sin contar asistencia.</p>
                      </div>
                    </div>
                  </div>
                  <div class="settings-cycle-secondary">
                    <div class="settings-cycle-side">
                      <div id="settings-week-preview" class="settings-week-preview">${renderSettingsWeekPreview(settings)}</div>
                      <div class="settings-subsection settings-subsection--info">
                        <div class="settings-subsection-head">
                          <strong class="settings-subsection-title">Contexto del año</strong>
                          <span class="settings-subsection-kicker">Referencia rápida</span>
                        </div>
                        <div id="settings-quarter-body" class="settings-quarter-body">${renderSettingsQuarterBody()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="settings-card-footer">
                <button id="settings-save-btn" type="button" class="btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  <span>Guardar ciclo y metas</span>
                </button>
                ${renderStatus(state.statuses.cycle)}
              </div>
            </div>
            ` : ''}
          ${!canEditOperational ? `
          <div class="settings-card settings-card--info" id="settings-quarter-card">
            <div class="settings-card-header">
              <div>
                <strong class="settings-card-title">Contexto del año</strong>
                <p class="settings-card-desc">Referencia del cuatrimestre y año en curso según el calendario de la IAFCJ.</p>
              </div>
            </div>
            <div id="settings-quarter-body" class="settings-quarter-body">${renderSettingsQuarterBody()}</div>
          </div>
          <div class="settings-card settings-card--readonly" id="settings-goals-card">
            <div class="settings-card-header">
              <div>
                <strong class="settings-card-title">Metas del cuatrimestre</strong>
                <p class="settings-card-desc">Define las metas RCM del periodo actual. Se usarán en Seguimiento y se guardarán para la célula activa.</p>
              </div>
            </div>
            <form id="settings-goals-form">
              <div class="settings-card-body settings-card-body--goals-inline">
                <div id="settings-goals-scope" class="settings-inline-note">${escapeHtml(getGoalsScopeLabel(state.currentUser))}</div>
                ${goalsReadOnlyNote}
                <div class="settings-metrics-grid">
                  <label class="settings-metric-field" for="setting-goal-levantate">
                    <span class="settings-label">Evento Levántate</span>
                    <input id="setting-goal-levantate" name="rcm_goal_levantate" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="4" value="${escapeHtml(settings.rcm_goal_levantate || '4')}" disabled>
                  </label>
                  <label class="settings-metric-field" for="setting-goal-restauracion">
                    <span class="settings-label">Evento Santificar</span>
                    <input id="setting-goal-restauracion" name="rcm_goal_restauracion" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="3" value="${escapeHtml(settings.rcm_goal_restauracion || '3')}" disabled>
                  </label>
                  <label class="settings-metric-field" for="setting-goal-bautismos">
                    <span class="settings-label">Bautismo</span>
                    <input id="setting-goal-bautismos" name="rcm_goal_bautismos" type="number" min="0" step="1" class="settings-input settings-input--metric" placeholder="2" value="${escapeHtml(settings.rcm_goal_bautismos || '2')}" disabled>
                  </label>
                </div>
              </div>
            </form>
            <div class="settings-card-footer">
              ${renderStatus(state.statuses.goals)}
            </div>
          </div>
          ` : ''}
          </section>
          <section class="settings-mobile-section settings-column settings-column--secondary" id="settings-section-preferences" data-mobile-section="preferences">
            <div class="settings-section-label">
              <span class="settings-section-kicker">Personalización</span>
              <strong class="settings-section-title">Preferencias de consulta</strong>
            </div>
          <div class="settings-card" id="settings-prefs-card">
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
              <div>
                <strong class="settings-card-title">Preferencias</strong>
                <p class="settings-card-desc">Controla cómo ves la información y el idioma de la interfaz.</p>
              </div>
            </div>
            <div class="settings-card-body settings-card-body--preferences">
              <div class="settings-subsection">
                <div class="settings-subsection-head">
                  <strong class="settings-subsection-title">Historial visible</strong>
                  <span class="settings-subsection-kicker">Tus reportes</span>
                </div>
                <form id="configuracion-preferences-form">
                  <div class="settings-toggle-group">
                    <label class="settings-toggle-option">
                      <input type="radio" name="history_scope" id="pref-history-current" value="current"${historyScope === 'current' ? ' checked' : ''}>
                      <span>Solo cuatrimestre actual</span>
                    </label>
                    <label class="settings-toggle-option">
                      <input type="radio" name="history_scope" id="pref-history-all" value="all"${historyScope === 'all' ? ' checked' : ''}>
                      <span>Todos los cuatrimestres</span>
                    </label>
                  </div>
                </form>
              </div>
              <div class="settings-subsection">
                <div class="settings-subsection-head">
                  <strong class="settings-subsection-title">Idioma</strong>
                  <span class="settings-subsection-kicker">Interfaz</span>
                </div>
                <form id="configuracion-language-form">
                  <div class="settings-toggle-group">
                    <label class="settings-toggle-option">
                      <input type="radio" name="settings_lang" id="settings-lang-es" value="es"${currentLang === 'es' ? ' checked' : ''}>
                      <span>Español</span>
                    </label>
                    <label class="settings-toggle-option">
                      <input type="radio" name="settings_lang" id="settings-lang-en" value="en"${currentLang === 'en' ? ' checked' : ''}>
                      <span>English</span>
                    </label>
                  </div>
                </form>
              </div>
            </div>
            <div class="settings-card-footer">
              <button id="settings-prefs-save-btn" type="button" class="btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar preferencias</span>
              </button>
              ${renderStatus(state.statuses.preferences)}
            </div>
          </div>
          </section>
          ${canEditOperational ? `
          <section class="settings-mobile-section settings-mobile-section--full" id="settings-section-rcm" data-mobile-section="rcm">
            <div class="settings-section-label settings-section-label--full">
              <span class="settings-section-kicker">Avanzado</span>
              <strong class="settings-section-title">Proceso RCM</strong>
            </div>
            <div class="settings-card settings-card--full" id="settings-rcm-verbs-card">
              <div class="settings-card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <div>
                  <strong class="settings-card-title">Semanas, verbos y eventos</strong>
                  <p class="settings-card-desc">Ajusta semanas, verbos y eventos catalizadores del ciclo sin reinterpretar el historial ya registrado.</p>
                </div>
              </div>
              <div class="settings-rcm-mobile-toolbar">
                <button type="button" class="btn btn--ghost settings-rcm-mobile-toggle" id="settings-rcm-mobile-toggle" aria-expanded="${isRcmExpanded ? 'true' : 'false'}">
                  <span>${isRcmExpanded ? 'Ocultar editor' : 'Editar diseño RCM'}</span>
                </button>
                ${renderRcmMobileSummary(state.rcmWeeks)}
              </div>
              <div class="settings-rcm-editor${isRcmExpanded ? ' is-expanded' : ''}">
                <div class="settings-card-body settings-card-body--table">
                  <div class="settings-table-intro">Usa esta tabla para mover semanas y marcar solo los hitos que sí aplican en el ciclo actual.</div>
                  <div class="settings-table-wrap">
                    <table class="rcm-verbs-table" id="rcm-verbs-table">
                      <thead>
                        <tr>
                          <th style="width:44px">Sem.</th>
                          <th style="width:120px">Etapa</th>
                          <th style="width:130px">Verbo</th>
                          <th>Descripción</th>
                          <th style="width:180px">Evento y captura</th>
                          <th style="width:44px" aria-label="Acciones"></th>
                        </tr>
                      </thead>
                      <tbody id="rcm-verbs-tbody">${renderRcmVerbsRows(state.rcmWeeks)}</tbody>
                    </table>
                  </div>
                </div>
                <div class="settings-card-footer settings-card-footer--rcm">
                  <div class="settings-rcm-actions">
                    <div class="settings-rcm-actions__group">
                      <button id="rcm-verbs-add-btn" type="button" class="btn btn--ghost settings-rcm-action-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Agregar semana</span>
                      </button>
                      <button id="settings-rcm-verbs-reset-btn" type="button" class="btn btn--ghost settings-rcm-action-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        <span>Restablecer predeterminados</span>
                      </button>
                    </div>
                    <div class="settings-rcm-actions__group settings-rcm-actions__group--primary">
                      <button id="settings-rcm-verbs-save-btn" type="button" class="btn settings-rcm-action-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        <span>Guardar verbos</span>
                      </button>
                    </div>
                  </div>
                  ${renderStatus(state.statuses.verbs)}
                </div>
              </div>
            </div>
          </section>
          ` : ''}
        </div>
      </div>
      ${renderRcmEventsDialog(state)}
      ${renderAppConfirmDialog()}
    </section>
  `;
}