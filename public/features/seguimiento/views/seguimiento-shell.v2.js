import { getRcmWeekInfo } from '../../../core/rcm/index.js';
import { buildHistoryPreviewHtml } from '../../reporte/views/reporte-shell.js?v=20260622-preview-events-fix-1';
import { formatSeguimientoDate } from '../models/seguimiento-state.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTrackingDateLabel(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatTrackingRangeLabel(start, end) {
  const startLabel = formatTrackingDateLabel(start);
  const endLabel = formatTrackingDateLabel(end);
  if (!startLabel && !endLabel) return 'Sin fechas';
  if (!endLabel || startLabel === endLabel) return startLabel || endLabel;
  return `${startLabel} — ${endLabel}`;
}

function getFriendTrackingBackendOutcomeLabel(outcome, status = '') {
  const normalizedOutcome = String(outcome || '').trim().toLowerCase();
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const labelMap = {
    in_process: 'Sigue en proceso',
    converted_in_process: 'Decidió dentro del proceso',
    converted: 'Completó y decidió',
    completed_no_decision: 'Completó sin decisión registrada',
    completed: 'Ciclo completado',
    won_friend: 'Amigo ganado',
    reactivated_won: 'Reactivado en seguimiento',
    member: 'Ya figura como miembro',
  };
  if (normalizedOutcome && labelMap[normalizedOutcome]) return labelMap[normalizedOutcome];
  if (normalizedStatus && labelMap[normalizedStatus]) return labelMap[normalizedStatus];
  if (normalizedOutcome) return normalizedOutcome.replace(/_/g, ' ');
  if (normalizedStatus) return normalizedStatus.replace(/_/g, ' ');
  return 'Sin lectura backend';
}

function renderControlDetailDialog(scope, entry) {
  if (!entry) return '';
  const cycleText = entry.processCount > 1
    ? `${entry.processCount} ciclos en histórico`
    : `${entry.processCount || 0} ciclo${entry.processCount === 1 ? ' en histórico' : 's'}`;
  const missingText = entry.pendingSteps?.length ? entry.pendingSteps.join(', ') : 'Ninguno';
  const heroSummaryText = entry.statusKey === 'missed'
    ? 'Tiene hitos vencidos dentro del proceso.'
    : `Le falta: ${missingText}`;
  const outcomeText = entry.backendOutcome || entry.backendStatus
    ? getFriendTrackingBackendOutcomeLabel(entry.backendOutcome, entry.backendStatus)
    : entry.cycleClosed
      ? 'Ciclo cerrado con datos actuales'
      : 'Ciclo todavía abierto';
  const routeItems = [
    entry.notedWeek ? `Anotó sem. ${entry.notedWeek}` : 'Sin semana de anotar',
    entry.levantateWeek ? `Levántate sem. ${entry.levantateWeek}` : 'Sin Levántate',
    entry.restauracionWeek ? `Restauración sem. ${entry.restauracionWeek}` : 'Sin Restauración',
    entry.cycleClosed ? `Cierre en sem. ${entry.currentWeek || 16}` : `Avance máx. sem. ${entry.currentWeek || 0}`,
  ];
  const milestoneTimeline = [
    {
      label: entry.lateEntry ? 'Anotado tardío' : 'Anotado',
      done: entry.noted,
      missed: entry.notedMissed,
      when: entry.noted
        ? `Sem. ${entry.notedWeek || '?'}${entry.notedDate ? ` · ${formatTrackingDateLabel(entry.notedDate)}` : ''}`
        : entry.notedMissed ? 'No lo hizo en tiempo' : 'Pendiente',
    },
    {
      label: 'Levántate',
      done: entry.levantate,
      missed: entry.levantateMissed,
      when: entry.levantate
        ? `Sem. ${entry.levantateWeek || '?'}${entry.levantateDate ? ` · ${formatTrackingDateLabel(entry.levantateDate)}` : ''}`
        : entry.levantateMissed ? 'No asistió en su semana' : 'Pendiente',
    },
    {
      label: 'Restauración',
      done: entry.restauracion,
      missed: entry.restauracionMissed,
      when: entry.restauracion
        ? `Sem. ${entry.restauracionWeek || '?'}${entry.restauracionDate ? ` · ${formatTrackingDateLabel(entry.restauracionDate)}` : ''}`
        : entry.restauracionMissed ? 'No asistió en su semana' : 'Pendiente',
    },
    {
      label: 'Cierre semana 16',
      done: entry.cycleClosed,
      when: entry.cycleClosed
        ? `Sem. ${entry.currentWeek || 16}${entry.lastReportDate ? ` · ${formatTrackingDateLabel(entry.lastReportDate)}` : ''}`
        : 'Pendiente',
    },
  ];
  const periodLabel = scope?.year && scope?.quarter
    ? `Q${scope.quarter} ${scope.year} · Célula ${entry.cellNumber || '—'}`
    : `Histórico · Célula ${entry.cellNumber || '—'}`;
  const statusClass = entry.statusKey === 'complete'
    ? 'is-complete'
    : entry.statusKey === 'outside'
      ? 'is-outside'
      : entry.statusKey === 'missed'
        ? 'is-missed'
      : entry.statusKey === 'progress'
        ? 'is-progress'
        : 'is-pending';

  return `
    <dialog id="seguimiento-control-detail-dialog" class="app-dialog app-dialog-wide">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Seguimiento</p>
          <h3 id="seguimiento-control-detail-title">${escapeHtml(entry.name)} · Control del proceso</h3>
        </div>
        <button id="seguimiento-control-detail-close-btn" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body">
        <div class="friend-control-modal">
          <section class="friend-control-modal-hero">
            <div class="friend-control-modal-headline">
              <p class="friend-control-modal-period">${escapeHtml(periodLabel)}</p>
              <div class="friend-control-modal-headrow">
                <strong class="friend-control-modal-name">${escapeHtml(entry.name)}</strong>
                <span class="friend-process-status friend-process-status-control ${statusClass}">${escapeHtml(entry.statusLabel)}</span>
              </div>
              <p class="friend-control-modal-summary">${escapeHtml(heroSummaryText)}</p>
            </div>
            <div class="friend-control-modal-tags">
              ${(entry.processCount > 1 ? `<span class="friend-control-cycle-badge is-repeat">${escapeHtml(cycleText)}</span>` : `<span class="friend-control-cycle-badge">${escapeHtml(cycleText)}</span>`)}
              <span class="friend-control-modal-tag">Invitó: ${escapeHtml(entry.invitedBy || '—')}</span>
              <span class="friend-control-modal-tag">${escapeHtml(formatTrackingRangeLabel(entry.firstReportDate, entry.lastReportDate))}</span>
            </div>
          </section>

          <section class="friend-control-modal-grid">
            ${entry.statusKey === 'missed' ? '' : `
            <div class="friend-control-detail-card">
              <span class="friend-control-detail-label">Lectura</span>
              <strong class="friend-control-detail-value">${escapeHtml(entry.statusDetail || '—')}</strong>
            </div>
            `}
            <div class="friend-control-detail-card">
              <span class="friend-control-detail-label">Salida backend</span>
              <strong class="friend-control-detail-value">${escapeHtml(outcomeText)}</strong>
            </div>
            <div class="friend-control-detail-card friend-control-detail-card-wide">
              <span class="friend-control-detail-label">Fechas clave</span>
              <div class="friend-control-timeline">
                ${milestoneTimeline.map((milestone) => `
                  <div class="friend-control-timeline-row ${milestone.done ? 'is-done' : milestone.missed ? 'is-missed' : 'is-off'}">
                    <span class="friend-control-timeline-step">${escapeHtml(milestone.label)}</span>
                    <span class="friend-control-timeline-when">${escapeHtml(milestone.when)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>

          <section class="friend-control-modal-section">
            <span class="friend-control-detail-label">Ruta</span>
            <div class="friend-control-route">${escapeHtml(routeItems.join(' · '))}</div>
          </section>

          <section class="friend-control-modal-metrics">
            <article class="friend-control-modal-metric">
              <span class="friend-control-detail-label">Alcance</span>
              <strong>${escapeHtml(String(entry.reachCount || 0))}</strong>
            </article>
            <article class="friend-control-modal-metric">
              <span class="friend-control-detail-label">Culto</span>
              <strong>${escapeHtml(String(entry.sundayCount || 0))}</strong>
            </article>
            <article class="friend-control-modal-metric">
              <span class="friend-control-detail-label">Semana máx</span>
              <strong>${escapeHtml(String(entry.currentWeek || 0))}</strong>
            </article>
            <article class="friend-control-modal-metric">
              <span class="friend-control-detail-label">Histórico</span>
              <strong>${escapeHtml(cycleText)}</strong>
            </article>
          </section>
        </div>
      </div>
      <div class="dialog-footer">
        <button id="seguimiento-control-detail-done-btn" type="button" class="btn btn-ghost">Cerrar</button>
      </div>
    </dialog>
  `;
}

function renderAttendanceDetailDialog(entry) {
  if (!entry) return '';
  const eventDot = (state, label, applicable = true) => {
    if (!applicable) return `<span class="mdl-dot mdl-dot-pending" title="${escapeHtml(label)} aún pendiente (no reportado)">-</span>`;
    if (state === 'present' || state === 'service') return `<span class="mdl-dot mdl-dot-ok" title="${escapeHtml(label)}">✓</span>`;
    if (state === 'justified') return `<span class="mdl-dot mdl-dot-just" title="Justificado en ${escapeHtml(label)}">J</span>`;
    if (state === 'absent') return `<span class="mdl-dot mdl-dot-miss" title="Faltó a ${escapeHtml(label)}">✗</span>`;
    return `<span class="mdl-dot mdl-dot-pending" title="${escapeHtml(label)} sin marcar">-</span>`;
  };
  const visitorEventDot = (attended, label) => attended
    ? `<span class="mdl-dot mdl-dot-ok" title="${escapeHtml(label)}">✓</span>`
    : `<span class="mdl-dot mdl-dot-miss" title="No asistió a ${escapeHtml(label)}">✗</span>`;
  const groups = new Map();
  (Array.isArray(entry.rows) ? entry.rows : []).forEach((row) => {
    const key = `${row.yearNum}-${row.quarter}`;
    if (!groups.has(key)) groups.set(key, { year: row.yearNum, quarter: row.quarter, rows: [] });
    groups.get(key).rows.push(row);
  });
  const orderedGroups = Array.from(groups.values()).sort((left, right) => {
    if (left.year !== right.year) return Number(right.year) - Number(left.year);
    return Number(right.quarter) - Number(left.quarter);
  });
  const bodyMarkup = entry.kind === 'member'
    ? orderedGroups.map((group, index) => {
      const rowsDesc = [...group.rows].sort((left, right) => Number(right.weekNum) - Number(left.weekNum));
      let quarterPresent = 0;
      let quarterAbsent = 0;
      let quarterJust = 0;
      rowsDesc.forEach((row) => {
        [['planApp', 'planning'], ['reachApp', 'reach'], ['sundayApp', 'sunday']].forEach(([appKey, stateKey]) => {
          if (!row[appKey]) return;
          const stateValue = row[stateKey];
          if (stateValue === 'present' || stateValue === 'service') quarterPresent += 1;
          else if (stateValue === 'absent') quarterAbsent += 1;
          else if (stateValue === 'justified') quarterJust += 1;
        });
      });
      return `<details class="mdl-qgroup"${index === 0 ? ' open' : ''}><summary class="mdl-qgroup-summary"><span class="mdl-qgroup-title">Q${escapeHtml(String(group.quarter || ''))} · ${escapeHtml(String(group.year || ''))}</span><span class="mdl-qgroup-stats"><span class="mdl-qchip mdl-qchip-ok" title="Asistencias">${escapeHtml(String(quarterPresent))}✓</span>${quarterAbsent ? `<span class="mdl-qchip mdl-qchip-miss" title="Faltas">${escapeHtml(String(quarterAbsent))}✗</span>` : ''}${quarterJust ? `<span class="mdl-qchip mdl-qchip-just" title="Justificadas">${escapeHtml(String(quarterJust))}J</span>` : ''}<span class="mdl-qchip-weeks">${escapeHtml(String(rowsDesc.length))} sem.</span></span></summary><table class="mdl-table"><thead><tr><th>Sem.</th><th>Fecha</th><th>Plan.</th><th>Alc.</th><th>Culto</th><th>Estado</th></tr></thead><tbody>${rowsDesc.map((row) => {
        const appliedStates = [];
        if (row.planApp) appliedStates.push(row.planning);
        if (row.reachApp) appliedStates.push(row.reach);
        if (row.sundayApp) appliedStates.push(row.sunday);
        const presentCount = appliedStates.filter((stateValue) => stateValue === 'present' || stateValue === 'service').length;
        const absentCount = appliedStates.filter((stateValue) => stateValue === 'absent').length;
        const justifiedCount = appliedStates.filter((stateValue) => stateValue === 'justified').length;
        const pendingCount = appliedStates.filter((stateValue) => !['present', 'service', 'absent', 'justified'].includes(stateValue)).length;
        const allPending = appliedStates.length === 0;
        const missingApplied = absentCount + justifiedCount;
        let rowClass = '';
        let statusBadge = '<span class="mdl-status-badge mdl-status-partial">Parcial</span>';
        if (allPending) statusBadge = '<span class="mdl-status-badge mdl-status-pending">Pendiente</span>';
        else if (presentCount === appliedStates.length) statusBadge = '<span class="mdl-status-badge mdl-status-ok">Completo</span>';
        else if (missingApplied === appliedStates.length) {
          if (justifiedCount === appliedStates.length) {
            rowClass = ' mdl-row-just';
            statusBadge = '<span class="mdl-status-badge mdl-status-just">Justificado</span>';
          } else {
            rowClass = ' mdl-row-falta';
            statusBadge = '<span class="mdl-status-badge mdl-status-absent">Falta</span>';
          }
        } else if (pendingCount > 0 && missingApplied === 0) {
          statusBadge = '<span class="mdl-status-badge mdl-status-pending">En curso</span>';
        }
        return `<tr class="${rowClass}"><td class="mdl-week">${escapeHtml(String(row.weekNum || ''))}</td><td class="mdl-date">${escapeHtml(row.dateLabel || '')}</td><td class="mdl-ev">${eventDot(row.planning, 'Planeación', row.planApp)}</td><td class="mdl-ev">${eventDot(row.reach, 'Alcance', row.reachApp)}</td><td class="mdl-ev">${eventDot(row.sunday, 'Culto', row.sundayApp)}</td><td>${statusBadge}</td></tr>`;
      }).join('')}</tbody></table></details>`;
    }).join('')
    : orderedGroups.map((group, index) => {
      const rowsDesc = [...group.rows].sort((left, right) => Number(right.weekNum) - Number(left.weekNum));
      let quarterReach = 0;
      let quarterSunday = 0;
      rowsDesc.forEach((row) => {
        if (row.reach) quarterReach += 1;
        if (row.sunday) quarterSunday += 1;
      });
      return `<details class="mdl-qgroup"${index === 0 ? ' open' : ''}><summary class="mdl-qgroup-summary"><span class="mdl-qgroup-title">Q${escapeHtml(String(group.quarter || ''))} · ${escapeHtml(String(group.year || ''))}</span><span class="mdl-qgroup-stats"><span class="mdl-qchip mdl-qchip-ok" title="Alcance">A ${escapeHtml(String(quarterReach))}/${escapeHtml(String(rowsDesc.length))}</span><span class="mdl-qchip mdl-qchip-ok" title="Culto">C ${escapeHtml(String(quarterSunday))}/${escapeHtml(String(rowsDesc.length))}</span><span class="mdl-qchip-weeks">${escapeHtml(String(rowsDesc.length))} sem.</span></span></summary><table class="mdl-table"><thead><tr><th>Sem.</th><th>Fecha</th><th>Alc.</th><th>Culto</th><th>Asistencia</th></tr></thead><tbody>${rowsDesc.map((row) => {
        const both = row.reach && row.sunday;
        const none = !row.reach && !row.sunday;
        const rowClass = none ? ' mdl-row-falta' : '';
        const statusBadge = both
          ? '<span class="mdl-status-badge mdl-status-ok">Ambos eventos</span>'
          : !row.reach && row.sunday
            ? '<span class="mdl-status-badge mdl-status-partial">Solo culto</span>'
            : row.reach && !row.sunday
              ? '<span class="mdl-status-badge mdl-status-partial">Solo alcance</span>'
              : '<span class="mdl-status-badge mdl-status-absent">No asistió</span>';
        return `<tr class="${rowClass}"><td class="mdl-week">${escapeHtml(String(row.weekNum || ''))}</td><td class="mdl-date">${escapeHtml(row.dateLabel || '')}</td><td class="mdl-ev">${visitorEventDot(row.reach, 'Alcance')}</td><td class="mdl-ev">${visitorEventDot(row.sunday, 'Culto')}</td><td>${statusBadge}</td></tr>`;
      }).join('')}</tbody></table></details>`;
    }).join('');
  const statsMarkup = entry.kind === 'member'
    ? `<div class="mdl-stat"><strong>${escapeHtml(String(entry.totalWeeks || 0))}</strong><span>semanas</span></div><div class="mdl-stat"><strong class="${entry.totalFaltas > 0 ? 'mdl-stat-bad' : 'mdl-stat-good'}">${escapeHtml(String(entry.totalFaltas || 0))}</strong><span>faltas${entry.totalJust > 0 ? ` <em>(${escapeHtml(String(entry.totalJust || 0))} just.)</em>` : ''}</span></div><div class="mdl-stat-bar"><span class="mdl-stat-pct">${escapeHtml(String(entry.avgPct || 0))}%</span><div class="attend-bar-track mdl-bar-track"><div class="attend-bar-fill ${entry.avgPct >= 80 ? 'attend-bar-good' : entry.avgPct >= 50 ? 'attend-bar-mid' : 'attend-bar-low'}" style="width:${entry.avgPct || 0}%"></div></div><span class="mdl-stat-label">asistencia promedio</span></div><div class="mdl-stat-events"><span class="mdl-ev-chip mdl-ev-p">Plan. <strong>${escapeHtml(String(entry.totalP || 0))}/${escapeHtml(String(entry.appliedP || 0))}</strong></span><span class="mdl-ev-chip mdl-ev-a">Alc. <strong>${escapeHtml(String(entry.totalA || 0))}/${escapeHtml(String(entry.appliedA || 0))}</strong></span><span class="mdl-ev-chip mdl-ev-c">Culto <strong>${escapeHtml(String(entry.totalC || 0))}/${escapeHtml(String(entry.appliedC || 0))}</strong></span></div>`
    : `<div class="mdl-stat"><strong>${escapeHtml(String(entry.totalVisits || 0))}</strong><span>visitas</span></div><div class="mdl-stat"><strong class="mdl-stat-good">${entry.converted ? 'Sí' : 'No'}</strong><span>convertido</span></div>${entry.lateRegistration ? '<div class="mdl-stat"><strong class="mdl-stat-warn">Sí</strong><span>anotado tardío</span></div>' : ''}${entry.invitedBy ? `<div class="mdl-stat"><strong style="font-size:1rem">${escapeHtml(entry.invitedBy)}</strong><span>lo invitó</span></div>` : ''}<div class="mdl-stat-bar"><span class="mdl-stat-pct">${escapeHtml(String(entry.overallPct || 0))}%</span><div class="attend-bar-track mdl-bar-track"><div class="attend-bar-fill ${entry.overallPct >= 80 ? 'attend-bar-good' : entry.overallPct >= 50 ? 'attend-bar-mid' : 'attend-bar-low'}" style="width:${entry.overallPct || 0}%"></div></div><span class="mdl-stat-label">asistencia promedio</span></div><div class="mdl-stat-events"><span class="mdl-ev-chip mdl-ev-a">Alc. <strong>${escapeHtml(String(entry.totalReach || 0))}/${escapeHtml(String(entry.totalVisits || 0))}</strong> (${escapeHtml(String(entry.reachPct || 0))}%)</span><span class="mdl-ev-chip mdl-ev-c">Culto <strong>${escapeHtml(String(entry.totalSunday || 0))}/${escapeHtml(String(entry.totalVisits || 0))}</strong> (${escapeHtml(String(entry.sundayPct || 0))}%)</span></div>`;

  return `
    <dialog id="seguimiento-attendance-detail-dialog" class="member-modal">
      <div class="member-modal-inner">
        <div class="member-modal-head">
          <div>
            <p class="eyebrow">${escapeHtml(entry.periodLabel || '')}</p>
            <h2 id="seguimiento-attendance-detail-title">${escapeHtml(entry.name || '')}</h2>
          </div>
          <button id="seguimiento-attendance-detail-close-btn" type="button" class="member-modal-close" aria-label="Cerrar">✕</button>
        </div>
        <div class="member-modal-stats">${statsMarkup}</div>
        <div class="member-modal-body">${bodyMarkup}</div>
      </div>
    </dialog>
  `;
}

function getQuarterName(quarter) {
  return `Q${quarter}`;
}

function getQuarterRangeLabel(quarter) {
  if (quarter === '1') return 'Ene-Abr';
  if (quarter === '2') return 'May-Ago';
  return 'Sep-Dic';
}

function whatsappIconSvg(size = 14) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" style="vertical-align:-2px;display:inline-block">
    <path fill="#25D366" d="M16 .395C7.164.395 0 7.559 0 16.395c0 2.84.74 5.598 2.146 8.025L0 32l7.832-2.054a16.073 16.073 0 0 0 8.168 2.244h.007C24.844 32.19 32 25.026 32 16.19 32 7.355 24.836.394 16 .394Z"/>
    <path fill="#FFF" d="M23.42 19.396c-.314-.158-1.86-.918-2.149-1.022-.288-.105-.498-.158-.708.157-.21.314-.812 1.022-.996 1.232-.184.21-.367.236-.681.078-.314-.157-1.327-.489-2.527-1.56-.935-.834-1.567-1.864-1.751-2.179-.184-.314-.02-.484.138-.641.142-.142.314-.367.472-.55.158-.184.21-.315.314-.524.105-.21.053-.394-.026-.551-.078-.157-.708-1.708-.97-2.339-.255-.613-.515-.53-.708-.54-.184-.01-.394-.012-.604-.012-.21 0-.55.079-.838.393-.288.314-1.1 1.075-1.1 2.625 0 1.55 1.126 3.049 1.283 3.259.158.21 2.215 3.379 5.367 4.741.75.324 1.337.518 1.793.663.753.24 1.438.206 1.98.125.604-.09 1.86-.76 2.122-1.494.262-.733.262-1.36.184-1.494-.078-.131-.288-.21-.602-.367Z"/>
  </svg>`;
}

function downloadIconSvg(size = 14) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;display:inline-block">
    <path d="M12 3v12"/>
    <path d="m7 10 5 5 5-5"/>
    <path d="M5 21h14"/>
  </svg>`;
}

function renderWeekChips(card) {
  return `
    <div class="cycle-chips-grid" aria-label="Semanas del ciclo">
      ${card.weekChips.map((chip) => `
        <button
          type="button"
          class="cycle-week-chip${chip.state === 'done' ? ` is-done phase-chip-${escapeHtml(chip.phase)}` : chip.state === 'draft' ? ` is-draft phase-chip-${escapeHtml(chip.phase)}` : chip.state === 'capturable' ? ' is-pending is-capturable' : ' is-pending'}"
          ${chip.reportId ? `data-action="view-report" data-id="${escapeHtml(chip.reportId)}" data-card-key="${escapeHtml(card.key)}"` : chip.state === 'capturable' ? `data-action="new-report-for-cell" data-cell="${escapeHtml(card.cellNumber)}" data-week="${escapeHtml(chip.week)}"` : 'disabled'}
          title="Semana ${chip.week} · ${escapeHtml(chip.verb || chip.phaseLabel)}${chip.reportDate ? ` · ${escapeHtml(formatSeguimientoDate(chip.reportDate))}` : ''}"
        >
          <span class="cycle-chip-num">${escapeHtml(chip.week)}</span>
          <span class="cycle-chip-verb">${escapeHtml(chip.verb || '-')}</span>
          ${chip.isEventWeek ? '<span class="cycle-chip-star">★</span>' : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function renderSegTabs(state) {
  const tabs = Array.isArray(state.segTabs) ? state.segTabs : [];
  if (!tabs.length) return '';
  const activeTab = tabs.find((tab) => tab.key === state.activeTab) || tabs[0];
  return `
    <div class="seg-view-mobile-switch">
      <label class="seg-view-mobile-label" for="seg-view-mobile-button">Vista</label>
      <div class="seg-view-mobile-picker" id="seg-view-mobile-picker">
        <button type="button" id="seg-view-mobile-button" class="seg-view-mobile-button" data-action="toggle-tab-menu" aria-haspopup="listbox" aria-expanded="false">
          <span id="seg-view-mobile-button-text">${escapeHtml(activeTab?.label || '')}</span>
        </button>
        <div id="seg-view-mobile-menu" class="seg-view-mobile-menu" role="listbox" hidden>
          ${tabs.map((tab) => `
            <button type="button" class="seg-view-mobile-option${tab.key === state.activeTab ? ' is-active' : ''}" data-action="change-tab-menu" data-tab="${escapeHtml(tab.key)}" role="option" aria-selected="${tab.key === state.activeTab ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="seg-view-tabs" id="seg-view-tab-bar">
      ${tabs.map((tab) => `
        <button type="button" class="seg-view-tab${tab.key === state.activeTab ? ' is-active' : ''}" data-action="change-tab" data-tab="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>
      `).join('')}
    </div>
  `;
}

function renderScopeState(tab, wrapperClass = 'rcs-scope-bridge') {
  if (!tab) return '';
  return `
    <div class="${escapeHtml(wrapperClass)}">
      <div class="dashboard-scope-state rcs-scope-state" role="status" aria-live="polite">
        <span class="dashboard-scope-state-label">${escapeHtml(tab.label)}</span>
        ${tab.sublabel ? `<span class="dashboard-scope-state-sub">${escapeHtml(tab.sublabel)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderScopedPanelBundle(scopeMarkup, panelMarkup, bundleClass = '') {
  if (!panelMarkup) return '';
  if (!scopeMarkup) return panelMarkup;
  return `
    <div class="seg-scope-panel-bundle full-width${bundleClass ? ` ${escapeHtml(bundleClass)}` : ''}">
      ${scopeMarkup}
      ${panelMarkup}
    </div>
  `;
}

function getSummaryPreviewCount() {
  if (typeof window === 'undefined') return 4;
  const width = Number(window.innerWidth || 0);
  if (width <= 520) return 2;
  if (width <= 900) return 3;
  if (width <= 1320) return 4;
  return 5;
}

function getVisibleSummaryCards(cards, showAllCards) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const previewCount = Math.max(1, getSummaryPreviewCount());
  const previewCards = safeCards.slice(0, previewCount);
  const visibleCards = showAllCards ? safeCards : previewCards;
  const hiddenCount = Math.max(0, safeCards.length - previewCards.length);
  return { visibleCards, hiddenCount };
}

function renderScopeTabs(state) {
  const tabs = Array.isArray(state.scopeTabs) ? state.scopeTabs : [];
  if (!tabs.length || state.activeTab !== 'goals') return '';
  if (tabs.length === 1) {
    return '';
  }
  return `
    <div class="rcs-scope-bridge seg-scope-panel-bridge goals-scope-tabs-bridge">
      <div id="seg-access-scope-tabs" class="dashboard-scope-tabs rcs-scope-tabs seg-access-scope-tabs" role="tablist">
        ${tabs.map((tab) => `
          <button type="button" class="dashboard-scope-tab${tab.key === state.accessScope ? ' is-active' : ''}" data-action="change-access-scope" data-scope="${escapeHtml(tab.key)}" role="tab" aria-selected="${tab.key === state.accessScope}">
            ${escapeHtml(tab.label)}
            ${tab.sublabel ? `<span class="scope-tab-sub">${escapeHtml(tab.sublabel)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderIntegratedScopeTabs(state) {
  const tabs = Array.isArray(state.scopeTabs) ? state.scopeTabs : [];
  if (!tabs.length || state.activeTab !== 'seguimiento') return '';
  if (tabs.length === 1) {
    return renderScopeState(tabs[0]);
  }
  return `
    <div class="rcs-scope-bridge">
      <div class="dashboard-scope-tabs rcs-scope-tabs" role="tablist">
        ${tabs.map((tab) => `
          <button type="button" class="dashboard-scope-tab${tab.key === state.accessScope ? ' is-active' : ''}" data-action="change-access-scope" data-scope="${escapeHtml(tab.key)}" role="tab" aria-selected="${tab.key === state.accessScope}">
            ${escapeHtml(tab.label)}
            ${tab.sublabel ? `<span class="scope-tab-sub">${escapeHtml(tab.sublabel)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderWeekContext(state) {
  const context = state.weekContext;
  if (!context || state.activeTab !== 'seguimiento') return '';
  return `
    <div class="report-context-strip" id="report-context-strip">
      ${renderIntegratedScopeTabs(state)}
      <div class="filter-tabs rcs-week-tabs" id="seg-week-offset-tabs"${context.showWeekOffsetTabs ? '' : ' hidden'}>
        <button type="button" class="filter-tab${context.weekOffset === -1 ? ' is-active' : ''}" data-action="change-week-offset" data-weekoff="-1">${escapeHtml(context.previousVerb)}</button>
        <button type="button" class="filter-tab${context.weekOffset === 0 ? ' is-active' : ''}" data-action="change-week-offset" data-weekoff="0">${escapeHtml(context.currentVerb)}</button>
      </div>
      <div class="rcs-cols">
        <div class="rcs-col">
          <span class="rcs-label">${escapeHtml(context.scopeLabel ? `${context.isPreviousWeek ? context.previousVerb : context.currentVerb} · ${context.scopeLabel}` : (context.isPreviousWeek ? context.previousVerb : context.currentVerb))}</span>
          <div class="rcs-chips" id="rcs-pending">
            ${context.pendingCells.length
              ? context.pendingCells.map((cell) => `<span class="rcs-chip rcs-chip-pending">Célula ${escapeHtml(String(cell.cellNumber || ''))} · Sector ${escapeHtml(String(cell.sector || '-'))}</span>`).join('')
              : '<span class="rcs-empty">Todas reportaron ✓</span>'}
          </div>
        </div>
        <div class="rcs-divider"></div>
        <div class="rcs-col">
          <span class="rcs-label">${context.isPreviousWeek ? 'Reportaron la semana anterior' : 'Reportaron esta semana'}</span>
          <div class="rcs-chips" id="rcs-activity">
            ${context.weeklyReports.length
              ? context.weeklyReports.map((report) => {
                const cellNumber = String(report?.cellNumber || report?.formData?.cellNumber || '');
                const leaderName = String(report?.leaderName || report?.formData?.leaderName || '-');
                return `<button type="button" class="rcs-chip ${report?.formData?._draft === true || report?.formData?._draft === 'true' ? 'rcs-chip-draft' : 'rcs-chip-done'}" data-action="goto-cell" data-cell="${escapeHtml(cellNumber)}" title="${escapeHtml(leaderName)}">Célula ${escapeHtml(cellNumber)}<span class="rcs-leader-full"> · ${escapeHtml(leaderName)}</span>${report?.formData?._draft === true || report?.formData?._draft === 'true' ? ' · borrador' : ''}</button>`;
              }).join('')
              : '<span class="rcs-empty">Sin reportes todavía</span>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTotalsPanel(state) {
  const totals = state.totals;
  if (!totals || state.activeTab !== 'seguimiento') return '';
  return `
    <section class="panel panel-soft" id="seg-totals-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow" id="seg-totals-eyebrow">${escapeHtml(state.weekContext?.isPreviousWeek ? state.weekContext.previousVerb : state.weekContext?.currentVerb || 'Semana')}</p>
          <h2>Totales de asistencia</h2>
        </div>
        <div class="seg-totals-scope-tabs">
          ${totals.availableScopes.map((scope) => `
            <button type="button" class="seg-totals-tab${scope === totals.selectedScope ? ' is-active' : ''}" data-action="change-totals-scope" data-scope="${escapeHtml(scope)}">${escapeHtml(scope === 'total' ? 'Total' : scope === 'sector' ? 'Por sector' : 'Por célula')}</button>
          `).join('')}
          <label class="seg-totals-toggle" title="Mostrar montos de ofrenda">
            <input type="checkbox" id="seg-totals-show-offering"${state.showOffering ? ' checked' : ''}>
            Mostrar ofrenda
          </label>
        </div>
      </div>
      <div id="seg-totals-body">
        ${totals.selectedScope === 'total'
          ? `<div class="tot-scope-total">${totals.groups.map((group) => group.html).join('')}</div>`
          : `<div class="tot-scope-grid">${totals.groups.map((group) => group.html).join('')}</div>`}
      </div>
    </section>
  `;
}

function renderPlaceholderPanel(title) {
  return `
    <section class="panel panel-soft full-width seguimiento-next-shell">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Seguimiento</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <p class="empty-state" style="padding:16px 0">Esta sub-vista sigue pendiente de modularizar desde el original. El shell y la vista de Seguimiento ya están entrando primero.</p>
    </section>
  `;
}

function renderMetasPanel(state) {
  const metas = state.metasData || null;
  const loading = Boolean(state.metasLoading);
  const scope = metas?.scope || {};
  const summary = metas?.summary || {};
  const goals = metas?.goals || {};
  const goalProgress = metas?.goalProgress || {};
  const scopedCells = Array.isArray(state.metasCells) ? state.metasCells : [];
  const selectedCell = String(state.metasCellFilter || '');
  const showCellFilter = state.accessScope !== 'cell' && scopedCells.length > 1;
  const controlEntries = Array.isArray(state.processControlEntries) ? state.processControlEntries : [];
  const controlDetailEntry = state.controlDetailEntry || null;

  const quarterLabel = scope.year && scope.quarter
    ? ` · Q${escapeHtml(String(scope.quarter))}/${escapeHtml(String(scope.year))}`
    : '';

  const showCellBadge = !selectedCell && scopedCells.length > 1;

  const keyFollowUp = summary.keyFollowUp || null;
  const summaryCards = [
    { label: 'Amigos activos', value: String(summary.activeFriends || 0), hint: 'con alcance o culto en el periodo', accent: 'accent-faith' },
    { label: 'Padres espirituales', value: String(summary.spiritualParents || 0), hint: 'personas trayendo amigos en el ciclo', accent: 'accent-success' },
    { label: 'Recurrentes', value: String(summary.recurrentFriends || 0), hint: '2 o más entradas al proceso', accent: 'accent-neutral' },
    { label: 'Largo plazo', value: String(summary.longTermFriends || 0), hint: 'historial de 1 año o más', accent: 'accent-neutral' },
    {
      label: 'Seguimiento clave',
      value: keyFollowUp ? `${String(keyFollowUp.name || '')} · ${String(keyFollowUp.processCount || 0)} veces` : '-',
      hint: keyFollowUp ? 'caso con mayor continuidad' : 'sin caso destacado en este periodo',
      accent: 'accent-faith friend-summary-card-key',
    },
  ];
  const metasSummaryView = getVisibleSummaryCards(summaryCards, Boolean(state.showAllMetasSummaryCards));

  const goalItems = [
    { label: 'Levántate', goal: Number(goals.levantateGoal) || 0, achieved: Number(goalProgress.levantate) || 0 },
    { label: 'Restauración', goal: Number(goals.restauracionGoal) || 0, achieved: Number(goalProgress.restauracion) || 0 },
    { label: 'Bautismos', goal: Number(goals.bautismosGoal) || 0, achieved: Number(goalProgress.bautismos) || 0 },
  ];

  const notedCount = controlEntries.filter((e) => e.noted).length;
  const completeCount = controlEntries.filter((e) => e.complete).length;
  const pendingCount = controlEntries.filter((e) => e.noted && !e.complete).length;
  const repeatCount = controlEntries.filter((e) => (e.processCount || 0) > 1).length;
  const outsideCohortCount = controlEntries.filter((e) => e.outsideCohort).length;
  const controlCellNumbers = [...new Set(controlEntries.map((entry) => String(entry.cellNumber || '').trim()).filter(Boolean))];
  const shouldGroupControlByCell = state.accessScope !== 'cell' && controlCellNumbers.length > 1;

  const renderControlCard = (entry, options = {}) => {
    const statusClass = entry.statusKey === 'complete' ? 'is-complete'
      : entry.statusKey === 'outside' ? 'is-outside'
      : entry.statusKey === 'missed' ? 'is-missed'
      : entry.statusKey === 'progress' ? 'is-progress'
      : 'is-pending';
    const cohortLabel = entry.noted ? (entry.lateEntry ? 'Anotado tardío' : 'Anotado') : 'No anotado';
    const milestoneItems = [
      { label: cohortLabel, accent: entry.noted ? 'is-done' : entry.notedMissed ? 'is-missed' : 'is-off' },
      { label: 'Levántate', accent: entry.levantate ? 'is-done' : entry.levantateMissed ? 'is-missed' : 'is-off' },
      { label: 'Restauración', accent: entry.restauracion ? 'is-done' : entry.restauracionMissed ? 'is-missed' : 'is-off' },
      { label: 'Cierre sem. 16', accent: entry.cycleClosed ? 'is-done' : 'is-off' },
    ];
    const cycleText = entry.processCount > 1 ? `${entry.processCount} ciclos en histórico` : `${entry.processCount || 0} ciclo${entry.processCount === 1 ? ' en histórico' : 's'}`;
    const dateRange = formatTrackingRangeLabel(entry.firstReportDate, entry.lastReportDate);
    const cellBadge = options.showCellBadge && entry.cellNumber
      ? `<span class="friend-process-cell-badge friend-process-footer-badge">Célula ${escapeHtml(String(entry.cellNumber))}</span>`
      : '';
    return `
      <article class="friend-process-item friend-control-item">
        <div class="friend-control-main">
          <div class="friend-process-head friend-control-row-head">
            <div class="friend-control-heading">
              <strong class="friend-process-name">${escapeHtml(entry.name)}</strong>
              ${entry.processCount > 1 ? `<span class="friend-control-cycle-badge is-repeat">${escapeHtml(cycleText)}</span>` : ''}
            </div>
            <span class="friend-process-status friend-process-status-control ${statusClass}">${escapeHtml(entry.statusLabel)}</span>
          </div>
          <div class="friend-control-summary">
            <div class="friend-control-summary-sub">Alcance ${escapeHtml(String(entry.reachCount || 0))} · Culto ${escapeHtml(String(entry.sundayCount || 0))} · Semana máx ${escapeHtml(String(entry.currentWeek || 0))}</div>
          </div>
          <div class="friend-control-milestones">
            ${milestoneItems.map((m) => `<span class="friend-control-milestone ${m.accent}">${escapeHtml(m.label)}</span>`).join('')}
          </div>
        </div>
        <div class="friend-control-side">
          <span class="friend-control-footer-meta">${escapeHtml(dateRange)}</span>
          <span class="friend-process-footer-actions friend-control-side-actions">
            <button type="button" class="friend-process-detail-btn" data-action="open-control-detail" data-control-key="${escapeHtml(entry.key)}">Detalle</button>
            ${cellBadge}
          </span>
        </div>
      </article>
    `;
  };

  const renderControlContent = () => {
    if (!controlEntries.length) {
      return '<p class="empty-state" style="padding:16px 0">Sin amigos en el proceso para este cuatrimestre.</p>';
    }
    if (!shouldGroupControlByCell) {
      const showGroupedCellBadge = state.accessScope !== 'cell' && controlCellNumbers.length === 1;
      return controlEntries.map((entry) => renderControlCard(entry, { showCellBadge: showGroupedCellBadge })).join('');
    }

    const groupedControl = new Map();
    controlEntries.forEach((entry) => {
      const cellNumber = String(entry.cellNumber || '').trim() || 'Sin célula';
      if (!groupedControl.has(cellNumber)) groupedControl.set(cellNumber, []);
      groupedControl.get(cellNumber).push(entry);
    });

    const orderedGroupedControl = [...groupedControl.entries()].sort(([leftCell], [rightCell]) => {
      const leftIsNumeric = /^\d+$/.test(leftCell);
      const rightIsNumeric = /^\d+$/.test(rightCell);
      if (leftIsNumeric && rightIsNumeric) return Number(leftCell) - Number(rightCell);
      if (leftIsNumeric) return -1;
      if (rightIsNumeric) return 1;
      return leftCell.localeCompare(rightCell, 'es', { numeric: true, sensitivity: 'base' });
    });

    return orderedGroupedControl.map(([cellNumber, items]) => {
      const label = /^\d+$/.test(cellNumber) ? `Célula ${cellNumber}` : cellNumber;
      const subtitle = `${items.length} ${items.length === 1 ? 'caso' : 'casos'}`;
      return `
        <details class="friend-process-group friend-control-group">
          <summary class="friend-process-group-summary">
            <div class="friend-process-group-heading">
              <strong class="friend-process-group-title">${escapeHtml(label)}</strong>
              <span class="friend-process-group-count">${escapeHtml(subtitle)}</span>
            </div>
            <span class="friend-process-group-toggle" aria-hidden="true">Ver</span>
          </summary>
          <div class="friend-process-group-grid">
            ${items.map((entry) => renderControlCard(entry, { showCellBadge: false })).join('')}
          </div>
        </details>
      `;
    }).join('');
  };

  return `
    <div class="seguimiento-next-shell">
      <section class="panel panel-soft full-width" id="friend-tracking-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow" id="friend-tracking-goals-eyebrow">Meta cuatrimestral</p>
            <h2 id="friend-tracking-goals-title">${metas ? 'En curso' : 'Objetivos RCM por célula'}</h2>
          </div>
          <div class="friend-tracking-head-tools">
            ${showCellFilter ? `
              <select class="form-select friend-tracking-cell-filter-native" data-action="change-metas-cell" style="height:32px;padding:2px 8px;font-size:.85rem" aria-label="Filtrar por célula">
                <option value="">Vista general</option>
                ${scopedCells.map((cell) => `<option value="${escapeHtml(String(cell || ''))}"${selectedCell === String(cell || '') ? ' selected' : ''}>Célula ${escapeHtml(String(cell || ''))}</option>`).join('')}
              </select>
            ` : ''}
            ${scope.year && scope.quarter ? `<span class="count-chip">Q${escapeHtml(String(scope.quarter))}/${escapeHtml(String(scope.year))}</span>` : ''}
          </div>
        </div>
        ${loading && !metas ? '<p class="empty-state" style="padding:16px 0">Cargando datos…</p>' : ''}
        ${!loading && !metas ? '<p class="empty-state" style="padding:16px 0">Sin datos para el periodo actual.</p>' : ''}
        ${metas ? `
          <div id="friend-tracking-summary-grid" class="summary-grid">
            ${metasSummaryView.visibleCards.map(({ label, value, hint, accent }) => `
              <article class="summary-card summary-card-dashboard friend-summary-card ${escapeHtml(accent || '')}">
                <span class="summary-label">${escapeHtml(label)}</span>
                <strong class="summary-value">${escapeHtml(value)}</strong>
                <span class="summary-hint">${escapeHtml(hint)}</span>
              </article>
            `).join('')}
          </div>
          ${metasSummaryView.hiddenCount ? `
            <div class="seg-summary-mobile-actions">
              <button type="button" class="btn-ghost catalog-mobile-more" data-action="toggle-metas-summary-cards" aria-expanded="${state.showAllMetasSummaryCards ? 'true' : 'false'}">${state.showAllMetasSummaryCards ? 'Ver menos' : `Ver ${metasSummaryView.hiddenCount} más`}</button>
            </div>
          ` : ''}
        ` : ''}
      </section>
      ${metas ? `
        <section class="panel panel-soft full-width friend-tracking-detail-panel">
          <div class="friend-tracking-layout">
            <div class="friend-tracking-main">
              <section class="friend-tracking-card friend-tracking-card-control">
              <div class="friend-tracking-card-head friend-tracking-card-head-accent friend-tracking-card-head-gold">
                <div>
                  <h3>Control del proceso</h3>
                  <p class="friend-tracking-card-copy">Compara la cohorte anotada contra los hitos reales del cuatrimestre.</p>
                </div>
              </div>
              <div class="friend-tracking-chip-row friend-tracking-chip-row-inline">
                ${[
                  ['Anotados', notedCount, 'friend-tracking-count-chip-control'],
                  ['Trayecto completo', completeCount, 'friend-tracking-count-chip-control'],
                  ['Pendientes', pendingCount, 'friend-tracking-count-chip-control'],
                  ['Más de un ciclo', repeatCount, 'friend-tracking-count-chip-control'],
                  ['Fuera de cohorte', outsideCohortCount, 'friend-tracking-count-chip-control'],
                ].map(([label, value, cls]) => `
                  <span class="count-chip friend-tracking-count-chip ${cls}">
                    <span class="friend-tracking-count-label">${escapeHtml(String(label))}</span>
                    <strong class="friend-tracking-count-value">${escapeHtml(String(value))}</strong>
                  </span>
                `).join('')}
              </div>
              <div class="friend-tracking-friends-grid friend-tracking-control-list${shouldGroupControlByCell ? ' is-grouped' : ''}">
                ${renderControlContent()}
              </div>
              </section>
            </div>
            <aside class="friend-tracking-side">
              <details class="friend-tracking-card friend-tracking-card-goals friend-tracking-collapse friend-tracking-goals-band" open>
                <summary class="friend-tracking-card-head friend-tracking-card-head-accent friend-tracking-card-head-green friend-tracking-collapse-head">
                  <h3>Metas del cuatrimestre</h3>
                </summary>
                <div class="friend-tracking-goals-list">
                  ${goalItems.map(({ label, goal, achieved }) => {
                    const target = Number(goal) || 0;
                    const done = Number(achieved) || 0;
                    const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : (done > 0 ? 100 : 0);
                    const remaining = Math.max(target - done, 0);
                    const foot = remaining > 0 ? `Faltan ${remaining}` : 'Meta alcanzada ✓';
                    return `
                      <div class="friend-tracking-goal-row friend-tracking-goal-progress-row">
                        <div class="friend-tracking-goal-topline">
                          <span class="friend-tracking-goal-label">${escapeHtml(label)}</span>
                          <strong class="friend-tracking-goal-value">${escapeHtml(String(done))}/${escapeHtml(String(target))}</strong>
                        </div>
                        <div class="friend-tracking-goal-bar" aria-hidden="true">
                          <div class="friend-tracking-goal-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="friend-tracking-goal-foot">${escapeHtml(foot)}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </details>
            </aside>
          </div>
        </section>
        ${renderControlDetailDialog(scope, controlDetailEntry)}
      ` : ''}
    </div>
  `;
}

function renderDashboardScopeTabs(state) {
  const tabs = Array.isArray(state.scopeTabs) ? state.scopeTabs : [];
  if (!tabs.length || state.activeTab !== 'dashboard') return '';
  if (tabs.length === 1) {
    return renderScopeState(tabs[0], 'rcs-scope-bridge seg-scope-panel-bridge dashboard-scope-bridge');
  }
  return `
    <div class="rcs-scope-bridge seg-scope-panel-bridge dashboard-scope-tabs-bridge">
      <div class="dashboard-scope-tabs rcs-scope-tabs" role="tablist">
        ${tabs.map((tab) => `
          <button type="button" class="dashboard-scope-tab${tab.key === state.accessScope ? ' is-active' : ''}" data-action="change-access-scope" data-scope="${escapeHtml(tab.key)}" role="tab" aria-selected="${tab.key === state.accessScope}">
            ${escapeHtml(tab.label)}
            ${tab.sublabel ? `<span class="scope-tab-sub">${escapeHtml(tab.sublabel)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDashboardPanel(state) {
  const data = state.dashboardData;
  if (state.activeTab !== 'dashboard') return '';
  const timeScope = String(data?.timeScope || 'week');
  const summaryCards = Array.isArray(data?.summaryCards) ? data.summaryCards : [];
  const pendingCells = Array.isArray(data?.pendingCells) ? data.pendingCells : [];
  const recentReports = Array.isArray(data?.recentReports) ? data.recentReports : [];
  const baptismYears = Array.isArray(data?.baptismYears) ? data.baptismYears : [];
  const metrics = data?.periodMetrics || {};
  const baptisms = Number(data?.baptismTotal || 0);
  const filteredReports = Array.isArray(data?.filteredReports) ? data.filteredReports : [];
  const alerts = data?.alerts || { current: [], previous: [], emptyMessage: 'Sin alertas.' };
  const selectedMeta = data?.selectedMeta || {};
  const activeAttendTab = String(state?.dashboardAttendanceTab || 'hermanos') === 'amigos' ? 'amigos' : 'hermanos';
  const attendanceDetailEntry = state.attendanceDetailEntry || null;
  const normalizeVisitorName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const stageReached = (formData, stageName) => {
    const order = ['encabezado', 'planificacion', 'alcance', 'culto', 'cierre'];
    if (formData && formData._draft !== true && formData._draft !== 'true') return true;
    const last = String(formData?.lastStage || '').trim();
    if (!last) return false;
    return order.indexOf(last) >= order.indexOf(stageName);
  };
  const getQuarterLabel = (quarter) => {
    const q = String(quarter || '');
    if (q === '1') return '1ER CUATRIMESTRE';
    if (q === '2') return '2DO CUATRIMESTRE';
    if (q === '3') return '3ER CUATRIMESTRE';
    return `Q${q}`;
  };
  const getBaptismCountLabel = (value) => {
    const count = Number(value || 0);
    return `${count} ${count === 1 ? 'bautismo' : 'bautismos'}`;
  };
  const getQuarterRange = (quarter) => {
    if (String(quarter) === '1') return 'Ene-Abr';
    if (String(quarter) === '2') return 'May-Ago';
    return 'Sep-Dic';
  };
  const memberStats = new Map();
  const visitorStats = new Map();
  if (timeScope !== 'week') {
    filteredReports.forEach((report) => {
      const formData = report?.formData || {};
      const planApplied = stageReached(formData, 'planificacion');
      const reachApplied = stageReached(formData, 'alcance');
      const sundayApplied = stageReached(formData, 'culto');
      const members = Array.isArray(formData.memberAttendance) ? formData.memberAttendance : [];
      members.forEach((entry) => {
        const key = String(entry?.personId || entry?.name || '').trim();
        if (!key) return;
        const prev = memberStats.get(key) || {
          key,
          detailKey: key,
          name: String(entry?.name || '').trim(),
          planPresent: 0,
          reachPresent: 0,
          sundayPresent: 0,
          planApplied: 0,
          reachApplied: 0,
          sundayApplied: 0,
          absent: 0,
          justified: 0,
        };
        if (planApplied) {
          prev.planApplied += 1;
          if (entry?.planningAttended) prev.planPresent += 1;
          else if (String(entry?.planningStatus || '').toLowerCase() === 'justified') prev.justified += 1;
          else prev.absent += 1;
        }
        if (reachApplied) {
          prev.reachApplied += 1;
          if (entry?.reachAttended) prev.reachPresent += 1;
          else if (String(entry?.reachStatus || '').toLowerCase() === 'justified') prev.justified += 1;
          else prev.absent += 1;
        }
        if (sundayApplied) {
          prev.sundayApplied += 1;
          if (entry?.sundayAttended) prev.sundayPresent += 1;
          else if (String(entry?.sundayStatus || '').toLowerCase() === 'justified') prev.justified += 1;
          else prev.absent += 1;
        }
        memberStats.set(key, prev);
      });

      const visitors = Array.isArray(formData.visitors) ? formData.visitors : [];
      visitors.forEach((visitor) => {
        const norm = normalizeVisitorName(visitor?.name || '');
        if (!norm) return;
        const prev = visitorStats.get(norm) || {
          detailKey: norm,
          name: String(visitor?.name || '').trim(),
          visits: 0,
          reachCount: 0,
          sundayCount: 0,
          kind: 'amigo',
        };
        prev.visits += 1;
        if (visitor?.reachAttended) prev.reachCount += 1;
        if (visitor?.sundayAttended) prev.sundayCount += 1;
        if (String(visitor?.kind || 'amigo').toLowerCase() === 'visita') prev.kind = 'visita';
        visitorStats.set(norm, prev);
      });
    });
  }
  const memberRows = [...memberStats.values()].sort((left, right) => {
    const leftApplied = left.planApplied + left.reachApplied + left.sundayApplied;
    const rightApplied = right.planApplied + right.reachApplied + right.sundayApplied;
    const leftPct = leftApplied > 0 ? (left.planPresent + left.reachPresent + left.sundayPresent) / leftApplied : 0;
    const rightPct = rightApplied > 0 ? (right.planPresent + right.reachPresent + right.sundayPresent) / rightApplied : 0;
    return leftPct - rightPct || String(left.name || '').localeCompare(String(right.name || ''));
  });
  const visitorRows = [...visitorStats.values()].sort((left, right) => right.visits - left.visits || String(left.name || '').localeCompare(String(right.name || '')));
  const restorationCount = visitorRows.filter((entry) => entry.kind === 'visita').length;
  const periodLabel = timeScope === 'quarter'
    ? `Cuatrimestre ${getQuarterRange(selectedMeta?.quarter)} ${selectedMeta?.year || ''}`.trim()
    : `Año ${selectedMeta?.year || ''}`.trim();
  const trendMiniDonut = (value, total, cls) => {
    const hasTotal = Number(total || 0) > 0;
    const pct = hasTotal ? Math.max(0, Math.min(1, Number(value || 0) / Number(total || 1))) : 0;
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const dash = (pct * circumference).toFixed(2);
    const gap = (circumference - (pct * circumference)).toFixed(2);
    const pctText = hasTotal ? `${Math.round(pct * 100)}%` : '';
    const subText = hasTotal ? `${Number(value || 0)}/${Number(total || 0)}` : `${Number(value || 0)}`;
    const titleText = hasTotal ? `${Number(value || 0)} de ${Number(total || 0)} (${pctText})` : `${Number(value || 0)}`;
    return `<div class="trend-cell trend-cell-donut" title="${escapeHtml(titleText)}"><svg class="trend-donut trend-donut-${escapeHtml(cls)}" viewBox="0 0 36 36" aria-hidden="true"><circle class="trend-donut-track" cx="18" cy="18" r="${radius}" fill="none" stroke-width="4"></circle><circle class="trend-donut-fill" cx="18" cy="18" r="${radius}" fill="none" stroke-width="4" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 18 18)"></circle><text class="trend-donut-text" x="18" y="18" text-anchor="middle" dominant-baseline="central">${escapeHtml(hasTotal ? pctText : String(Number(value || 0)))}</text></svg><span class="trend-donut-sub">${escapeHtml(subText)}</span></div>`;
  };
  const quarterTrendRows = timeScope === 'quarter'
    ? [...filteredReports].sort((left, right) => {
      const lWeek = Number(left?.formData?.week || left?.week || 0);
      const rWeek = Number(right?.formData?.week || right?.week || 0);
      if (lWeek !== rWeek) return lWeek - rWeek;
      const lDate = String(left?.reportDate || left?.formData?.reportDate || '');
      const rDate = String(right?.reportDate || right?.formData?.reportDate || '');
      return lDate.localeCompare(rDate);
    }).map((report) => {
      const summary = report?.formData?.attendanceSummary || {};
      const reportDate = String(report?.reportDate || report?.formData?.reportDate || '');
      const visitors = Array.isArray(report?.formData?.visitors) ? report.formData.visitors : [];
      const friends = visitors.filter((entry) => String(entry?.kind || 'amigo').toLowerCase() !== 'visita' && String(entry?.name || '').trim());
      return {
        week: Number(report?.formData?.week || report?.week || 0),
        dateLabel: reportDate ? formatSeguimientoDate(reportDate) : '',
        totalMembers: Number(summary?.totalMembers || 0),
        planningPresent: Number(summary?.planningMembersPresent || 0),
        reachPresent: Number(summary?.reachMembersPresent || 0),
        sundayPresent: Number(summary?.sundayMembersPresent || 0),
        friendsReach: Number(summary?.reachFriendsPresent || summary?.visitors || 0),
        friendsSunday: Number(summary?.sundayFriendsPresent || 0),
        conversions: Number(summary?.reachConversions || 0),
        friendsReachNames: friends.filter((entry) => entry?.reachAttended).map((entry) => String(entry?.name || '').trim()),
        friendsSundayNames: friends.filter((entry) => entry?.sundayAttended).map((entry) => String(entry?.name || '').trim()),
      };
    })
    : [];
  const quarterTrendTotals = quarterTrendRows.reduce((acc, row) => ({
    planningPresent: acc.planningPresent + row.planningPresent,
    reachPresent: acc.reachPresent + row.reachPresent,
    sundayPresent: acc.sundayPresent + row.sundayPresent,
    friendsReach: acc.friendsReach + row.friendsReach,
    friendsSunday: acc.friendsSunday + row.friendsSunday,
    conversions: acc.conversions + row.conversions,
  }), {
    planningPresent: 0,
    reachPresent: 0,
    sundayPresent: 0,
    friendsReach: 0,
    friendsSunday: 0,
    conversions: 0,
  });
  const uniqCount = (names) => new Set((Array.isArray(names) ? names : []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean)).size;
  const uniqFriendsReach = uniqCount(quarterTrendRows.flatMap((row) => row.friendsReachNames || []));
  const uniqFriendsSunday = uniqCount(quarterTrendRows.flatMap((row) => row.friendsSundayNames || []));
  const metricsBlocks = [
    {
      title: 'Planeación',
      cls: 'planning',
      rows: [
        { label: 'Hermanos presentes', value: metrics.planningPresent || 0 },
        { label: 'Hermanos ausentes', value: metrics.planningAbsent || 0, names: Array.isArray(metrics.planningAbsentList) ? metrics.planningAbsentList : [] },
      ],
    },
    {
      title: 'Alcance',
      cls: 'reach',
      rows: [
        { label: 'Hermanos presentes', value: metrics.reachMembers || 0 },
        { label: 'Hermanos ausentes', value: metrics.reachAbsentMembers || 0, names: Array.isArray(metrics.reachAbsentList) ? metrics.reachAbsentList : [] },
        { label: 'Con privilegios', value: metrics.reachPrivileged || 0 },
        { label: 'Amigos presentes', value: metrics.reachFriends || 0, sub: `${metrics.reachRestor || 0} restauración` },
        { label: 'Niños presentes', value: metrics.reachKids || 0 },
        { label: 'Conversiones', value: metrics.reachConversions || 0 },
      ],
    },
    {
      title: 'Culto Dominical',
      cls: 'sunday',
      rows: [
        { label: 'Total asistentes', value: metrics.sundayTotal || 0 },
        { label: 'Hermanos', value: metrics.sundayMembers || 0 },
        { label: 'Hermanos ausentes', value: metrics.sundayAbsentMembers || 0, names: Array.isArray(metrics.sundayAbsentList) ? metrics.sundayAbsentList : [] },
        { label: 'Amigos', value: metrics.sundayFriends || 0, sub: `${metrics.sundayRestor || 0} restauración` },
        { label: 'Niños', value: metrics.sundayKids || 0 },
      ],
    },
  ];
  const dashboardSummaryView = getVisibleSummaryCards(summaryCards, Boolean(state.showAllDashboardSummaryCards));
  const renderAlertRow = (entry) => {
    const badges = (Array.isArray(entry?.events) ? entry.events : []).map((eventEntry) => `
      <span class="absence-event-pill absence-pill-${escapeHtml(String(eventEntry.letter || '').toLowerCase())}${eventEntry.justified ? ' is-justified' : ''}" title="${escapeHtml(eventEntry.streak >= 2 ? `${eventEntry.streak} semanas seguidas` : 'esta semana')}">${escapeHtml(String(eventEntry.letter || ''))}${eventEntry.streak >= 2 ? `<small>${escapeHtml(String(eventEntry.streak))}×</small>` : ''}</span>
    `).join('');
    const meta = [
      entry?.cellNum ? `Cél ${entry.cellNum}` : '',
      entry?.leaderNm ? entry.leaderNm : '',
      entry?.totalMissed >= 2 ? `${entry.totalMissed} sem. con faltas` : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="absence-row-compact dashboard-alert-${escapeHtml(entry?.severity || 'soft')}">
        <span class="absence-row-pills">${badges}</span>
        <span class="absence-row-main">
          <strong class="absence-row-name">${escapeHtml(String(entry?.name || ''))}</strong>
          ${meta ? `<span class="absence-row-meta">${escapeHtml(meta)}</span>` : ''}
        </span>
        <span class="absence-row-badge">${escapeHtml(String(entry?.severityLabel || 'Nueva'))}</span>
      </div>
    `;
  };

  return `
    <div class="seguimiento-next-shell">
      <section class="panel panel-soft">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Dashboard</p>
            <h2 id="dashboard-scope-title">${escapeHtml(data?.title || 'Semana en curso')}</h2>
          </div>
          <span id="dashboard-scope-chip" class="panel-tag panel-tag-scope"${data?.scopeLabel ? '' : ' hidden'}>${escapeHtml(data?.scopeLabel || '')}</span>
        </div>
        <div class="dashboard-time-tabs" id="dashboard-time-tabs">
          <button type="button" class="dashboard-time-tab${timeScope === 'week' ? ' is-active' : ''}" data-action="change-dashboard-time-scope" data-scope="week">Semana</button>
          <button type="button" class="dashboard-time-tab${timeScope === 'quarter' ? ' is-active' : ''}" data-action="change-dashboard-time-scope" data-scope="quarter">Cuatrimestre</button>
          <button type="button" class="dashboard-time-tab${timeScope === 'year' ? ' is-active' : ''}" data-action="change-dashboard-time-scope" data-scope="year">Año</button>
        </div>
        <div class="dashboard-period-controls">
          <label class="dashboard-period-field">
            <span>Periodo</span>
            <select id="dashboard-period-select">
              ${(Array.isArray(data?.periodOptions) ? data.periodOptions : []).map((option) => `<option value="${escapeHtml(option.value)}"${option.value === data.selectedPeriod ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
          <span id="dashboard-week-chip" class="panel-tag"${data?.chip ? '' : ' hidden'}>${escapeHtml(data?.chip || '')}</span>
        </div>
        <div id="dashboard-summary-grid" class="summary-grid">
          ${dashboardSummaryView.visibleCards.map((card) => `
            <article class="summary-card summary-card-dashboard ${escapeHtml(card.accent || '')}">
              <span class="summary-label">${escapeHtml(card.label)}</span>
              <strong class="summary-value">${escapeHtml(String(card.value))}</strong>
              <span class="summary-hint">${escapeHtml(card.hint || '')}</span>
            </article>
          `).join('')}
        </div>
        ${dashboardSummaryView.hiddenCount ? `
          <div class="seg-summary-mobile-actions">
            <button type="button" class="btn-ghost catalog-mobile-more" data-action="toggle-dashboard-summary-cards" aria-expanded="${state.showAllDashboardSummaryCards ? 'true' : 'false'}">${state.showAllDashboardSummaryCards ? 'Ver menos' : `Ver ${dashboardSummaryView.hiddenCount} más`}</button>
          </div>
        ` : ''}
      </section>

      <section class="panel panel-soft">
        <div class="panel-head">
          <div>
            <p id="dashboard-pending-eyebrow" class="eyebrow">${escapeHtml(data?.scopeLabel ? `Seguimiento · ${data.scopeLabel}` : 'Seguimiento')}</p>
            <h2 id="dashboard-absence-title">${escapeHtml(timeScope === 'week' ? 'Alertas de faltas' : `Seguimiento · ${periodLabel}`)}</h2>
          </div>
        </div>
        <div id="absence-legend" class="absence-legend"${timeScope === 'week' ? '' : ' hidden'}>
          <span class="absence-legend-item"><span class="alert-chip alert-chip-absent">P</span> Planeación</span>
          <span class="absence-legend-item"><span class="alert-chip alert-chip-absent">A</span> Alcance</span>
          <span class="absence-legend-item"><span class="alert-chip alert-chip-absent">C</span> Culto</span>
          <span class="absence-legend-sep">·</span>
          <span class="absence-legend-item"><span class="alert-chip alert-chip-justified">J</span> Justificado</span>
          <span class="absence-legend-sep">·</span>
          <span class="absence-legend-item"><span class="alert-streak-pill alert-streak-medium">3×</span> faltas</span>
        </div>
        <div id="dashboard-absence-alerts" class="dashboard-list">
          ${timeScope === 'week'
            ? `${alerts.current.length
              ? `<div class="absence-rows-wrap">${alerts.current.map(renderAlertRow).join('')}</div>`
              : `<div class="quick-list-empty">${escapeHtml(String(alerts.emptyMessage || 'Sin alertas.'))}</div>`}
            ${alerts.previous.length
              ? `<div class="alert-group-label" style="margin-top:10px">TAMBIÉN EN SEMANAS ANTERIORES</div><div class="absence-rows-wrap">${alerts.previous.map(renderAlertRow).join('')}</div>`
              : ''}`
            : `<div class="attend-tabs">
                <button type="button" class="attend-tab${activeAttendTab === 'hermanos' ? ' attend-tab-active' : ''}" data-action="change-dashboard-attendance-tab" data-tab="hermanos">Hermanos <span class="attend-tab-count">${escapeHtml(String(memberRows.length))}</span></button>
                <button type="button" class="attend-tab${activeAttendTab === 'amigos' ? ' attend-tab-active' : ''}" data-action="change-dashboard-attendance-tab" data-tab="amigos">Amigos <span class="attend-tab-count">${escapeHtml(String(visitorRows.length))}</span>${restorationCount > 0 ? ` <span class="attend-tab-count" title="En restauración" style="background:#f3e5f5;color:#6a1b9a;">+${escapeHtml(String(restorationCount))} rest.</span>` : ''}</button>
              </div>
              <div id="attend-panel-hermanos" class="attend-panel${activeAttendTab === 'hermanos' ? '' : ' attend-panel-hidden'}">
                <table class="attend-table">
                  <thead><tr>
                    <th class="attend-th-name">Miembro</th>
                    <th class="attend-th-falta">Semanas con falta</th>
                    <th class="attend-th-bar">Asistencia promedio (3 eventos)</th>
                  </tr></thead>
                  <tbody>
                    ${memberRows.length
                      ? memberRows.map((row) => {
                        const applied = Number(row.planApplied || 0) + Number(row.reachApplied || 0) + Number(row.sundayApplied || 0);
                        const attended = Number(row.planPresent || 0) + Number(row.reachPresent || 0) + Number(row.sundayPresent || 0);
                        const avgPct = applied > 0 ? Math.round((attended / applied) * 100) : 0;
                        const barCls = avgPct >= 80 ? 'attend-bar-good' : avgPct >= 50 ? 'attend-bar-mid' : 'attend-bar-low';
                        const absTotal = Number(row.absent || 0) + Number(row.justified || 0);
                        const detail = row.planPresent === row.reachPresent && row.reachPresent === row.sundayPresent
                          && row.planApplied === row.reachApplied && row.reachApplied === row.sundayApplied
                          ? `${row.planPresent} de ${row.planApplied} semanas asistió a los 3 eventos`
                          : `Plan. ${row.planPresent}/${row.planApplied} · Alc. ${row.reachPresent}/${row.reachApplied} · Culto ${row.sundayPresent}/${row.sundayApplied}`;
                        return `<tr class="attend-row${absTotal === 0 ? '' : avgPct < 50 ? ' attend-row-low' : ' attend-row-mid'} attend-row-clickable" data-member-key="${escapeHtml(String(row.key || row.name || ''))}" data-member-name="${escapeHtml(String(row.name || ''))}" title="Ver detalle de ${escapeHtml(String(row.name || ''))}">
                          <td class="attend-name">${escapeHtml(String(row.name || ''))}<div class="attend-ev-detail">${escapeHtml(detail)}</div></td>
                          <td class="attend-falta-cell">${absTotal === 0
                            ? '<span class="attend-ok-badge">✓ Sin faltas registradas.</span>'
                            : `<span class="attend-abs-badge">${escapeHtml(String(absTotal))} sem.</span>${Number(row.justified || 0) > 0 ? ` <span class="attend-just-badge">${escapeHtml(String(row.justified || 0))} just.</span>` : ''}`}</td>
                          <td class="attend-bar-cell"><div class="attend-bar-track"><div class="attend-bar-fill ${barCls}" style="width:${avgPct}%"></div></div><span class="attend-pct">${escapeHtml(String(avgPct))}%</span></td>
                        </tr>`;
                      }).join('')
                      : '<tr><td colspan="3" class="attend-empty">Sin datos de asistencia en el período.</td></tr>'}
                  </tbody>
                </table>
              </div>
              <div id="attend-panel-amigos" class="attend-panel${activeAttendTab === 'amigos' ? '' : ' attend-panel-hidden'}">
                <table class="attend-table">
                  <thead><tr>
                    <th class="attend-th-name">Amigo</th>
                    <th class="attend-th-falta">Alcance · Culto</th>
                    <th class="attend-th-bar">Visitas</th>
                  </tr></thead>
                  <tbody>
                    ${visitorRows.length
                      ? visitorRows.map((row) => {
                        const totalEvents = Number(row.visits || 0) * 2;
                        const covered = Number(row.reachCount || 0) + Number(row.sundayCount || 0);
                        const avgPct = totalEvents > 0 ? Math.round((covered / totalEvents) * 100) : 0;
                        const barCls = avgPct >= 80 ? 'attend-bar-good' : avgPct >= 50 ? 'attend-bar-mid' : 'attend-bar-low';
                        return `<tr class="attend-row attend-row-clickable" data-visitor-key="${escapeHtml(normalizeVisitorName(row.name || ''))}" data-visitor-name="${escapeHtml(String(row.name || ''))}" title="Ver detalle de ${escapeHtml(String(row.name || ''))}">
                          <td class="attend-name"><span class="visitor-kind-chip is-${row.kind === 'visita' ? 'visita' : 'amigo'}">${row.kind === 'visita' ? 'Visita' : 'Amigo'}</span> ${escapeHtml(String(row.name || ''))}</td>
                          <td class="attend-falta-cell"><span class="attend-ev-chip attend-ev-a">${escapeHtml(String(row.reachCount || 0))}/${escapeHtml(String(row.visits || 0))}</span> <span class="attend-ev-chip attend-ev-c">${escapeHtml(String(row.sundayCount || 0))}/${escapeHtml(String(row.visits || 0))}</span></td>
                          <td class="attend-bar-cell"><div class="attend-bar-track"><div class="attend-bar-fill ${barCls}" style="width:${avgPct}%"></div></div><span class="attend-pct">${escapeHtml(String(row.visits || 0))} vis.</span></td>
                        </tr>`;
                      }).join('')
                      : '<tr><td colspan="3" class="attend-empty">Sin amigos registrados en el período.</td></tr>'}
                  </tbody>
                </table>
              </div>`}
        </div>
      </section>

      <section class="panel panel-soft" id="dashboard-metrics-section">
        <div class="panel-head">
          <div>
            <p class="eyebrow" id="dashboard-metrics-eyebrow">${escapeHtml(data?.scopeLabel || 'Métricas consolidadas')}</p>
            <h2>Resumen de reuniones</h2>
          </div>
          <div id="dashboard-metrics-toggle" class="dashboard-metrics-toggle" hidden></div>
        </div>
        <div id="dashboard-metrics-body">
          ${timeScope === 'quarter'
            ? `${quarterTrendRows.length
              ? `<div class="trend-table-wrap"><table class="trend-table"><thead><tr><th class="trend-th-week">Sem.</th><th class="trend-th-ev trend-th-section">Hermanos</th><th class="trend-th-ev"></th><th class="trend-th-ev"></th><th class="trend-th-ev trend-th-section trend-th-friends">Amigos</th><th class="trend-th-ev trend-th-friends"></th><th class="trend-th-ev trend-th-friends"></th></tr><tr class="trend-subhead"><th></th><th>Plan.</th><th>Alcance</th><th>Culto hermanos</th><th title="Amigos que asistieron al alcance">Asistieron</th><th title="Amigos que pasaron del alcance al culto">Retención culto</th><th title="Decisiones de fe registradas">Conv.</th></tr></thead><tbody>${quarterTrendRows.map((row) => {
                  const sundaySet = new Set((Array.isArray(row.friendsSundayNames) ? row.friendsSundayNames : []).map((name) => String(name || '').trim().toLowerCase()));
                  const missedNames = (Array.isArray(row.friendsReachNames) ? row.friendsReachNames : []).filter((name) => !sundaySet.has(String(name || '').trim().toLowerCase()));
                  const reachPop = Array.isArray(row.friendsReachNames) && row.friendsReachNames.length
                    ? `<span class="trend-pop"><span class="trend-pop-title">Amigos al alcance (${escapeHtml(String(row.friendsReachNames.length))})</span>${row.friendsReachNames.map((name) => `<span class="trend-pop-name${sundaySet.has(String(name || '').trim().toLowerCase()) ? ' is-sunday' : ''}">${escapeHtml(String(name || ''))}</span>`).join('')}</span>`
                    : '';
                  const retentionPct = Number(row.friendsReach || 0) > 0 ? Math.round((Number(row.friendsSunday || 0) / Number(row.friendsReach || 1)) * 100) : 0;
                  const sundayPop = Array.isArray(row.friendsReachNames) && row.friendsReachNames.length
                    ? `<span class="trend-pop trend-pop-wide"><span class="trend-pop-title">Retención al culto · ${escapeHtml(String(row.friendsSunday || 0))}/${escapeHtml(String(row.friendsReach || 0))} (${escapeHtml(String(retentionPct))}%)</span>${row.friendsSundayNames.length ? `<span class="trend-pop-section trend-pop-section-ok">Llegaron (${escapeHtml(String(row.friendsSundayNames.length))})</span>${row.friendsSundayNames.map((name) => `<span class="trend-pop-name is-sunday">${escapeHtml(String(name || ''))}</span>`).join('')}` : ''}${missedNames.length ? `<span class="trend-pop-section trend-pop-section-miss">No llegaron (${escapeHtml(String(missedNames.length))})</span>${missedNames.map((name) => `<span class="trend-pop-name is-missed">${escapeHtml(String(name || ''))}</span>`).join('')}` : ''}</span>`
                    : '';
                  return `<tr class="trend-row"><td class="trend-week-cell"><strong>${escapeHtml(String(row.week || ''))}</strong><span class="trend-date">${escapeHtml(row.dateLabel || '')}</span></td><td>${trendMiniDonut(row.planningPresent, row.totalMembers, 'plan')}</td><td>${trendMiniDonut(row.reachPresent, row.totalMembers, 'reach')}</td><td>${trendMiniDonut(row.sundayPresent, row.totalMembers, 'sunday')}</td><td class="trend-td-hover">${trendMiniDonut(row.friendsReach, 0, 'friends')}${reachPop}</td><td class="trend-td-hover">${trendMiniDonut(row.friendsSunday, row.friendsReach, 'friends')}${sundayPop}</td><td>${trendMiniDonut(row.conversions, 0, 'friends')}</td></tr>`;
                }).join('')}</tbody><tfoot><tr class="trend-avg-row"><td class="trend-avg-label">Total visitas</td><td class="trend-avg-val">${escapeHtml(String(quarterTrendTotals.planningPresent))}</td><td class="trend-avg-val">${escapeHtml(String(quarterTrendTotals.reachPresent))}</td><td class="trend-avg-val">${escapeHtml(String(quarterTrendTotals.sundayPresent))}</td><td class="trend-avg-val">${escapeHtml(String(quarterTrendTotals.friendsReach))}</td><td class="trend-avg-val">${escapeHtml(quarterTrendTotals.friendsReach > 0 ? `${Math.round((quarterTrendTotals.friendsSunday / quarterTrendTotals.friendsReach) * 100)}%` : '–')}</td><td class="trend-avg-val">${escapeHtml(String(quarterTrendTotals.conversions))}</td></tr><tr class="trend-avg-row trend-uniq-row"><td class="trend-avg-label">Personas únicas</td><td class="trend-avg-val" colspan="3" style="text-align:right; color:var(--muted); font-weight:600;">amigos →</td><td class="trend-avg-val" title="Amigos distintos que asistieron al alcance en el período">${escapeHtml(String(uniqFriendsReach))}</td><td class="trend-avg-val" title="Retención del culto contando solo personas únicas">${escapeHtml(uniqFriendsReach > 0 ? `${Math.round((uniqFriendsSunday / uniqFriendsReach) * 100)}%` : '–')}</td><td class="trend-avg-val">${escapeHtml(String(uniqFriendsSunday))}<small style="display:block; font-size:0.6rem; color:var(--muted); font-weight:500;">al culto</small></td></tr></tfoot></table></div>`
              : '<div class="quick-list-empty">Sin métricas para el período seleccionado.</div>'}`
            : `<div class="summary-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));">
                ${metricsBlocks.map((block) => `
                  <div class="metrics-sector-block">
                    <div class="metrics-events-grid">
                      <div class="metrics-event-block">
                        <div class="metrics-event-title metrics-event--${escapeHtml(block.cls)}">${escapeHtml(block.title)}</div>
                        <div class="metrics-event-rows">
                          ${block.rows.map((row) => `
                            <div class="metrics-event-row${Number(row.value) === 0 ? ' is-zero' : ''}">
                              <span>${escapeHtml(row.label)}${row.sub ? `<small class="metrics-event-sub"> · ${escapeHtml(row.sub)}</small>` : ''}</span>
                              <strong>${escapeHtml(String(row.value))}</strong>
                            </div>
                            ${Number(row.value) > 0 && Array.isArray(row.names) && row.names.length
                              ? `<details class="metrics-names"><summary>Ver nombres</summary><ul class="metrics-names-list">${row.names.map((entry) => `<li>${escapeHtml(String(entry?.name || ''))}${Number(entry?.count || 0) > 1 ? ` <small>×${escapeHtml(String(entry.count || 0))}</small>` : ''}</li>`).join('')}</ul></details>`
                              : ''}
                          `).join('')}
                        </div>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>`}
        </div>
      </section>

      <section class="panel panel-soft" id="dashboard-baptisms-section">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Acumulado</p>
            <h2>Bautismos</h2>
          </div>
          <span id="dashboard-baptisms-total-chip" class="count-chip">${escapeHtml(String(baptisms))} total</span>
        </div>
        <div id="dashboard-baptisms-body">
          ${baptismYears.length
            ? baptismYears.map((yearEntry) => `
                <div class="baptism-year-block">
                  <div class="baptism-year-head">
                    <strong class="baptism-year-label">${escapeHtml(String(yearEntry?.year || ''))}</strong>
                    <span class="baptism-year-total">${escapeHtml(getBaptismCountLabel(yearEntry?.total || 0))}</span>
                  </div>
                  <div class="baptism-quarters-grid">
                    ${(Array.isArray(yearEntry?.quarters) ? yearEntry.quarters : []).map((quarterEntry) => `
                      <div class="baptism-q-card">
                        <div class="baptism-q-head">
                          <span class="baptism-q-name">${escapeHtml(getQuarterLabel(quarterEntry?.quarter))}</span>
                          <span class="baptism-q-total">${escapeHtml(String(quarterEntry?.total || 0))}</span>
                        </div>
                        <div class="baptism-cell-list">
                          ${(Array.isArray(quarterEntry?.cells) ? quarterEntry.cells : []).map((cellEntry) => `
                            <div class="baptism-cell-row">
                              <span class="baptism-cell-num">Célula ${escapeHtml(String(cellEntry?.cellNum || '-'))}</span>
                              <span class="baptism-cell-count">${escapeHtml(String(cellEntry?.count || 0))}</span>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')
            : '<div class="quick-list-empty">Sin bautismos registrados.</div>'}
        </div>
      </section>
      ${attendanceDetailEntry ? renderAttendanceDetailDialog(attendanceDetailEntry) : ''}
    </div>
  `;
}

function renderSupervisorConsolidadoPanel(state) {
  const data = state.supervisorData;
  if (state.activeTab !== 'supervisor') return '';
  if (!data?.supervisors?.length) {
    return `
      <section class="panel panel-soft full-width seguimiento-next-shell">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Seguimiento</p>
            <h2>Consolidado semanal</h2>
          </div>
        </div>
        <p class="empty-state" style="padding:16px 0">No hay supervisores visibles para este usuario.</p>
      </section>
    `;
  }

  const cells = Array.isArray(data.cells) ? data.cells : [];
  const visibleReports = Array.isArray(data.visibleReports) ? data.visibleReports : [];
  const perCellMetrics = Array.isArray(data.perCellMetrics) ? data.perCellMetrics : [];
  const totals = data.totalMetrics || {};
  const stateClassMap = {
    pendiente: 'pending',
    revisado_supervisor: 'reviewed',
    aprobado_coordinador: 'approved',
  };
  const stateLabelMap = {
    pendiente: 'Pendiente',
    revisado_supervisor: 'Revisado y enviado al coordinador',
    aprobado_coordinador: 'Aprobado por coordinador',
  };
  const byCell = new Map(visibleReports.map((report) => [String(report?.cellNumber || report?.formData?.cellNumber || '').trim(), report]));
  const rowNum = (label, getter, options = {}) => {
    const cellsHtml = perCellMetrics.map((metrics, index) => {
      const cellNumber = String(cells[index]?.cellNumber || '').trim();
      if (!metrics) return `<td class="sup-empty" data-cell="${escapeHtml(cellNumber)}">—</td>`;
      const value = getter(metrics);
      return `<td data-cell="${escapeHtml(cellNumber)}">${options.money ? `$${Number(value || 0).toFixed(2)}` : escapeHtml(String(value))}</td>`;
    }).join('');
    const totalValue = visibleReports.length
      ? (options.money ? `$${Number(getter(totals) || 0).toFixed(2)}` : escapeHtml(String(getter(totals))))
      : '—';
    return `
      <tr>
        <td class="sup-metric-label">${escapeHtml(label)}</td>
        ${cellsHtml}
        <td class="sup-total-col"><strong>${totalValue}</strong></td>
      </tr>
    `;
  };
  const sectionHeader = (label, modifier) => `
    <tr class="sup-section-header sup-section-${modifier}">
      <td colspan="${cells.length + 2}">${escapeHtml(label)}</td>
    </tr>
  `;
  const headerCells = cells.map((cell) => {
    const cellNumber = String(cell?.cellNumber || '').trim();
    const report = byCell.get(cellNumber);
    return `
      <th class="sup-cell-col" data-cell="${escapeHtml(cellNumber)}">
        <span class="sup-cell-col-num">${escapeHtml(cellNumber)}</span>
        ${report?.id ? `<button type="button" class="sup-cell-peek" data-action="open-supervisor-report" data-id="${escapeHtml(String(report.id || ''))}" title="Ver reporte" aria-label="Ver reporte">🔍</button>` : ''}
      </th>
    `;
  }).join('');
  const approval = data.approval || null;
  const stateClass = stateClassMap[data.approvalState] || 'pending';
  const stateLabel = stateLabelMap[data.approvalState] || data.approvalState || 'Pendiente';
  const metaLines = [
    approval?.supervisorName && approval?.supervisorAt
      ? `Revisado y enviado por ${escapeHtml(String(approval.supervisorName || ''))} el ${escapeHtml(String(approval.supervisorAt || '').slice(0, 16).replace('T', ' '))}`
      : '',
    approval?.coordinatorName && approval?.coordinatorAt
      ? `Aprobado por ${escapeHtml(String(approval.coordinatorName || ''))} · ${escapeHtml(String(approval.coordinatorAt || '').slice(0, 16).replace('T', ' '))}`
      : '',
  ].filter(Boolean);
  const approvalButtons = [
    data.approvalState === 'pendiente' && data.isSupervisor
      ? `<button type="button" class="btn btn-sm btn-success" data-action="submit-approval-action" data-approval-action="supervisor_review" data-sector="${escapeHtml(data.selectedSupervisor?.sector || '')}" data-week="${escapeHtml(data.selectedWeek)}">✓ Revisado · enviar al coordinador</button>`
      : '',
    data.approvalState === 'revisado_supervisor' && data.isAdmin
      ? `<button type="button" class="btn btn-sm btn-success" data-action="submit-approval-action" data-approval-action="coordinator_approve" data-sector="${escapeHtml(data.selectedSupervisor?.sector || '')}" data-week="${escapeHtml(data.selectedWeek)}">✓ Aprobar</button>`
      : '',
    data.approvalState !== 'pendiente' && ((data.isSupervisor && data.approvalState === 'revisado_supervisor') || data.isAdmin)
      ? `<button type="button" class="btn btn-sm btn-ghost" data-action="submit-approval-action" data-approval-action="return_pending" data-sector="${escapeHtml(data.selectedSupervisor?.sector || '')}" data-week="${escapeHtml(data.selectedWeek)}">Regresar a pendiente</button>`
      : '',
  ].filter(Boolean).join('');

  return `
    <div class="seguimiento-next-shell">
      <section class="panel panel-soft full-width">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Seguimiento</p>
            <h2>Consolidado semanal</h2>
          </div>
          <div class="sup-controls dashboard-period-controls">
            <label class="sup-control dashboard-period-field">
              <span>Supervisor</span>
              <select data-action="change-supervisor" id="sup-supervisor-select">
                ${data.supervisors.map((supervisor) => `<option value="${escapeHtml(supervisor.name)}"${supervisor.name === data.selectedSupervisorName ? ' selected' : ''}>${escapeHtml(supervisor.name)} · Sector ${escapeHtml(supervisor.sector)}</option>`).join('')}
              </select>
            </label>
            <label class="sup-control dashboard-period-field">
              <span>Semana</span>
              <select data-action="change-supervisor-week" id="sup-week-select">
                ${data.weekOptions.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === data.selectedWeek ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
        ${state.message ? `<p class="fn-form-msg${state.isError ? ' is-error' : ''}">${escapeHtml(state.message)}</p>` : ''}
      </section>
      ${data.selectedSupervisor ? `
        <section class="panel panel-soft full-width">
          <div class="sup-capture" data-sup-sector="${escapeHtml(data.selectedSupervisor.sector)}" data-sup-week="${escapeHtml(data.selectedWeek)}">
          <div class="sup-card-head">
            <div class="sup-card-meta">
              <span class="sup-meta-label">Supervisor:</span>
              <strong>${escapeHtml(data.selectedSupervisor.name)}</strong>
              <span class="sup-meta-sep">·</span>
              <span class="sup-meta-label">Sector:</span>
              <strong>${escapeHtml(data.selectedSupervisor.sector)}</strong>
              <span class="sup-meta-sep">·</span>
              <span class="sup-meta-label">Verbo:</span>
              <strong>${escapeHtml(data.verbLabel || '—')}</strong>
            </div>
            <div class="sup-card-actions">
              <span class="sup-coverage-chip">${escapeHtml(String(visibleReports.length))}/${escapeHtml(String(cells.length))} células reportaron</span>
              <button type="button" class="btn btn-sm btn-ghost" data-action="download-supervisor-capture">${downloadIconSvg(14)} PNG</button>
              <button type="button" class="btn btn-sm btn-ghost" data-action="share-supervisor-capture">${whatsappIconSvg(14)} WhatsApp</button>
            </div>
          </div>
          <div class="appr-bar appr-bar--${escapeHtml(stateClass)}">
            <div class="appr-status">
              <span class="appr-status-label">Estado:</span>
              <span class="appr-badge appr-badge--${escapeHtml(stateClass)}">${escapeHtml(stateLabel)}</span>
              ${metaLines.length ? `<span class="appr-meta">${metaLines.join('<span class="appr-meta-sep">·</span>')}</span>` : ''}
            </div>
            <div class="appr-actions">${approvalButtons}</div>
          </div>
          ${data.hideDetailForCoordinator ? `
            <div class="appr-waiting">
              <div class="appr-waiting-icon">⏳</div>
              <p class="appr-waiting-title">Esperando revisión del supervisor</p>
              <p class="appr-waiting-msg">Este consolidado se mostrará cuando ${escapeHtml(data.selectedSupervisor.name)} lo revise y lo envíe.</p>
            </div>
          ` : cells.length ? `
            <div class="sup-table-wrap">
              <table class="sup-table">
                <thead>
                  <tr>
                    <th class="sup-metric-label">Reuniones</th>
                    <th colspan="${cells.length}" class="sup-cells-group">Célula</th>
                    <th rowspan="2" class="sup-total-col">Total</th>
                  </tr>
                  <tr>
                    <th></th>
                    ${headerCells}
                  </tr>
                </thead>
                <tbody>
                  ${sectionHeader('Planeación', 'planning')}
                  ${rowNum('Miembros bautizados', (metrics) => metrics.cellMembersUnique || 0)}
                  ${rowNum('Miembros asistentes', (metrics) => metrics.planningPresent || 0)}
                  ${rowNum('Miembros ausentes', (metrics) => metrics.planningAbsent || 0)}

                  ${sectionHeader('Alcance', 'reach')}
                  ${rowNum('Miembros asistentes', (metrics) => metrics.reachMembers || 0)}
                  ${rowNum('Con privilegios', (metrics) => metrics.reachPrivileged || 0)}
                  ${rowNum('Amigos', (metrics) => metrics.reachFriends || 0)}
                  ${rowNum('En restauración', (metrics) => metrics.reachRestor || 0)}
                  ${rowNum('Niños', (metrics) => metrics.reachKids || 0)}
                  ${rowNum('Ofrenda', (metrics) => metrics.offering || 0, { money: true })}

                  ${sectionHeader('Culto inspirador', 'sunday')}
                  ${rowNum('Miembros', (metrics) => metrics.sundayMembers || 0)}
                  ${rowNum('Amigos', (metrics) => metrics.sundayFriends || 0)}
                  ${rowNum('En restauración', (metrics) => metrics.sundayRestor || 0)}
                  ${rowNum('Niños', (metrics) => metrics.sundayKids || 0)}
                </tbody>
              </table>
            </div>
          ` : '<p class="empty-state" style="padding:16px 0">Este supervisor no tiene células asignadas.</p>'}
          </div>
        </section>
      ` : ''}
    </div>
  `;
}

function getPreviewCount(value) {
  return Number.parseFloat(String(value ?? 0)) || 0;
}

function renderMemberEventChip(entry, attended, isPrivileged, status) {
  const normalizedStatus = String(status || '').toLowerCase();
  const isPending = !normalizedStatus || normalizedStatus === 'pending';
  const isJustified = normalizedStatus === 'justified';
  const isAbsent = normalizedStatus === 'absent';
  const isPresentLike = normalizedStatus === 'present' || normalizedStatus === 'service' || (isPending && attended);
  const variant = isJustified ? 'justified' : isAbsent ? 'missed' : isPrivileged && isPresentLike ? 'privileged' : isPresentLike ? 'attended' : 'pending';
  const icon = isJustified ? 'J' : isAbsent ? '✗' : isPrivileged && isPresentLike ? '★' : isPresentLike ? '✓' : '•';
  return `<div class="ev-chip ev-chip--${variant}"><span class="ev-chip-icon">${icon}</span><span>${escapeHtml(String(entry?.name || ''))}</span></div>`;
}

function renderPreviewSummaryCards(attendance, data) {
  const conversions = getPreviewCount(attendance.reachConversions || data.reachConversions);
  const baptisms = Array.isArray(data.baptisms) ? data.baptisms.length : 0;
  const spiritualParents = getPreviewCount(attendance.winSpiritualParents || data.winSpiritualParents);
  const totalOffering = getPreviewCount(attendance.reachOffering || data.reachOffering);
  const items = [
    conversions ? ['Conversiones', conversions, 'is-highlight'] : null,
    baptisms ? ['Bautismos', baptisms, 'is-highlight'] : null,
    spiritualParents ? ['Padres esp.', spiritualParents, ''] : null,
    totalOffering ? ['Ofrenda total', `$${totalOffering.toFixed(0)}`, ''] : null,
  ].filter(Boolean);
  if (!items.length) return '';
  return `
    <div class="preview-cards-row" style="margin-bottom:4px">
      ${items.map(([label, value, className]) => `
        <div class="preview-stat-card${className ? ` ${className}` : ''}">
          <span class="preview-stat-val">${escapeHtml(String(value))}</span>
          <span class="preview-stat-lbl">${escapeHtml(label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPreviewLegend() {
  return `
    <div class="ev-legend">
      <span class="ev-legend-title">Referencia:</span>
      <span class="ev-chip ev-chip--attended" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">✓</span>Asistió</span>
      <span class="ev-chip ev-chip--privileged" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">★</span>Con privilegio</span>
      <span class="ev-chip ev-chip--missed" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">✗</span>Faltó</span>
      <span class="ev-chip ev-chip--justified" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">J</span>Justificado</span>
      <span class="ev-badge ev-badge--sunday" style="font-size:0.7rem">↪ Culto</span>
      <span class="ev-badge ev-badge--conversion" style="font-size:0.7rem">Conversión</span>
    </div>
  `;
}

function renderPlanningSection(members, data) {
  const totalMembers = members.length;
  const planningCount = members.filter((entry) => entry?.planningAttended).length;
  return `
    <div class="ev-section">
      <div class="ev-head ev-head--planning">
        <span class="ev-title">📋 Planeación</span>
        <span class="ev-count">${escapeHtml(String(planningCount))} / ${escapeHtml(String(totalMembers))} hermanos</span>
      </div>
      <div class="ev-body">
        ${totalMembers ? `<div class="ev-chip-grid">${members.map((entry) => renderMemberEventChip(entry, entry?.planningAttended, false, entry?.planningStatus)).join('')}</div>` : '<p class="preview-empty-note">Sin registro de asistencia</p>'}
        ${data.planningNotes ? `<p class="ev-notes">${escapeHtml(String(data.planningNotes || ''))}</p>` : ''}
      </div>
    </div>
  `;
}

function getExternalParticipantKindLabel(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  if (normalized === 'member_visit') return 'Miembro visitante';
  if (normalized === 'pastor') return 'Pastor';
  if (normalized === 'supervisor') return 'Supervisor';
  if (normalized === 'leader') return 'Líder';
  return 'Participante externo';
}

function renderReachSection(members, visitors, kids, attendance, data) {
  const totalMembers = members.length;
  const reachPresent = members.filter((entry) => entry?.reachAttended).length;
  const reachPrivileged = members.filter((entry) => entry?.reachPrivileged).length;
  const externalParticipants = Array.isArray(data.externalParticipants)
    ? data.externalParticipants.filter((entry) => String(entry?.name || '').trim())
    : [];
  const friends = visitors.filter((entry) => String(entry?.kind || 'amigo') !== 'visita');
  const restoration = visitors.filter((entry) => String(entry?.kind || 'amigo') === 'visita');
  const visitorsTitle = restoration.length ? `Amigos (${friends.length}) · Restauración (${restoration.length})` : `Amigos (${friends.length})`;
  return `
    <div class="ev-section">
      <div class="ev-head ev-head--reach">
        <span class="ev-title">🌱 Alcance</span>
        <span class="ev-count">${escapeHtml(String(reachPresent))} hmnos${reachPrivileged ? ` · ${escapeHtml(String(reachPrivileged))} privilegiados` : ''}${externalParticipants.length ? ` · ${escapeHtml(String(externalParticipants.length))} externo${externalParticipants.length === 1 ? '' : 's'}` : ''} · ${escapeHtml(String(friends.length))} amigos${restoration.length ? ` · ${escapeHtml(String(restoration.length))} restauración` : ''} · ${escapeHtml(String(kids.length))} niños</span>
      </div>
      <div class="ev-body">
        ${totalMembers ? `<div class="ev-chip-grid">${members.map((entry) => renderMemberEventChip(entry, entry?.reachAttended, entry?.reachPrivileged, entry?.reachStatus)).join('')}</div>` : ''}
        ${externalParticipants.length ? `
          <div class="ev-subsection">
            <p class="ev-subsection-title">Participación externa (${escapeHtml(String(externalParticipants.length))})</p>
            <div class="ev-visitor-list">
              ${externalParticipants.map((entry) => `
                <div class="ev-visitor-row">
                  <span class="ev-visitor-name">${escapeHtml(getExternalParticipantKindLabel(entry?.kind))} · ${escapeHtml(String(entry?.name || ''))}</span>
                  ${entry?.relatedSector ? `<span class="ev-visitor-meta">Sector ${escapeHtml(String(entry.relatedSector || ''))}</span>` : ''}
                  ${entry?.homeCellNumber ? `<span class="ev-visitor-meta">Célula ${escapeHtml(String(entry.homeCellNumber || ''))}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${visitors.length ? `
          <div class="ev-subsection">
            <div class="ev-subsection-head">
              <p class="ev-subsection-title">${escapeHtml(visitorsTitle)}</p>
            </div>
            <div class="ev-visitor-list">
              ${visitors.map((entry) => {
                const kind = String(entry?.kind || 'amigo') === 'visita' ? 'visita' : 'amigo';
                const kindLabel = kind === 'visita' ? 'Visita (restauración)' : 'Amigo';
                return `
                  <div class="ev-visitor-row">
                    <span class="visitor-kind-chip is-${kind}">${escapeHtml(kindLabel)}</span>
                    <span class="ev-visitor-name">${escapeHtml(String(entry?.name || ''))}</span>
                    ${entry?.invitedBy ? `<span class="ev-visitor-meta">invitado por ${escapeHtml(String(entry.invitedBy || ''))}</span>` : ''}
                    <span class="ev-visitor-badges">
                      ${entry?.converted ? '<span class="ev-badge ev-badge--conversion">Conversión</span>' : ''}
                      ${entry?.sundayAttended ? '<span class="ev-badge ev-badge--sunday">↪ Culto</span>' : ''}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
        ${kids.length ? `
          <div class="ev-subsection">
            <p class="ev-subsection-title">Niños (${escapeHtml(String(kids.length))})</p>
            <div class="ev-visitor-list">
              ${kids.map((entry) => `
                <div class="ev-visitor-row">
                  <span class="ev-visitor-name">${escapeHtml(String(entry?.name || ''))}</span>
                  ${entry?.guardianName ? `<span class="ev-visitor-meta">guardián: ${escapeHtml(String(entry.guardianName || ''))}</span>` : ''}
                  ${entry?.sundayAttended ? '<span class="ev-badge ev-badge--sunday">↪ Culto</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${getPreviewCount(attendance.reachOffering) ? `<p class="ev-offering">Ofrenda alcance: $${escapeHtml(String(getPreviewCount(attendance.reachOffering).toFixed(0)))}</p>` : ''}
        ${data.reachNotes ? `<p class="ev-notes">${escapeHtml(String(data.reachNotes || ''))}</p>` : ''}
      </div>
    </div>
  `;
}

function renderSundaySection(members, visitors, kids, data) {
  const totalMembers = members.length;
  const sundayMembers = members.filter((entry) => entry?.sundayAttended).length;
  const sundayVisitors = visitors.filter((entry) => entry?.sundayAttended).length;
  const sundayKids = kids.filter((entry) => entry?.sundayAttended).length;
  const sundayTotal = sundayMembers + sundayVisitors + sundayKids;
  return `
    <div class="ev-section">
      <div class="ev-head ev-head--sunday">
        <span class="ev-title">⛪ Culto Dominical</span>
        <span class="ev-count">${escapeHtml(String(sundayTotal))} total · ${escapeHtml(String(sundayMembers))} hmnos · ${escapeHtml(String(sundayVisitors))} amigos · ${escapeHtml(String(sundayKids))} niños</span>
      </div>
      <div class="ev-body">
        ${totalMembers ? `<div class="ev-chip-grid">${members.map((entry) => renderMemberEventChip(entry, entry?.sundayAttended, false, entry?.sundayStatus)).join('')}</div>` : '<p class="preview-empty-note">Sin registro de asistencia</p>'}
        ${data.cultoNotes ? `<p class="ev-notes">${escapeHtml(String(data.cultoNotes || ''))}</p>` : ''}
      </div>
    </div>
  `;
}

function renderPreviewVisitorsDialog(state) {
  const previewReport = state.previewReport;
  const visitors = (Array.isArray(previewReport?.formData?.visitors) ? previewReport.formData.visitors : [])
    .filter((entry) => String(entry?.name || '').trim());
  return `
    <dialog id="preview-visitors-dialog" class="app-dialog">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Seguimiento</p>
          <h3 id="preview-visitors-dialog-title">Detalle de amigos (${visitors.length})</h3>
        </div>
        <button type="button" class="btn-icon-round" data-action="close-preview-visitors" aria-label="Cerrar">✕</button>
      </div>
      <div id="preview-visitors-dialog-body" class="dialog-body">
        ${visitors.length ? `
          <div class="preview-visitors-picker-list">
            ${visitors.map((entry) => {
              const kind = (entry.kind || 'amigo') === 'visita' ? 'Restauración' : 'Amigo';
              const badges = [
                entry.reachAttended ? 'Alcance' : '',
                entry.sundayAttended ? 'Culto' : '',
                entry.converted ? 'Conversión' : '',
              ].filter(Boolean).join(' · ');
              const meta = [kind, entry.invitedBy ? `Invitó: ${entry.invitedBy}` : '', badges].filter(Boolean).join(' · ');
              return `
                <div class="preview-visitors-picker-row">
                  <div class="preview-visitors-picker-main">
                    <span class="preview-visitors-picker-name">${escapeHtml(entry.name || '')}</span>
                    <span class="preview-visitors-picker-meta">${escapeHtml(meta || 'Sin detalle adicional')}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>`
          : '<p class="empty-state">No hay amigos capturados en este reporte.</p>'}
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-ghost" data-action="close-preview-visitors">Cerrar</button>
      </div>
    </dialog>
  `;
}

function renderReportPreviewDialog(report, options = {}) {
  const data = report?.formData || {};
  const weekInfo = getRcmWeekInfo(data.week || report?.week || '');
  const phaseLabel = weekInfo?.phaseLabel ? ` · ${weekInfo.phaseLabel}` : '';
  const previewMode = String(options.mode || 'default');
  const cellNumber = String(report?.cellNumber || data.cellNumber || '—');
  const weekNumber = String(data.week || report?.week || '—');
  const title = previewMode === 'supervisor'
    ? `Célula ${cellNumber} · Semana ${weekNumber}`
    : `Semana ${weekNumber} · Célula ${cellNumber}`;

  return `
    <dialog id="seguimiento-report-preview-dialog" class="app-dialog app-dialog-wide">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Vista previa</p>
          <h3 id="seguimiento-preview-title">${escapeHtml(title)}</h3>
        </div>
        <button id="seguimiento-preview-close-btn" type="button" class="btn-icon-round" aria-label="Cerrar">✕</button>
      </div>
      <div class="dialog-body preview-dialog-body">${buildHistoryPreviewHtml(report, { collapseMetrics: true })}</div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-ghost" data-action="download-preview-report">${downloadIconSvg(14)} Descargar PNG</button>
        <button type="button" class="btn btn-ghost" data-action="share-preview-report">${whatsappIconSvg(14)} Compartir por WhatsApp</button>
      </div>
    </dialog>
  `;
}

export function renderSeguimientoShell(state) {
  const summary = state.summary;
  const cards = state.cards;
  const scopeTabs = Array.isArray(state.scopeTabs) ? state.scopeTabs : [];
  const singleScopeTab = scopeTabs.length === 1 ? scopeTabs[0] : null;
  const dashboardScopeMarkup = state.activeTab === 'dashboard'
    ? renderDashboardScopeTabs(state)
    : '';
  const goalsScopeMarkup = state.activeTab === 'goals'
    ? (singleScopeTab
      ? renderScopeState(singleScopeTab, 'rcs-scope-bridge seg-scope-panel-bridge seg-access-scope-bridge')
      : renderScopeTabs(state))
    : '';
  const dashboardPanelMarkup = state.activeTab === 'dashboard' ? renderDashboardPanel(state) : '';
  const goalsPanelMarkup = state.activeTab === 'goals' ? renderMetasPanel(state) : '';

  return `
    <section class="seguimiento-next-shell">
      ${renderSegTabs(state)}
      ${state.activeTab === 'seguimiento' ? renderWeekContext(state) : ''}
      ${state.activeTab === 'seguimiento' ? renderTotalsPanel(state) : ''}
      ${state.activeTab === 'supervisor' ? renderSupervisorConsolidadoPanel(state) : ''}
      ${state.activeTab === 'dashboard' ? renderScopedPanelBundle(dashboardScopeMarkup, dashboardPanelMarkup, 'dashboard-scope-bundle') : ''}
      ${state.activeTab === 'goals' ? renderScopedPanelBundle(goalsScopeMarkup, goalsPanelMarkup, 'goals-scope-bundle') : ''}
      ${state.activeTab !== 'seguimiento' && state.activeTab !== 'supervisor' && state.activeTab !== 'dashboard' && state.activeTab !== 'goals' ? renderPlaceholderPanel((state.segTabs || []).find((tab) => tab.key === state.activeTab)?.label || 'Seguimiento') : ''}
      ${state.activeTab === 'seguimiento' ? `
    <section class="panel panel-soft full-width">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Supervisión</p>
          <h2>Seguimiento de células</h2>
        </div>
        <div class="seguimiento-next-head-tools">
          <span class="count-chip seguimiento-next-count-chip">${escapeHtml(summary.totalReports)}</span>
        </div>
      </div>
      ${state.message ? `<p class="fn-form-msg${state.isError ? ' is-error' : ''}">${escapeHtml(state.message)}</p>` : ''}
      <div class="seg-legend seguimiento-next-legend">
        <span class="seg-legend-label">Fases:</span>
        <span class="seg-legend-chip seg-legend-ganar">Ganar (sem. 1-6)</span>
        <span class="seg-legend-chip seg-legend-consolidar">Consolidar (7-12)</span>
        <span class="seg-legend-chip seg-legend-discipular">Discipular (13-15)</span>
        <span class="seg-legend-chip seg-legend-cierre">Cierre (16)</span>
        <span class="seg-legend-sep">·</span>
        <span class="seg-legend-chip seg-legend-pending">Pendiente (clic para capturar)</span>
      </div>
      <form id="seguimiento-scope-form" class="dashboard-period-controls seguimiento-next-filters">
        <label class="dashboard-period-field seguimiento-filter-field">
          <span>Alcance</span>
          <select name="scope" class="seguimiento-filter-select">
            <option value="current"${state.scope === 'current' ? ' selected' : ''}>Cuatrimestre actual</option>
            <option value="all"${state.scope === 'all' ? ' selected' : ''}>Todo el historial</option>
          </select>
        </label>
        ${state.cellOptions.length ? `
          <label class="dashboard-period-field seguimiento-filter-field">
            <span>Filtrar célula</span>
            <select name="cell_filter" class="seguimiento-filter-select">
              <option value="">Todas</option>
              ${state.cellOptions.map((cellNumber) => `<option value="${escapeHtml(cellNumber)}"${state.cellFilter === cellNumber ? ' selected' : ''}>${escapeHtml(`Célula ${cellNumber}`)}</option>`).join('')}
            </select>
          </label>
        ` : ''}
      </form>
      <section id="seguimiento-cycles-list">
        ${cards.length ? cards.map((card) => `
          <article class="cycle-card" data-cell-number="${escapeHtml(card.cellNumber)}">
            <div class="cycle-card-head">
              <div class="cycle-card-title">
                <span class="cycle-cell-badge">Célula ${escapeHtml(card.cellNumber)}</span>
                <strong>${escapeHtml(getQuarterName(card.quarter))}</strong>
                <span class="cycle-year-tag">${escapeHtml(card.year)}</span>
                <span class="cycle-range-tag">${escapeHtml(getQuarterRangeLabel(card.quarter))}</span>
                ${card.leaderName ? `<span class="cycle-range-tag">${escapeHtml(card.leaderName)}</span>` : ''}
              </div>
              <div class="cycle-card-meta">
                <span class="cycle-progress-text">${escapeHtml(`${card.completedWeeksCount} / 16 semanas`)}</span>
                <div class="cycle-progress-bar"><div class="cycle-progress-fill" style="width:${card.progressPercent}%"></div></div>
              </div>
            </div>
            ${renderWeekChips(card)}
          </article>
        `).join('') : '<p class="empty-state" style="padding:16px 0">No hay reportes en el alcance actual.</p>'}
      </section>
    </section>
      ` : ''}
      ${state.previewReport ? renderReportPreviewDialog(state.previewReport, { mode: state.previewMode }) : ''}
      ${state.previewReport ? renderPreviewVisitorsDialog(state) : ''}
    </section>
  `;
}