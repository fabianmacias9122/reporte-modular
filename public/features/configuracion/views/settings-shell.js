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
      <td><input type="text" class="rvt-desc" data-week="${escapeHtml(week.week)}" value="${escapeHtml(week.verbDesc || '')}" maxlength="120"></td>
      <td><input type="text" class="rvt-event" data-week="${escapeHtml(week.week)}" value="${escapeHtml(week.event || '')}" maxlength="40" placeholder="—"></td>
      <td>
        <button type="button" class="rvt-remove" data-week="${escapeHtml(week.week)}" title="Quitar semana" aria-label="Quitar semana ${escapeHtml(week.week)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

export function renderSettingsShell(state) {
  const settings = state.settings;
  const historyScope = state.preferences.history_scope;
  const currentLang = state.currentLang;
  const isAdmin = Boolean(state.currentUser?.isAdmin);
  return `
    <section class="workspace-main">
      <div class="page-shell" style="padding-top:0">
        <div class="panel-head" style="margin-bottom:20px">
          <div>
            <p class="eyebrow">Sistema</p>
            <h2>Configuración</h2>
          </div>
        </div>
        <div class="settings-grid">
          <div class="settings-card" id="settings-cycle-card"${isAdmin ? '' : ' hidden'}>
            <div class="settings-card-header">
              <div>
                <strong class="settings-card-title">Ciclo RCM activo</strong>
                <p class="settings-card-desc">Fecha en que inició el ciclo actual. El sistema calcula la semana en curso automáticamente a partir de este día.</p>
              </div>
            </div>
            <form id="settings-cycle-form">
              <div class="settings-card-body">
                <label class="settings-label" for="setting-cycle-start">Fecha de inicio del ciclo</label>
                <input id="setting-cycle-start" name="cycle_start_date" type="date" class="settings-input" value="${escapeHtml(settings.cycle_start_date || '')}">
                <label class="settings-label" for="setting-week-start-day" style="margin-top:12px">Día de inicio de semana</label>
                <select id="setting-week-start-day" name="week_start_day" class="settings-input">
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
                <label class="settings-label" for="setting-grace-hours" style="margin-top:12px">Horas de gracia al inicio de semana</label>
                <div style="display:flex;align-items:center;gap:8px">
                  <input id="setting-grace-hours" name="report_grace_hours" type="number" min="0" max="48" step="1" class="settings-input" style="width:80px" placeholder="0" value="${escapeHtml(settings.report_grace_hours || '0')}">
                  <span style="font-size:0.8rem;color:var(--muted)">horas — el sistema sugiere la semana anterior durante este tiempo</span>
                </div>
                <label class="settings-label" for="setting-process-late-weeks" style="margin-top:12px">Prórroga para anotar tardío</label>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <input id="setting-process-late-weeks" name="process_entry_late_weeks" type="number" min="0" max="14" step="1" class="settings-input" style="width:80px" placeholder="0" value="${escapeHtml(settings.process_entry_late_weeks || '14')}">
                  <span style="font-size:0.8rem;color:var(--muted)">semanas después de la 2 en las que aún se permite registrar proceso sin contar asistencia</span>
                </div>
                <div id="settings-week-preview" class="settings-week-preview" style="margin-top:10px">${renderSettingsWeekPreview(settings)}</div>
              </div>
            </form>
            <div class="settings-card-footer">
              <button id="settings-save-btn" type="button" class="btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar</span>
              </button>
              ${renderStatus(state.statuses.cycle)}
            </div>
          </div>
          <div class="settings-card settings-card--info" id="settings-quarter-card">
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div>
                <strong class="settings-card-title">Contexto del año</strong>
                <p class="settings-card-desc">Referencia del cuatrimestre y año en curso según el calendario de la IAFCJ.</p>
              </div>
            </div>
            <div id="settings-quarter-body" class="settings-quarter-body">${renderSettingsQuarterBody()}</div>
          </div>
          <div class="settings-card" id="settings-goals-card">
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <div>
                <strong class="settings-card-title">Metas del cuatrimestre</strong>
                <p class="settings-card-desc">Define las metas RCM del periodo actual. Se usarán en Seguimiento y se guardarán para la célula activa.</p>
              </div>
            </div>
            <form id="settings-goals-form">
              <div class="settings-card-body">
                <div id="settings-goals-scope" class="settings-inline-note">${escapeHtml(getGoalsScopeLabel(state.currentUser))}</div>
                <label class="settings-label" for="setting-goal-levantate">Evento Levántate</label>
                <input id="setting-goal-levantate" name="rcm_goal_levantate" type="number" min="0" step="1" class="settings-input" placeholder="4" value="${escapeHtml(settings.rcm_goal_levantate || '4')}">
                <label class="settings-label" for="setting-goal-restauracion" style="margin-top:12px">Evento Santificar</label>
                <input id="setting-goal-restauracion" name="rcm_goal_restauracion" type="number" min="0" step="1" class="settings-input" placeholder="3" value="${escapeHtml(settings.rcm_goal_restauracion || '3')}">
                <label class="settings-label" for="setting-goal-bautismos" style="margin-top:12px">Bautismo</label>
                <input id="setting-goal-bautismos" name="rcm_goal_bautismos" type="number" min="0" step="1" class="settings-input" placeholder="2" value="${escapeHtml(settings.rcm_goal_bautismos || '2')}">
              </div>
            </form>
            <div class="settings-card-footer">
              <button id="settings-goals-save-btn" type="button" class="btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar metas</span>
              </button>
              ${renderStatus(state.statuses.goals)}
            </div>
          </div>
          <div class="settings-card" id="settings-prefs-card">
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
              <div>
                <strong class="settings-card-title">Preferencias de historial</strong>
                <p class="settings-card-desc">Controla cuántos cuatrimestres se muestran en tus reportes registrados.</p>
              </div>
            </div>
            <form id="configuracion-preferences-form">
              <div class="settings-card-body">
                <label class="settings-label">Historial visible</label>
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
              </div>
            </form>
            <div class="settings-card-footer">
              <button id="settings-prefs-save-btn" type="button" class="btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar preferencias</span>
              </button>
              ${renderStatus(state.statuses.preferences)}
            </div>
          </div>
          <div class="settings-card" id="settings-language-card">
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div>
                <strong class="settings-card-title">Idioma</strong>
                <p class="settings-card-desc">Selecciona el idioma de la interfaz.</p>
              </div>
            </div>
            <form id="configuracion-language-form">
              <div class="settings-card-body">
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
              </div>
            </form>
          </div>
          <div class="settings-card settings-card--full" id="settings-rcm-verbs-card"${isAdmin ? '' : ' hidden'}>
            <div class="settings-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <div>
                <strong class="settings-card-title">Verbos RCM por semana</strong>
                <p class="settings-card-desc">Personaliza los verbos, descripciones y nombres de eventos catalizadores de cada semana del ciclo.</p>
              </div>
            </div>
            <div class="settings-card-body" style="overflow-x:auto">
              <table class="rcm-verbs-table" id="rcm-verbs-table">
                <thead>
                  <tr>
                    <th style="width:44px">Sem.</th>
                    <th style="width:120px">Etapa</th>
                    <th style="width:130px">Verbo</th>
                    <th>Descripción</th>
                    <th style="width:150px">Evento catalizador</th>
                    <th style="width:44px" aria-label="Acciones"></th>
                  </tr>
                </thead>
                <tbody id="rcm-verbs-tbody">${renderRcmVerbsRows(state.rcmWeeks)}</tbody>
              </table>
              <div style="margin-top:10px">
                <button id="rcm-verbs-add-btn" type="button" class="btn btn--ghost" style="font-size:0.82rem">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Agregar semana</span>
                </button>
              </div>
            </div>
            <div class="settings-card-footer">
              <button id="settings-rcm-verbs-save-btn" type="button" class="btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar verbos</span>
              </button>
              <button id="settings-rcm-verbs-reset-btn" type="button" class="btn btn--ghost" style="margin-left:8px">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                <span>Restablecer predeterminados</span>
              </button>
              ${renderStatus(state.statuses.verbs)}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}