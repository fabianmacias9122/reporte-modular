import { getRcmWeekInfo } from '../../../core/rcm/index.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactPersonName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function getQuarterFromDateValue(dateValue) {
  const month = Number(String(dateValue || '').slice(5, 7));
  if (!month || Number.isNaN(month)) return 0;
  if (month <= 4) return 1;
  if (month <= 8) return 2;
  return 3;
}

function getMetricSectionDefinitions() {
  return [
    { title: 'Planeacion', fields: [['planningMembersPresent', 'Miembros asistentes'], ['planningMembersAbsent', 'Miembros ausentes']] },
    { title: 'Alcance', fields: [['reachMembersPresent', 'Miembros asistentes'], ['reachPrivilegedMembers', 'Miembros con privilegios'], ['reachFriendsPresent', 'Amigos presentes'], ['reachConversions', 'Conversiones'], ['reachKidsPresent', 'Ninos presentes'], ['reachOffering', 'Ofrenda ($)']] },
    { title: 'Multiplicacion', fields: [['multiplyBrothersNewCell', 'Hermanos en nueva celula'], ['multiplyPEinNewCell', 'Padres espirituales'], ['multiplyKidsNewCell', 'Ninos en nueva celula'], ['multiplySundayAttendance', 'Asistencia a culto']] },
    { title: 'Fase Ganar', fields: [['winSpiritualParents', 'Padres espirituales'], ['winFriendsContacted', 'Amigos contactados'], ['winRiseEventFriends', 'Amigos en Levantate'], ['winEDRFriends', 'Amigos en EDR'], ['winBaptizedFriends', 'Amigos bautizados']] },
    { title: 'Fase Consolidar', fields: [['consolidateE1', 'E1'], ['consolidateE2', 'E2'], ['consolidateE3', 'E3'], ['consolidateJoinEvent', 'Unete'], ['consolidateReencuentro', 'Reencuentro'], ['consolidateMinistries', 'Ministerios']] },
    { title: 'Fase Discipular', fields: [['discipleE1Vision', 'E1 Vision'], ['discipleE2Character', 'E2 Caracter'], ['discipleE3Profile', 'E3 Perfil'], ['discipleLaunchMultiply', 'Lanzamiento/Multip.']] },
    { title: 'Supervision', fields: [['supervisionNetwork', 'Red'], ['supervisionSector', 'Sector'], ['supervisionZone', 'Zona'], ['supervisionRegion', 'Region'], ['supervisionArea', 'Area']] },
    { title: 'Escuelas', fields: [['schoolFormative', 'Esc. Formativa'], ['schoolParents', 'Esc. Padres Esp.'], ['schoolLeaders', 'Esc. Lideres'], ['schoolSupervisors', 'Esc. Supervisores']] },
    { title: 'Bautismos', fields: [['baptismFirstQuarter', 'Q1'], ['baptismSecondQuarter', 'Q2'], ['baptismThirdQuarter', 'Q3'], ['baptismYearTotal', 'Anual']] },
  ];
}

const AUTO_METRIC_FIELDS = new Set([
  'planningMembersPresent', 'planningMembersAbsent',
  'reachMembersPresent', 'reachPrivilegedMembers', 'reachFriendsPresent', 'reachConversions', 'reachKidsPresent', 'reachOffering',
  'multiplySundayAttendance',
  'winSpiritualParents', 'winFriendsContacted', 'winRiseEventFriends', 'winBaptizedFriends',
  'consolidateE1', 'consolidateE2', 'consolidateE3', 'consolidateJoinEvent', 'consolidateReencuentro', 'consolidateMinistries',
  'discipleE1Vision', 'discipleE2Character', 'discipleE3Profile', 'discipleLaunchMultiply',
  'schoolFormative', 'schoolParents', 'schoolLeaders', 'schoolSupervisors',
  'baptismFirstQuarter', 'baptismSecondQuarter', 'baptismThirdQuarter', 'baptismYearTotal',
]);

function getMetricValue(form, weeklySummary, baptismSummary, fieldName) {
  const autoValues = {
    planningMembersPresent: Math.max(Number(weeklySummary.planningMembersPresent || 0), Number(form.planningMembersPresent || 0)),
    planningMembersAbsent: Math.max(Number(weeklySummary.planningMembersAbsent || 0), Number(form.planningMembersAbsent || 0)),
    reachMembersPresent: Math.max(Number(weeklySummary.reachMembersPresent || 0), Number(form.reachMembersPresent || 0)),
    reachPrivilegedMembers: Math.max(Number(weeklySummary.reachPrivilegedMembers || 0), Number(form.reachPrivilegedMembers || 0)),
    reachFriendsPresent: Math.max(Number(weeklySummary.reachFriendsPresent || 0), Number(form.reachFriendsPresent || 0)),
    reachConversions: Math.max(Number(weeklySummary.reachConversions || 0), Number(form.reachConversions || 0)),
    reachKidsPresent: Math.max(Number(weeklySummary.reachKidsPresent || 0), Number(form.reachKidsPresent || 0)),
    reachOffering: Number(form.reachOffering || 0),
    multiplySundayAttendance: Math.max(Number(weeklySummary.sundayTotal || 0), Number(form.multiplySundayAttendance || 0)),
    winSpiritualParents: Math.max(Number(weeklySummary.winSpiritualParents || 0), Number(form.winSpiritualParents || 0)),
    winFriendsContacted: Math.max(Number(weeklySummary.winFriendsContacted || 0), Number(form.winFriendsContacted || 0)),
    winRiseEventFriends: Math.max(Number(weeklySummary.winRiseEventFriends || 0), Number(form.winRiseEventFriends || 0)),
    winEDRFriends: Number(form.winEDRFriends || 0),
    winBaptizedFriends: Math.max(Number(weeklySummary.winBaptizedFriends || 0), Number(form.winBaptizedFriends || 0)),
    consolidateE1: Number(form.consolidateE1 || 0),
    consolidateE2: Number(form.consolidateE2 || 0),
    consolidateE3: Number(form.consolidateE3 || 0),
    consolidateJoinEvent: Number(form.consolidateJoinEvent || 0),
    consolidateReencuentro: Number(form.consolidateReencuentro || 0),
    consolidateMinistries: Number(form.consolidateMinistries || 0),
    discipleE1Vision: Number(form.discipleE1Vision || 0),
    discipleE2Character: Number(form.discipleE2Character || 0),
    discipleE3Profile: Number(form.discipleE3Profile || 0),
    discipleLaunchMultiply: Number(form.discipleLaunchMultiply || 0),
    schoolFormative: Number(form.schoolFormative || 0),
    schoolParents: Number(form.schoolParents || 0),
    schoolLeaders: Number(form.schoolLeaders || 0),
    schoolSupervisors: Number(form.schoolSupervisors || 0),
    baptismFirstQuarter: Number(baptismSummary[1] || 0),
    baptismSecondQuarter: Number(baptismSummary[2] || 0),
    baptismThirdQuarter: Number(baptismSummary[3] || 0),
    baptismYearTotal: Number(baptismSummary.total || 0),
  };
  if (Object.prototype.hasOwnProperty.call(autoValues, fieldName)) {
    return autoValues[fieldName];
  }
  return Number(form[fieldName] || 0);
}

function getMetricHint(fieldName, weeklySummary) {
  const reachMembersBase = Math.max(0, Number(weeklySummary.reachMembersPresent || 0) - Number(weeklySummary.reachSupervisorVisits || 0));
  if (fieldName === 'reachMembersPresent') {
    return `${reachMembersBase} hmnos base · ${Number(weeklySummary.reachSupervisorVisits || 0)} externos`;
  }
  if (fieldName === 'multiplySundayAttendance') {
    return `${Number(weeklySummary.sundayMembersPresent || 0)} hmnos · ${Number(weeklySummary.sundayFriendsPresent || 0)} amigos · ${Number(weeklySummary.sundayKidsPresent || 0)} ninos`;
  }
  return '';
}

function renderMetricSections(state) {
  const form = state.form || {};
  const weeklySummary = state.weeklySummary || {};
  const baptismSummary = state.baptismSummary || { 1: 0, 2: 0, 3: 0, total: 0 };
  return getMetricSectionDefinitions().map((section) => {
    const isAllAuto = section.fields.every(([fieldName]) => AUTO_METRIC_FIELDS.has(fieldName));
    return `
      <section class="panel panel-soft metric-card metric-card--compact">
        <div class="metric-card-title-row">
          <h3>${escapeHtml(section.title)}</h3>
          <span class="metric-card-kind">${isAllAuto ? 'Auto' : 'Manual'}</span>
        </div>
        <div class="metric-fields">
          ${section.fields.map(([fieldName, label]) => {
            const isAuto = AUTO_METRIC_FIELDS.has(fieldName);
            const hint = getMetricHint(fieldName, weeklySummary);
            const step = isAuto ? '1' : '0.01';
            const value = getMetricValue(form, weeklySummary, baptismSummary, fieldName);
            return `
              <label class="metric-field${isAuto ? ' is-auto' : ''}">
                <span>${escapeHtml(label)}${isAuto ? '<em class="metric-auto-tag">auto</em>' : ''}</span>
                <input name="${escapeHtml(fieldName)}" type="number" min="0" step="${step}" value="${escapeHtml(value)}"${isAuto ? ' readonly' : ''}>
                <small class="metric-field-hint">${escapeHtml(hint)}</small>
              </label>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');
}

function formatRole(role) {
  if (role === 'kid') return 'Niño';
  return 'Miembro';
}

function renderRcmMiniProgress(rcmProgress) {
  const events = [
    { key: 'levantate', label: 'Lev' },
    { key: 'restauracion', label: 'Res' },
    { key: 'reencuentro', label: 'Ree' },
    { key: 'cielosAbiertos', label: 'CA' },
  ];
  const pills = events.map(({ key, label }) => {
    const done = rcmProgress?.[key];
    return `<span class="rcm-mini-pill${done ? ' done' : ''}" title="${escapeHtml(done ? `${label} · ${done}` : `${label} pendiente`)}">${escapeHtml(label)}</span>`;
  }).join('');
  return `<span class="rcm-mini-progress">${pills}</span>`;
}

function countByStatus(entries, field, attendedField) {
  return entries.filter((entry) => entry?.[field] === 'present' || entry?.[field] === 'service' || (!entry?.[field] || entry?.[field] === 'pending') && Boolean(entry?.[attendedField])).length;
}

function memberChip(member, attended, extra, status) {
  const normalizedStatus = String(status || '').toLowerCase();
  const isPending = !normalizedStatus || normalizedStatus === 'pending';
  const isJustified = normalizedStatus === 'justified';
  const isAbsent = normalizedStatus === 'absent';
  const isPresentLike = normalizedStatus === 'present' || normalizedStatus === 'service' || (isPending && attended);
  const isPrivileged = extra === 'privileged' && isPresentLike && !isJustified && !isAbsent;
  const cls = isJustified
    ? 'justified'
    : isAbsent
      ? 'missed'
      : isPrivileged
        ? 'privileged'
        : isPresentLike
          ? 'attended'
          : 'pending';
  const icon = isJustified
    ? 'J'
    : isAbsent
      ? '✗'
      : isPrivileged
        ? '★'
        : isPresentLike
          ? '✓'
          : '•';
  return `<div class="ev-chip ev-chip--${cls}"><span class="ev-chip-icon">${icon}</span><span>${escapeHtml(member.name || '')}</span></div>`;
}

function normalizePreviewSpecialEvents(events, fallbackEntry = null) {
  const normalizedEvents = (Array.isArray(events) ? events : [])
    .map((entry) => ({
      event: String(entry?.event || '').trim(),
      rcmKey: String(entry?.rcmKey || '').trim(),
      captureMode: String(entry?.captureMode || '').trim() || 'separate',
    }))
    .filter((entry) => entry.event);
  if (normalizedEvents.length) {
    return normalizedEvents;
  }
  const fallbackEvent = String(fallbackEntry?.event || '').trim();
  if (!fallbackEvent) {
    return [];
  }
  return [{
    event: fallbackEvent,
    rcmKey: String(fallbackEntry?.rcmKey || '').trim(),
    captureMode: String(fallbackEntry?.captureMode || '').trim() || 'separate',
  }];
}

function getPreviewSpecialEvents(formData, weekInfo) {
  const snapshot = formData?.rcmSnapshot;
  const snapshotEvents = normalizePreviewSpecialEvents(snapshot?.specialEvents, snapshot);
  if (snapshotEvents.length) {
    return snapshotEvents;
  }
  return normalizePreviewSpecialEvents(weekInfo?.specialEvents, weekInfo);
}

function getPreviewPrimaryEventKey(formData, weekInfo, specialEvents = []) {
  const snapshotKey = String(formData?.rcmSnapshot?.rcmKey || '').trim();
  if (snapshotKey) {
    return snapshotKey;
  }
  const weekInfoKey = String(weekInfo?.rcmKey || '').trim();
  if (weekInfoKey) {
    return weekInfoKey;
  }
  return String(specialEvents[0]?.rcmKey || '').trim();
}

function getVisitorPreviewEventKeys(visitor, specialEvents, fallbackKey = '') {
  const eventProgress = visitor?.eventProgress && typeof visitor.eventProgress === 'object'
    ? visitor.eventProgress
    : {};
  const attendedKeys = Object.entries(eventProgress).reduce((result, [key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (normalizedKey && value) {
      result.add(normalizedKey);
    }
    return result;
  }, new Set());
  if (attendedKeys.size) {
    return attendedKeys;
  }
  if (!visitor?.eventAttended) {
    return new Set();
  }
  const fallbackKeys = specialEvents
    .map((entry) => String(entry?.rcmKey || '').trim())
    .filter(Boolean);
  if (fallbackKeys.length) {
    return new Set(fallbackKeys);
  }
  return fallbackKey ? new Set([fallbackKey]) : new Set();
}

function hasMemberPreviewEvent(member, eventKey) {
  return Boolean(eventKey && member?.rcmProgress && member.rcmProgress[eventKey]);
}

function hasMemberPreviewEventForMode(member, event) {
  const eventKey = String(event?.rcmKey || '').trim();
  const captureMode = String(event?.captureMode || '').trim() || 'separate';
  if (captureMode === 'reach') {
    return Boolean(member?.reachAttended);
  }
  if (captureMode === 'sunday') {
    return Boolean(member?.sundayAttended);
  }
  return hasMemberPreviewEvent(member, eventKey);
}

function visitorMatchesPreviewEvent(visitor, event, specialEvents, fallbackKey = '') {
  const captureMode = String(event?.captureMode || '').trim() || 'separate';
  const eventKey = String(event?.rcmKey || '').trim();
  if (captureMode === 'reach') {
    return Boolean(visitor?.reachAttended);
  }
  if (captureMode === 'sunday') {
    return Boolean(visitor?.sundayAttended);
  }
  return getVisitorPreviewEventKeys(visitor, specialEvents, fallbackKey).has(eventKey);
}

function buildPreviewEventSummaries(formData, weekInfo) {
  const specialEvents = getPreviewSpecialEvents(formData, weekInfo);
  if (!specialEvents.length) {
    return [];
  }
  const fallbackKey = getPreviewPrimaryEventKey(formData, weekInfo, specialEvents);
  const memberAttendance = Array.isArray(formData?.memberAttendance) ? formData.memberAttendance : [];
  const visitors = (Array.isArray(formData?.visitors) ? formData.visitors : []).filter((entry) => String(entry?.name || '').trim());
  return specialEvents.map((event) => {
    const members = memberAttendance.filter((entry) => hasMemberPreviewEventForMode(entry, event));
    const attendeeVisitors = visitors.filter((entry) => visitorMatchesPreviewEvent(entry, event, specialEvents, fallbackKey));
    const friendVisitors = attendeeVisitors.filter((entry) => (entry.kind || 'amigo') !== 'visita');
    const restorationVisitors = attendeeVisitors.filter((entry) => (entry.kind || 'amigo') === 'visita');
    return {
      ...event,
      memberCount: members.length,
      friendCount: friendVisitors.length,
      restorationCount: restorationVisitors.length,
      totalCount: members.length + attendeeVisitors.length,
      members,
      visitors: attendeeVisitors,
    };
  });
}

function buildPreviewWeeklySummary(formData, weekInfo = null) {
  const memberAttendance = Array.isArray(formData?.memberAttendance) ? formData.memberAttendance : [];
  const visitors = (Array.isArray(formData?.visitors) ? formData.visitors : []).filter((entry) => String(entry?.name || '').trim());
  const kids = (Array.isArray(formData?.kids) ? formData.kids : []).filter((entry) => String(entry?.name || '').trim());
  const externalParticipants = (Array.isArray(formData?.externalParticipants) ? formData.externalParticipants : []).filter((entry) => String(entry?.name || '').trim());
  const attendanceSummary = formData?.attendanceSummary || {};
  const specialEventSummaries = buildPreviewEventSummaries(formData, weekInfo);
  const levantateSummary = specialEventSummaries.find((entry) => entry.rcmKey === 'levantate');
  const planningMembersPresent = memberAttendance.filter((entry) => entry?.planningAttended).length || Number(attendanceSummary.planningMembersPresent || 0);
  const planningMembersAbsent = Math.max(0, memberAttendance.length - planningMembersPresent) || Number(attendanceSummary.planningMembersAbsent || 0);
  const reachMembersBase = memberAttendance.filter((entry) => entry?.reachAttended).length || Number(attendanceSummary.reachMembersBase || 0);
  const reachSupervisorVisits = externalParticipants.length || Number(attendanceSummary.reachSupervisorVisits || 0);
  const reachMembersPresent = (reachMembersBase + reachSupervisorVisits) || Number(attendanceSummary.reachMembersPresent || 0);
  const reachPrivilegedMembers = memberAttendance.filter((entry) => entry?.reachPrivileged).length || Number(attendanceSummary.reachPrivilegedMembers || 0);
  const reachFriendsPresent = visitors.filter((entry) => entry?.reachAttended).length || Number(attendanceSummary.reachFriendsPresent || 0);
  const reachConversions = visitors.filter((entry) => entry?.converted).length || Number(attendanceSummary.reachConversions || 0);
  const reachKidsPresent = kids.filter((entry) => entry?.reachAttended).length || Number(attendanceSummary.reachKidsPresent || 0);
  const sundayMembersPresent = memberAttendance.filter((entry) => entry?.sundayAttended).length || Number(attendanceSummary.sundayMembersPresent || 0);
  const sundayFriendsPresent = visitors.filter((entry) => entry?.sundayAttended).length || Number(attendanceSummary.sundayFriendsPresent || 0);
  const sundayKidsPresent = kids.filter((entry) => entry?.sundayAttended).length || Number(attendanceSummary.sundayKidsPresent || 0);
  const sundayTotal = (sundayMembersPresent + sundayFriendsPresent + sundayKidsPresent) || Number(attendanceSummary.sundayTotal || 0);
  const spiritualParents = new Set(visitors.map((entry) => String(entry?.invitedBy || '').trim()).filter(Boolean)).size;
  const riseEventFriends = levantateSummary
    ? levantateSummary.friendCount + levantateSummary.restorationCount
    : visitors.filter((entry) => entry?.eventAttended).length;
  const baptizedFriends = (Array.isArray(formData?.baptisms) ? formData.baptisms : []).filter((entry) => String(entry?.name || '').trim()).length;
  return {
    planningMembersPresent,
    planningMembersAbsent,
    reachMembersPresent,
    reachMembersBase,
    reachSupervisorVisits,
    reachPrivilegedMembers,
    reachFriendsPresent,
    reachConversions,
    reachKidsPresent,
    sundayMembersPresent,
    sundayFriendsPresent,
    sundayKidsPresent,
    sundayTotal,
    specialEventSummaries,
    winSpiritualParents: spiritualParents || Number(attendanceSummary.winSpiritualParents || formData?.winSpiritualParents || 0),
    winFriendsContacted: visitors.length || Number(attendanceSummary.winFriendsContacted || formData?.winFriendsContacted || 0),
    winRiseEventFriends: riseEventFriends || Number(attendanceSummary.winRiseEventFriends || formData?.winRiseEventFriends || 0),
    winBaptizedFriends: baptizedFriends || Number(attendanceSummary.winBaptizedFriends || formData?.winBaptizedFriends || 0),
  };
}

function getPreviewMetricHint(fieldName, weeklySummary, friendsCount, restorCount) {
  if (fieldName === 'reachMembersPresent') {
    return `${Number(weeklySummary.reachMembersBase || 0)} hmnos base · ${Number(weeklySummary.reachSupervisorVisits || 0)} externos`;
  }
  if (fieldName === 'reachFriendsPresent' && restorCount > 0) {
    return `${friendsCount} amigos · ${restorCount} restauracion`;
  }
  if (fieldName === 'multiplySundayAttendance') {
    return `${Number(weeklySummary.sundayMembersPresent || 0)} hmnos · ${Number(weeklySummary.sundayFriendsPresent || 0)} amigos · ${Number(weeklySummary.sundayKidsPresent || 0)} ninos`;
  }
  return '';
}

export function buildHistoryPreviewHtml(report, options = {}) {
  const formData = report?.formData || {};
  const week = String(formData.week || report?.week || '—');
  const cellNumber = String(formData.cellNumber || report?.cellNumber || '—');
  const weekInfo = getRcmWeekInfo(week);
  const phaseLabel = weekInfo?.phaseLabel || '';
  const memberAttendance = Array.isArray(formData.memberAttendance) ? formData.memberAttendance : [];
  const visitors = (Array.isArray(formData.visitors) ? formData.visitors : []).filter((entry) => String(entry?.name || '').trim());
  const kids = (Array.isArray(formData.kids) ? formData.kids : []).filter((entry) => String(entry?.name || '').trim());
  const externalParticipants = (Array.isArray(formData.externalParticipants) ? formData.externalParticipants : []).filter((entry) => String(entry?.name || '').trim());
  const weeklySummary = buildPreviewWeeklySummary(formData, weekInfo);
  const specialEventSummaries = Array.isArray(weeklySummary.specialEventSummaries) ? weeklySummary.specialEventSummaries : [];
  const reachEventSummaries = specialEventSummaries.filter((entry) => entry.captureMode === 'reach');
  const sundayEventSummaries = specialEventSummaries.filter((entry) => entry.captureMode === 'sunday');
  const separateEventSummaries = specialEventSummaries.filter((entry) => entry.captureMode === 'separate');
  const friendsCount = visitors.filter((entry) => (entry.kind || 'amigo') !== 'visita').length;
  const restorCount = visitors.filter((entry) => (entry.kind || 'amigo') === 'visita').length;
  const conversions = Number(weeklySummary.reachConversions || 0);
  const baptisms = (Array.isArray(formData.baptisms) ? formData.baptisms : []).filter((entry) => String(entry?.name || '').trim()).length;
  const totalOffering = Number(formData.reachOffering || 0);
  const baptismsByQuarter = { 1: 0, 2: 0, 3: 0, total: 0 };
  (Array.isArray(formData.baptisms) ? formData.baptisms : []).forEach((entry) => {
    if (!String(entry?.name || '').trim()) return;
    const quarter = getQuarterFromDateValue(entry?.baptismDate || formData.reportDate || '');
    if (quarter >= 1 && quarter <= 3) {
      baptismsByQuarter[quarter] += 1;
    }
    baptismsByQuarter.total += 1;
  });

  const headerHtml = `
    <div class="preview-header-card">
      <div class="preview-header-grid">
        <div><span class="preview-label">Semana</span><strong>${escapeHtml(week)}${phaseLabel ? ` · ${escapeHtml(phaseLabel)}` : ''}</strong></div>
        <div><span class="preview-label">Célula</span><strong>${escapeHtml(cellNumber)}</strong></div>
        <div><span class="preview-label">Fecha</span><strong>${escapeHtml(formData.reportDate || report?.reportDate || '—')}</strong></div>
        <div><span class="preview-label">Líder</span><strong>${escapeHtml(formData.leaderName || report?.leaderName || '—')}</strong></div>
        ${formData.assistantName ? `<div><span class="preview-label">Asistente</span><strong>${escapeHtml(formData.assistantName)}</strong></div>` : ''}
        ${formData.hostName ? `<div><span class="preview-label">Anfitrión</span><strong>${escapeHtml(formData.hostName)}</strong></div>` : ''}
        ${formData.sector ? `<div><span class="preview-label">Sector</span><strong>${escapeHtml(formData.sector)}</strong></div>` : ''}
        ${formData.networkName ? `<div><span class="preview-label">Red</span><strong>${escapeHtml(formData.networkName)}</strong></div>` : ''}
      </div>
    </div>`;

  const attendanceHtml = `
    <div class="preview-section-title">Asistencia</div>
    <div class="preview-cards-row">
      ${[
        ['Miembros', weeklySummary.planningMembersPresent],
        ['Amigos', visitors.length],
        ['Niños', kids.length],
        ['Culto insp.', weeklySummary.sundayTotal],
        ['Conversiones', weeklySummary.reachConversions],
      ].map(([label, value]) => `
        <div class="preview-stat-card">
          <span class="preview-stat-val">${escapeHtml(String(value))}</span>
          <span class="preview-stat-lbl">${escapeHtml(label)}</span>
        </div>`).join('')}
    </div>`;

  const integratedEventParts = [
    reachEventSummaries.length ? `Alcance: ${reachEventSummaries.map((entry) => entry.event).join(' / ')}` : '',
    sundayEventSummaries.length ? `Culto inspirador: ${sundayEventSummaries.map((entry) => entry.event).join(' / ')}` : '',
  ].filter(Boolean);
  const eventOverviewHtml = (separateEventSummaries.length || integratedEventParts.length) ? `
    <div class="preview-section-title">Eventos especiales</div>
    ${separateEventSummaries.length ? `
      <div class="preview-cards-row" style="margin-bottom:4px">
        ${separateEventSummaries.map((entry) => `
          <div class="preview-stat-card">
            <span class="preview-stat-val">${escapeHtml(String(entry.totalCount))}</span>
            <span class="preview-stat-lbl">${escapeHtml(entry.event)} · Aparte</span>
          </div>`).join('')}
      </div>` : ''}
    ${integratedEventParts.length ? `<p class="preview-empty-note" style="margin-top:0;margin-bottom:8px">Integrados en la semana: ${escapeHtml(integratedEventParts.join(' · '))}</p>` : ''}` : '';

  const summaryItems = [
    conversions ? ['Conversiones', conversions, 'is-highlight'] : null,
    baptisms ? ['Bautismos', baptisms, 'is-highlight'] : null,
    Number(weeklySummary.winSpiritualParents || 0) ? ['Padres esp.', Number(weeklySummary.winSpiritualParents || 0), ''] : null,
    totalOffering ? ['Ofrenda total', `$${totalOffering.toFixed(0)}`, ''] : null,
  ].filter(Boolean);
  const summaryHtml = summaryItems.length ? `
    <div class="preview-cards-row" style="margin-bottom:4px">
      ${summaryItems.map(([label, value, cssClass]) => `
        <div class="preview-stat-card ${cssClass}">
          <span class="preview-stat-val">${escapeHtml(String(value))}</span>
          <span class="preview-stat-lbl">${escapeHtml(label)}</span>
        </div>`).join('')}
    </div>` : '';
  const collapseMetrics = Boolean(options?.collapseMetrics);

  const metricsHtml = getMetricSectionDefinitions().map((section) => {
    const rows = section.fields.map(([fieldName, label]) => {
      const value = Number(getMetricValue(formData, weeklySummary, baptismsByQuarter, fieldName) || 0);
      const hint = getPreviewMetricHint(fieldName, weeklySummary, friendsCount, restorCount);
      return {
        label,
        value,
        hint,
        isEmpty: value === 0,
      };
    });
    const hasData = rows.some((row) => !row.isEmpty);
    return `
      <div class="preview-metric-card${hasData ? '' : ' preview-metric-empty'}">
        <div class="preview-metric-title">${escapeHtml(section.title)}</div>
        <div class="preview-metric-rows">
          ${rows.map((row) => `
            <div class="preview-metric-row${row.isEmpty ? ' is-zero' : ''}">
              <span class="preview-metric-label">${escapeHtml(row.label)}${row.hint ? `<small class="preview-metric-sub"> · ${escapeHtml(row.hint)}</small>` : ''}</span>
              <span class="preview-metric-value">${escapeHtml(row.isEmpty ? '—' : String(row.value))}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  const planCount = memberAttendance.filter((entry) => entry?.planningAttended).length;
  const planTotal = memberAttendance.length;
  const planSection = `
    <div class="ev-section">
      <div class="ev-head ev-head--planning">
        <span class="ev-title">📋 Planeación</span>
        <span class="ev-count">${escapeHtml(String(planCount))} / ${escapeHtml(String(planTotal))} hermanos</span>
      </div>
      <div class="ev-body">
        ${planTotal ? `<div class="ev-chip-grid">${memberAttendance.map((entry) => memberChip(entry, entry.planningAttended, null, entry.planningStatus)).join('')}</div>` : "<p class='preview-empty-note'>Sin registro de asistencia</p>"}
        ${formData.planningNotes ? `<p class="ev-notes">${escapeHtml(formData.planningNotes)}</p>` : ''}
      </div>
    </div>`;

  const reachPresent = memberAttendance.filter((entry) => entry?.reachAttended).length;
  const reachPrivileged = memberAttendance.filter((entry) => entry?.reachPrivileged).length;
  const visitorsTitle = restorCount > 0
    ? `Amigos (${friendsCount}) · Restauración (${restorCount})`
    : `Amigos (${friendsCount})`;
  const externalHtml = externalParticipants.length ? `
    <div class="ev-subsection">
      <p class="ev-subsection-title">Participación externa (${escapeHtml(String(externalParticipants.length))})</p>
      <div class="ev-visitor-list">
        ${externalParticipants.map((entry) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(entry.kind === 'member_visit' ? 'Miembro externo' : 'Supervisión')} · ${escapeHtml(entry.name || '')}</span>
            ${entry.relatedSector ? `<span class="ev-visitor-meta">Sector ${escapeHtml(entry.relatedSector)}</span>` : ''}
            ${entry.homeCellNumber ? `<span class="ev-visitor-meta">Célula ${escapeHtml(entry.homeCellNumber)}</span>` : ''}
          </div>`).join('')}
      </div>
    </div>` : '';
  const visitorsHtml = visitors.length ? `
    <div class="ev-subsection">
      <div class="ev-subsection-head">
        <p class="ev-subsection-title">${escapeHtml(visitorsTitle)}</p>
        <button type="button" class="preview-section-action" data-action="open-preview-visitors">Ver detalle</button>
      </div>
      <div class="ev-visitor-list">
        ${visitors.map((entry) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(entry.name || '')}</span>
            ${entry.invitedBy ? `<span class="ev-visitor-meta">Invitó: ${escapeHtml(entry.invitedBy)}</span>` : ''}
            <span class="ev-visitor-badges">
              ${entry.converted ? '<span class="ev-badge ev-badge--conversion">Conversión</span>' : ''}
              ${entry.sundayAttended ? '<span class="ev-badge ev-badge--sunday">↪ Culto</span>' : ''}
            </span>
          </div>`).join('')}
      </div>
    </div>` : '';
  const kidsHtml = kids.length ? `
    <div class="ev-subsection">
      <p class="ev-subsection-title">Niños (${escapeHtml(String(kids.length))})</p>
      <div class="ev-visitor-list">
        ${kids.map((entry) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(entry.name || '')}</span>
            ${entry.guardianName ? `<span class="ev-visitor-meta">Tutor: ${escapeHtml(entry.guardianName)}</span>` : ''}
            ${entry.sundayAttended ? '<span class="ev-badge ev-badge--sunday">↪ Culto</span>' : ''}
          </div>`).join('')}
      </div>
    </div>` : '';
  const reachEventsHtml = reachEventSummaries.length ? `
    <div class="ev-subsection">
      <p class="ev-subsection-title">Eventos reportados en alcance</p>
      <div class="ev-visitor-list">
        ${reachEventSummaries.map((entry) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(entry.event)}</span>
            <span class="ev-visitor-meta">${escapeHtml(String(entry.memberCount))} hmnos · ${escapeHtml(String(entry.friendCount))} amigos${entry.restorationCount ? ` · ${escapeHtml(String(entry.restorationCount))} restauración` : ''}</span>
          </div>`).join('')}
      </div>
    </div>` : '';
  const reachSection = `
    <div class="ev-section">
      <div class="ev-head ev-head--reach">
        <span class="ev-title">🌱 Alcance${reachEventSummaries.length ? ` · ${escapeHtml(reachEventSummaries.map((entry) => entry.event).join(' / '))}` : ''}</span>
        <span class="ev-count">${escapeHtml(String(reachPresent))} hmnos${reachPrivileged ? ` · ${escapeHtml(String(reachPrivileged))} privilegiados` : ''}${externalParticipants.length ? ` · ${escapeHtml(String(externalParticipants.length))} externos` : ''} · ${escapeHtml(String(friendsCount))} amigos${restorCount ? ` · ${escapeHtml(String(restorCount))} restauración` : ''} · ${escapeHtml(String(kids.length))} niños</span>
      </div>
      <div class="ev-body">
        ${planTotal ? `<div class="ev-chip-grid">${memberAttendance.map((entry) => memberChip(entry, entry.reachAttended, entry.reachPrivileged ? 'privileged' : null, entry.reachStatus)).join('')}</div>` : ''}
        ${reachEventsHtml}
        ${externalHtml}
        ${visitorsHtml}
        ${kidsHtml}
        ${totalOffering ? `<p class="ev-offering">Ofrenda alcance: $${escapeHtml(totalOffering.toFixed(0))}</p>` : ''}
        ${formData.reachNotes ? `<p class="ev-notes">${escapeHtml(formData.reachNotes)}</p>` : ''}
      </div>
    </div>`;

  const sundayMembersCount = memberAttendance.filter((entry) => entry?.sundayAttended).length;
  const sundayVisitorsCount = visitors.filter((entry) => entry?.sundayAttended).length;
  const sundayKidsCount = kids.filter((entry) => entry?.sundayAttended).length;
  const sundayTotal = sundayMembersCount + sundayVisitorsCount + sundayKidsCount;
  const sundayEventsHtml = sundayEventSummaries.length ? `
    <div class="ev-subsection">
      <p class="ev-subsection-title">Eventos reportados en culto</p>
      <div class="ev-visitor-list">
        ${sundayEventSummaries.map((entry) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(entry.event)}</span>
            <span class="ev-visitor-meta">${escapeHtml(String(entry.memberCount))} hmnos · ${escapeHtml(String(entry.friendCount))} amigos${entry.restorationCount ? ` · ${escapeHtml(String(entry.restorationCount))} restauración` : ''}</span>
          </div>`).join('')}
      </div>
    </div>` : '';
  const cultoSection = `
    <div class="ev-section">
      <div class="ev-head ev-head--sunday">
        <span class="ev-title">Culto inspirador${sundayEventSummaries.length ? ` · ${escapeHtml(sundayEventSummaries.map((entry) => entry.event).join(' / '))}` : ''}</span>
        <span class="ev-count">${escapeHtml(String(sundayTotal))} total · ${escapeHtml(String(sundayMembersCount))} hmnos · ${escapeHtml(String(sundayVisitorsCount))} amigos · ${escapeHtml(String(sundayKidsCount))} niños</span>
      </div>
      <div class="ev-body">
        ${planTotal ? `<div class="ev-chip-grid">${memberAttendance.map((entry) => memberChip(entry, entry.sundayAttended, null, entry.sundayStatus)).join('')}</div>` : "<p class='preview-empty-note'>Sin registro de asistencia</p>"}
        ${sundayEventsHtml}
        ${formData.cultoNotes ? `<p class="ev-notes">${escapeHtml(formData.cultoNotes)}</p>` : ''}
      </div>
    </div>`;
  const separateEventsHtml = separateEventSummaries.map((entry) => {
    const memberChips = entry.members.length
      ? `<div class="ev-chip-grid">${entry.members.map((member) => memberChip(member, true, null, 'present')).join('')}</div>`
      : '<p class="preview-empty-note">Sin miembros registrados en este evento</p>';
    const visitorRows = entry.visitors.length
      ? `<div class="ev-visitor-list">${entry.visitors.map((visitor) => `
          <div class="ev-visitor-row">
            <span class="ev-visitor-name">${escapeHtml(visitor.name || '')}</span>
            <span class="ev-visitor-meta">${escapeHtml((visitor.kind || 'amigo') === 'visita' ? 'Restauración' : 'Amigo')}${visitor.invitedBy ? ` · Invitó: ${escapeHtml(visitor.invitedBy)}` : ''}</span>
          </div>`).join('')}</div>`
      : '<p class="preview-empty-note">Sin amigos registrados en este evento</p>';
    return `
      <div class="ev-section">
        <div class="ev-head ev-head--planning">
          <span class="ev-title">Evento aparte · ${escapeHtml(entry.event)}</span>
          <span class="ev-count">${escapeHtml(String(entry.memberCount))} hmnos · ${escapeHtml(String(entry.friendCount))} amigos${entry.restorationCount ? ` · ${escapeHtml(String(entry.restorationCount))} restauración` : ''}</span>
        </div>
        <div class="ev-body">
          ${memberChips}
          <div class="ev-subsection">
            <p class="ev-subsection-title">Asistencia del evento</p>
            ${visitorRows}
          </div>
        </div>
      </div>`;
  }).join('');

  const legendHtml = `
    <div class="ev-legend">
      <span class="ev-legend-title">Referencia:</span>
      <span class="ev-chip ev-chip--attended" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">✓</span>Asistió</span>
      <span class="ev-chip ev-chip--privileged" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">★</span>Con privilegio</span>
      <span class="ev-chip ev-chip--missed" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">✗</span>Faltó</span>
      <span class="ev-chip ev-chip--justified" style="font-size:0.7rem;padding:2px 7px 2px 4px"><span class="ev-chip-icon">J</span>Justificado</span>
      <span class="ev-badge ev-badge--sunday" style="font-size:0.7rem">↪ Culto</span>
      <span class="ev-badge ev-badge--conversion" style="font-size:0.7rem">Conversión</span>
    </div>`;

  const stageBlocks = [
    { field: 'planningStatus', attendedField: 'planningAttended', label: 'Planeación' },
    { field: 'reachStatus', attendedField: 'reachAttended', label: 'Alcance' },
    { field: 'sundayStatus', attendedField: 'sundayAttended', label: 'Culto' },
  ].map(({ field, attendedField, label }) => {
    const present = memberAttendance.filter((entry) => {
      const status = String(entry?.[field] || '').toLowerCase();
      return status === 'present' || status === 'service';
    });
    const absent = memberAttendance.filter((entry) => String(entry?.[field] || '').toLowerCase() === 'absent');
    const justified = memberAttendance.filter((entry) => String(entry?.[field] || '').toLowerCase() === 'justified');
    const pending = memberAttendance.filter((entry) => {
      const status = String(entry?.[field] || '').toLowerCase();
      return !status || status === 'pending';
    });
    return `
      <details class="preview-event-tree">
        <summary>
          <span class="preview-event-tree-label">${escapeHtml(label)}</span>
          <span class="preview-event-tree-counts">
            <span class="ev-tally ev-tally--ok">✓ ${escapeHtml(present.length)}</span>
            <span class="ev-tally ev-tally--miss">✗ ${escapeHtml(absent.length)}</span>
            ${justified.length ? `<span class="ev-tally ev-tally--just">J ${escapeHtml(justified.length)}</span>` : ''}
          </span>
        </summary>
        <div class="preview-event-tree-body">
          ${present.length ? `<div class="preview-event-tree-group"><span class="preview-event-tree-grouplabel">Asistieron (${escapeHtml(present.length)})</span><div class="preview-pills">${present.map((entry) => `<span class="preview-pill is-present">${escapeHtml(entry.name || '')}</span>`).join('')}</div></div>` : ''}
          ${absent.length ? `<div class="preview-event-tree-group"><span class="preview-event-tree-grouplabel">Faltaron (${escapeHtml(absent.length)})</span><div class="preview-pills">${absent.map((entry) => `<span class="preview-pill is-absent">${escapeHtml(entry.name || '')}</span>`).join('')}</div></div>` : ''}
          ${justified.length ? `<div class="preview-event-tree-group"><span class="preview-event-tree-grouplabel">Justificados (${escapeHtml(justified.length)})</span><div class="preview-pills">${justified.map((entry) => `<span class="preview-pill is-justified">${escapeHtml(entry.name || '')}</span>`).join('')}</div></div>` : ''}
          ${pending.length ? `<div class="preview-empty-note" style="margin-top:6px">${escapeHtml(pending.length)} sin marcar</div>` : ''}
          ${(!present.length && !absent.length && !justified.length) ? '<span class="preview-empty-note">Sin información en este evento</span>' : ''}
        </div>
      </details>`;
  }).join('');

  const notesHtml = formData.notes ? `
    <div class="preview-section-title">Observaciones</div>
    <p class="preview-notes">${escapeHtml(formData.notes)}</p>` : '';

  return headerHtml
    + attendanceHtml
    + eventOverviewHtml
    + summaryHtml
    + legendHtml
    + planSection
    + reachSection
    + cultoSection
    + separateEventsHtml
    + notesHtml;
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

function renderHistoryPreviewDialog(state) {
  const previewReport = state.previewReport;
  return `
    <dialog id="report-preview-dialog" class="app-dialog app-dialog-wide">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Vista previa</p>
          <h3 id="preview-dialog-title">${previewReport ? escapeHtml(`Célula ${previewReport.formData?.cellNumber || previewReport.cellNumber || '—'} · Semana ${previewReport.formData?.week || previewReport.week || '—'}`) : 'Reporte'}</h3>
        </div>
        <button type="button" class="btn-icon-round" data-action="close-preview-report" aria-label="Cerrar">✕</button>
      </div>
      <div id="preview-dialog-body" class="dialog-body preview-dialog-body">${previewReport ? buildHistoryPreviewHtml(previewReport, { collapseMetrics: true }) : ''}</div>
      <div class="dialog-footer" id="preview-dialog-footer">
        <button id="preview-cancel-btn" type="button" class="btn btn-ghost" data-action="close-preview-report">Seguir editando</button>
        <button id="preview-edit-from-seg-btn" type="button" class="btn btn-ghost" data-action="open-preview-report-form" hidden>Editar reporte</button>
        <button id="preview-download-btn" type="button" class="btn btn-ghost" hidden>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;display:inline-block"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
          <span>Descargar PNG</span>
        </button>
        <button id="preview-whatsapp-btn" type="button" class="btn btn-ghost" hidden>
          <svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" style="vertical-align:-2px;display:inline-block"><path fill="#25D366" d="M16 .395C7.164.395 0 7.559 0 16.395c0 2.84.74 5.598 2.146 8.025L0 32l7.832-2.054a16.073 16.073 0 0 0 8.168 2.244h.007C24.844 32.19 32 25.026 32 16.19 32 7.355 24.836.394 16 .394Z"/><path fill="#FFF" d="M23.42 19.396c-.314-.158-1.86-.918-2.149-1.022-.288-.105-.498-.158-.708.157-.21.314-.812 1.022-.996 1.232-.184.21-.367.236-.681.078-.314-.157-1.327-.489-2.527-1.56-.935-.834-1.567-1.864-1.751-2.179-.184-.314-.02-.484.138-.641.142-.142.314-.367.472-.55.158-.184.21-.315.314-.524.105-.21.053-.394-.026-.551-.078-.157-.708-1.708-.97-2.339-.255-.613-.515-.53-.708-.54-.184-.01-.394-.012-.604-.012-.21 0-.55.079-.838.393-.288.314-1.1 1.075-1.1 2.625 0 1.55 1.126 3.049 1.283 3.259.158.21 2.215 3.379 5.367 4.741.75.324 1.337.518 1.793.663.753.24 1.438.206 1.98.125.604-.09 1.86-.76 2.122-1.494.262-.733.262-1.36.184-1.494-.078-.131-.288-.21-.602-.367Z"/></svg>
          <span>Compartir por WhatsApp</span>
        </button>
        <button id="preview-confirm-btn" type="button" class="btn btn-primary" hidden>Confirmar y guardar</button>
      </div>
    </dialog>
  `;
}

function renderConfirmDialog() {
  return `
    <dialog id="app-confirm-dialog" class="app-dialog app-confirm-dialog">
      <div class="dialog-head">
        <h3 id="app-confirm-title">Confirmar</h3>
      </div>
      <div class="dialog-body">
        <p id="app-confirm-message" style="margin:0;white-space:pre-line;line-height:1.6;"></p>
      </div>
      <div class="dialog-footer">
        <button id="app-confirm-cancel" type="button" class="btn-secondary">Cancelar</button>
        <button id="app-confirm-ok" type="button" class="btn-primary">Confirmar</button>
      </div>
    </dialog>
  `;
}

function renderReportHistory(state) {
  const history = state.reportHistory || { count: '0', cards: [], showSeguimientoLink: false };
  if (history.showSeguimientoLink) {
    return `
      <section class="panel panel-table full-width">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Historial</p>
            <h2>Mis reportes</h2>
          </div>
          <span id="report-count" class="count-chip">${escapeHtml(history.count)}</span>
        </div>
        <div id="report-cycles-list">
          <p class="empty-state" style="padding:16px 0">
            El historial de tus células está en
            <button type="button" class="link-inline" data-action="go-seguimiento">Seguimiento</button>.
          </p>
        </div>
        <table hidden><tbody id="report-table-body"></tbody></table>
      </section>
    `;
  }

  return `
    <section class="panel panel-table full-width">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Historial</p>
          <h2>Mis reportes</h2>
        </div>
        <span id="report-count" class="count-chip">${escapeHtml(history.count)}</span>
      </div>
      <div id="report-cycles-list">${history.cards.length ? history.cards.map((card) => `
        <div class="cycle-card" data-cell-number="${escapeHtml(card.cellNumber)}">
          <div class="cycle-card-head">
            <div class="cycle-card-title">
              <span class="cycle-cell-badge">Célula ${escapeHtml(card.cellNumber)}</span>
              <strong>${escapeHtml(card.quarterName)}</strong>
              <span class="cycle-year-tag">${escapeHtml(card.year)}</span>
              <span class="cycle-range-tag">${escapeHtml(card.quarterRange)}</span>
              ${card.baptismCount > 0 ? `<span class="cycle-baptism-chip" title="Bautismos del cuatrimestre">${escapeHtml(`${card.baptismCount} bautismo${card.baptismCount === 1 ? '' : 's'}`)}</span>` : ''}
            </div>
            <div class="cycle-card-meta">
              <span class="cycle-progress-text">${escapeHtml(`${card.totalDone} / ${card.totalWeeks} semanas`)}</span>
              <div class="cycle-progress-bar"><div class="cycle-progress-fill" style="width:${escapeHtml(card.progressPct)}%"></div></div>
            </div>
          </div>
          <div class="cycle-chips-grid">${card.chips.map((chip) => chip.reportId ? `
            <button type="button" class="cycle-week-chip ${chip.state === 'draft' ? 'is-draft' : 'is-done'} phase-chip-${escapeHtml(chip.phase)}" data-action="view-report" data-id="${escapeHtml(chip.reportId)}" title="Sem ${escapeHtml(chip.week)} · ${escapeHtml(chip.verb)}${chip.reportDate ? ` · ${escapeHtml(chip.reportDate)}` : ''}">
              <span class="cycle-chip-num">${escapeHtml(chip.week)}</span>
              <span class="cycle-chip-verb">${escapeHtml(chip.verb)}</span>
              ${chip.isEventWeek ? '<span class="cycle-chip-star">★</span>' : ''}
            </button>` : `
            <button type="button" class="cycle-week-chip is-pending" disabled title="Sem ${escapeHtml(chip.week)} · ${escapeHtml(chip.verb)} — pendiente">
              <span class="cycle-chip-num">${escapeHtml(chip.week)}</span>
              <span class="cycle-chip-verb">${escapeHtml(chip.verb)}</span>
              ${chip.isEventWeek ? '<span class="cycle-chip-star">★</span>' : ''}
            </button>`).join('')}</div>
        </div>
      `).join('') : '<p class="empty-state" style="padding:16px 0">Todavía no hay reportes para este cuatrimestre.</p>'}</div>
      <table hidden><tbody id="report-table-body"></tbody></table>
    </section>
  `;
}

export function renderReporteShell(state) {
  const context = state.context;
  const form = state.form;
  const leaderOptions = state.peopleOptions.leaders;
  const assistantOptions = state.peopleOptions.assistants;
  const hostOptions = state.peopleOptions.hosts;
  const cellOptions = state.cellOptions;
  const weekOptions = state.weekOptions;
  const planningSummary = state.planningSummary;
  const reachSummary = state.reachSummary;
  const sundaySummary = state.sundaySummary;
  const weeklySummary = state.weeklySummary;
  const visitorQuickForm = state.visitorQuickForm;
  const baptismQuickForm = state.baptismQuickForm;
  const kidQuickForm = state.kidQuickForm;
  const baptismCaptureStatus = state.baptismCaptureStatus;
  const baptismRegistrationMessage = state.baptismRegistrationMessage;
  const baptismSummary = state.baptismSummary;
  const visitorProcessOptions = state.visitorProcessOptions;
  const visitorProcessOptionsByKind = state.visitorProcessOptionsByKind;
  const visitorHistory = state.visitorHistory || [];
  const visibleVisitorHistory = state.visibleVisitorHistory || visitorHistory;
  const hiddenVisitorHistoryCount = Number(state.hiddenVisitorHistoryCount || 0);
  const findVisitorHistoryEntry = state.findVisitorHistoryEntry || (() => null);
  const getVisitorProcessStatusLabel = state.getVisitorProcessStatusLabel || ((value) => value || 'Sin proceso');
  const weekInfo = getRcmWeekInfo(form.week);
  const weekSpecialEvents = Array.isArray(weekInfo?.specialEvents) ? weekInfo.specialEvents.filter((entry) => String(entry?.event || '').trim()) : [];
  const reachSpecialEvents = weekSpecialEvents.filter((entry) => String(entry?.captureMode || '').trim() === 'reach');
  const sundaySpecialEvents = weekSpecialEvents.filter((entry) => String(entry?.captureMode || '').trim() === 'sunday');
  const separateSpecialEvents = weekSpecialEvents.filter((entry) => String(entry?.captureMode || '').trim() === 'separate');
  const separateEventColumns = separateSpecialEvents.filter((entry) => String(entry?.rcmKey || '').trim() || String(entry?.event || '').trim());
  const primarySpecialEvent = separateSpecialEvents[0] || weekSpecialEvents[0] || null;
  const activeQuarter = getQuarterFromDateValue(form.reportDate);
  const activeStage = state.activeStage || 'encabezado';
  const isEventWeek = weekSpecialEvents.length > 0;
  const eventName = primarySpecialEvent?.event || weekInfo?.event || 'Evento';
  const eventKey = primarySpecialEvent?.rcmKey || weekInfo?.rcmKey || '';
  const eventCaptureMode = String(primarySpecialEvent?.captureMode || weekInfo?.captureMode || '').trim() || 'separate';
  const showSeparateEventCapture = separateSpecialEvents.length > 0 && activeStage === 'culto';
  const showMemberEventColumn = activeStage !== 'planificacion' && showSeparateEventCapture;
  const showVisitorReach = activeStage !== 'culto';
  const showVisitorSunday = activeStage === 'culto';
  const reachStageLabel = reachSpecialEvents.length
    ? reachSpecialEvents.map((entry) => String(entry?.event || '').trim()).filter(Boolean).join(' / ')
    : 'Alcance';
  const sundayStageLabel = sundaySpecialEvents.length
    ? sundaySpecialEvents.map((entry) => String(entry?.event || '').trim()).filter(Boolean).join(' / ')
    : 'Culto';
  const showVisitorConversion = activeStage !== 'culto';
  const showVisitorContacted = activeStage !== 'culto';
  const showKidReach = activeStage === 'alcance';
  const showKidSunday = activeStage === 'culto';
  const visitorTableColspan = 6
    + (showVisitorReach ? 1 : 0)
    + (showVisitorSunday ? 1 : 0)
    + (showVisitorConversion ? 1 : 0)
    + (showSeparateEventCapture ? separateEventColumns.length : 0)
    + (showVisitorContacted ? 1 : 0);
  const kidTableColspan = 5 + (showKidReach ? 1 : 0) + (showKidSunday ? 1 : 0);
  const reachExternalCandidates = state.reachExternalCandidates || [];
  const reachExternalSelected = state.reachExternalSelected || [];
  const selectedExternalKeys = new Set(reachExternalSelected.map((entry) => `${entry.kind}:${entry.personId || String(entry.name || '').toLowerCase()}`));
  const reachExternalListedCandidates = reachExternalCandidates.filter((entry) => entry.kind !== 'member_visit');
  const reachExternalMemberCandidates = reachExternalCandidates.filter((entry) => entry.kind === 'member_visit');
  const reachExternalSelectedMemberVisits = reachExternalSelected.filter((entry) => entry.kind === 'member_visit');
  const reachExternalRows = [
    ...reachExternalListedCandidates,
    ...reachExternalSelectedMemberVisits.filter((entry) => {
      const key = `${entry.kind}:${entry.personId || String(entry.name || '').toLowerCase()}`;
      return !reachExternalListedCandidates.some((candidate) => `${candidate.kind}:${candidate.personId || String(candidate.name || '').toLowerCase()}` === key);
    }),
  ];
  const stageStatusField = activeStage === 'planificacion'
    ? 'planningStatus'
    : activeStage === 'alcance'
      ? 'reachStatus'
      : activeStage === 'culto'
        ? 'sundayStatus'
        : '';
  const namedVisitorsCount = (Array.isArray(form.visitors) ? form.visitors : []).filter((visitor) => String(visitor?.name || '').trim()).length;
  const namedKidsCount = (Array.isArray(form.kids) ? form.kids : []).filter((kid) => String(kid?.name || '').trim()).length;
  const reachMembersBase = Math.max(0, Number(weeklySummary.reachMembersPresent || 0) - Number(weeklySummary.reachSupervisorVisits || 0));
  const reachSummaryHint = `${reachMembersBase} hmnos · ${Number(weeklySummary.reachSupervisorVisits || 0)} externos · ${Number(weeklySummary.reachFriendsPresent || 0)} amigos`;
  const sundaySummaryHint = `${Number(weeklySummary.sundayMembersPresent || 0)} hmnos · ${Number(weeklySummary.sundayFriendsPresent || 0)} amigos · ${Number(weeklySummary.sundayKidsPresent || 0)} niños`;
  const attendanceMarkedCount = stageStatusField
    ? form.memberAttendance.filter((entry) => String(entry?.[stageStatusField] || 'pending').toLowerCase() !== 'pending').length
    : form.memberAttendance.filter((entry) => entry.planningAttended || entry.reachAttended || entry.sundayAttended).length;
  const summaryStageLabels = [
    { field: 'planningStatus', label: 'Planeación' },
    { field: 'reachStatus', label: 'Alcance' },
    { field: 'sundayStatus', label: 'Culto' },
  ];
  const perPersonSummary = new Map();
  form.memberAttendance.forEach((entry) => {
    summaryStageLabels.forEach(({ field, label }) => {
      const status = String(entry?.[field] || '').toLowerCase();
      if (status !== 'absent' && status !== 'justified') return;
      const personKey = String(entry?.name || '').trim();
      if (!personKey) return;
      if (!perPersonSummary.has(personKey)) {
        perPersonSummary.set(personKey, []);
      }
      perPersonSummary.get(personKey).push({ label, status });
    });
  });
  const absentSummaryHtml = perPersonSummary.size
    ? `
      <div class="absent-summary-block">
        <span class="absent-stage-title">Resumen — faltantes de la semana <small>(${perPersonSummary.size} ${perPersonSummary.size === 1 ? 'persona' : 'personas'})</small></span>
        <div class="pill-row">${[...perPersonSummary.entries()].map(([name, stages]) => {
          const hasAbsent = stages.some((item) => item.status === 'absent');
          const cssClass = hasAbsent ? 'pill pill-absent' : 'pill pill-justified';
          const details = stages.map((item) => `${escapeHtml(item.label)} (${item.status === 'justified' ? 'Justificado' : 'Faltó'})`).join(', ');
          return `<span class="${cssClass}"><strong>${escapeHtml(name)}</strong> — ${details}</span>`;
        }).join('')}</div>
      </div>`
    : '';
  const totalAttendanceCols = 7 + (showMemberEventColumn ? Math.max(separateEventColumns.length, 1) : 0);
  const quickHistory = findVisitorHistoryEntry(visitorHistory, visitorQuickForm.name);
  const quickHistoricalProcessEntry = quickHistory ? visitorQuickForm.kind === 'amigo' ? (quickHistory.processEntry || 'none') : 'none' : 'none';
  const quickProcessLocked = visitorQuickForm.kind === 'amigo' && quickHistoricalProcessEntry !== 'none';
  const quickProcessMeta = quickHistory?.processRegisteredWeek
    ? `Registrado en semana ${quickHistory.processRegisteredWeek}${quickHistory.processRegisteredDate ? ` · ${quickHistory.processRegisteredDate}` : ''}`
    : '';
  const phaseKey = String(weekInfo?.phase || '').toLowerCase();
  const rangeText = weekInfo?.weekStart && weekInfo?.weekEnd && weekInfo.weekStart !== weekInfo.weekEnd
    ? `Semanas ${weekInfo.weekStart}–${weekInfo.weekEnd}`
    : weekInfo?.week ? `Semana ${weekInfo.week}` : '';
  const lockCatalogFields = Boolean(state.currentUser && !state.currentUser?.isAdmin && state.currentUser?.assignedCellNumber);
  const stageOrder = ['encabezado', 'planificacion', 'alcance', 'culto', 'cierre'];
  const savedStage = String(state.lastSavedStage || form.lastStage || '').trim();
  const savedStageIndex = stageOrder.indexOf(savedStage);
  const isStageSaved = (stage) => {
    const stageIndex = stageOrder.indexOf(stage);
    if (stageIndex < 0) return false;
    if (!state.isDraftReport) {
      return Boolean(state.reportId || savedStage);
    }
    return savedStageIndex >= 0 && stageIndex <= savedStageIndex;
  };
  const stageClass = (stages) => (String(stages || '').split(' ').includes(activeStage) ? ' stage-visible' : '');
  const tabClass = (stage) => {
    const classes = ['stage-tab'];
    if (stage === activeStage) classes.push('is-active');
    if (isStageSaved(stage)) classes.push('has-draft');
    return classes.join(' ');
  };
  const nextStage = activeStage === 'encabezado' ? 'planificacion'
    : activeStage === 'planificacion' ? 'alcance'
      : activeStage === 'alcance' ? 'culto'
        : activeStage === 'culto' ? 'cierre'
          : 'cierre';
  const canEditCurrentReport = state.canEditCurrentReport !== false;
  const saveDisabledAttr = canEditCurrentReport ? '' : ' disabled title="Solo el líder de esta célula puede guardar o finalizar este reporte."';
  const metricSectionsHtml = renderMetricSections(state);

  return `
    <section id="report-view" class="workspace-main report-next">
      <div id="report-readonly-banner" class="readonly-banner"${canEditCurrentReport ? ' hidden' : ''}>
        🔒 Solo el líder de esta célula puede guardar o finalizar este reporte. Estás viendo el reporte en modo de solo lectura.
      </div>
      <nav class="stage-nav full-width" id="stage-nav" aria-label="Etapas del reporte">
        <button type="button" class="${tabClass('encabezado')}" data-stage="encabezado">
          <span class="stage-tab-num">1</span>
          <span class="stage-tab-label">Inicio</span>
          <span class="stage-tab-badge" id="stage-badge-encabezado"${isStageSaved('encabezado') ? '' : ' hidden'}>✓</span>
        </button>
        <button type="button" class="${tabClass('planificacion')}" data-stage="planificacion">
          <span class="stage-tab-num">2</span>
          <span class="stage-tab-label">Planeación</span>
          <span class="stage-tab-badge" id="stage-badge-planificacion"${isStageSaved('planificacion') ? '' : ' hidden'}>✓</span>
        </button>
        <button type="button" class="${tabClass('alcance')}" data-stage="alcance">
          <span class="stage-tab-num">3</span>
          <span class="stage-tab-label">Alcance</span>
          <span class="stage-tab-badge" id="stage-badge-alcance"${isStageSaved('alcance') ? '' : ' hidden'}>✓</span>
        </button>
        <button type="button" class="${tabClass('culto')}" data-stage="culto">
          <span class="stage-tab-num">4</span>
          <span class="stage-tab-label">Culto</span>
          <span class="stage-tab-badge" id="stage-badge-culto"${isStageSaved('culto') ? '' : ' hidden'}>✓</span>
        </button>
        <button type="button" class="${tabClass('cierre')}" data-stage="cierre">
          <span class="stage-tab-num">5</span>
          <span class="stage-tab-label">Cierre</span>
          <span class="stage-tab-badge" id="stage-badge-cierre"${isStageSaved('cierre') ? '' : ' hidden'}>✓</span>
        </button>
      </nav>
      <form id="report-form" class="stack-grid full-width">
        <div id="form-readonly-banner" class="form-readonly-banner"${canEditCurrentReport ? ' hidden' : ''}>Solo lectura: puedes revisar la información, pero no guardar cambios.</div>
        <section class="panel inicio-capture-card${stageClass('encabezado')}" data-stage="encabezado">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Captura</p>
              <h2>Inicio del reporte</h2>
            </div>
            <span class="panel-tag">Semana activa</span>
          </div>
          <div class="inicio-primary-fields">
            <label>
              <span>Semana</span>
              <select id="week-field" name="week" required>
                ${weekOptions.map((option) => `<option value="${escapeHtml(option.value)}"${String(form.week) === String(option.value) ? ' selected' : ''}${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Célula</span>
              <select id="cell-field" name="cellNumber"${state.canEditCell ? '' : ' disabled'} required>
                <option value="">Selecciona célula</option>
                ${cellOptions.map((option) => `<option value="${escapeHtml(option.value)}"${form.cellNumber === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="report-grid inicio-secondary-fields">
            <label hidden aria-hidden="true" style="display:none">
              <span>Red</span>
              <input name="networkName" type="text" value="${escapeHtml(form.networkName || '')}">
            </label>
            <label>
              <span>Sector · catálogo</span>
              <input name="sector" type="text" value="${escapeHtml(form.sector || '')}"${lockCatalogFields ? ' disabled' : ''} required>
            </label>
            <label hidden aria-hidden="true" style="display:none">
              <span>Zona</span>
              <input name="zoneName" type="text" value="${escapeHtml(form.zoneName || '')}">
            </label>
            <label>
              <span>Distrito · catálogo</span>
              <input name="districtName" type="text" value="${escapeHtml(form.districtName || '')}"${lockCatalogFields ? ' disabled' : ''}>
            </label>
          </div>
          <div id="rcm-phase-indicator" class="rcm-phase-indicator rcm-phase-card-footer${weekInfo ? '' : ' is-hidden'}" data-phase="${escapeHtml(phaseKey)}">
            ${weekInfo ? `
              <span class="phase-badge phase-badge-${escapeHtml(phaseKey)}">${escapeHtml(weekInfo.phaseLabel || weekInfo.phase || '')}</span>
              <span class="phase-indicator-range">${escapeHtml(rangeText)}</span>
              ${weekInfo.verb ? `<span class="phase-indicator-verb"><strong>${escapeHtml(weekInfo.verb)}</strong> — ${escapeHtml(weekInfo.verbDesc || '')}</span>` : ''}
              ${isEventWeek ? `<span class="phase-indicator-event is-event-week">★ Eventos especiales: ${weekSpecialEvents.map((specialEvent) => `<span class="phase-indicator-purpose"><strong>${escapeHtml(specialEvent.event || '')}</strong>${specialEvent.eventType ? `<em class="phase-indicator-event-type">${escapeHtml(specialEvent.eventType)}</em>` : ''}${specialEvent.purpose ? `<span class="phase-indicator-purpose">${escapeHtml(specialEvent.purpose)}</span>` : ''}<span class="phase-indicator-purpose">${escapeHtml(specialEvent.captureMode === 'reach' ? 'Se reporta dentro de Alcance' : specialEvent.captureMode === 'sunday' ? 'Se reporta dentro de Culto' : 'Se reporta aparte')}</span></span>`).join('')}${weekSpecialEvents.length > 1 ? `<span class="phase-indicator-purpose">La captura detallada sigue tomando el primer evento mientras se termina la migración multi-evento.</span>` : ''}</span>` : ''}
            ` : ''}
          </div>
        </section>

        <section class="panel panel-soft inicio-team-card${stageClass('encabezado')}" data-stage="encabezado">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Equipo</p>
              <h2>Liderazgo y reunión</h2>
            </div>
            <span id="member-count-chip" class="count-chip">${escapeHtml(form.memberAttendance.length)} miembros</span>
          </div>
          <div class="inicio-team-grid">
            <label class="inicio-leader-field">
              <span>Líder · catálogo</span>
              <select id="leader-field" name="leaderName"${lockCatalogFields ? ' disabled' : ''} required>
                <option value="">Selecciona líder</option>
                ${leaderOptions.map((person) => `<option value="${escapeHtml(person.name)}"${form.leaderName === person.name ? ' selected' : ''}>${escapeHtml(person.name)}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Asistente · catálogo</span>
              <select id="assistant-field" name="assistantName"${lockCatalogFields ? ' disabled' : ''}>
                <option value="">Selecciona asistente</option>
                ${assistantOptions.map((person) => `<option value="${escapeHtml(person.name)}"${form.assistantName === person.name ? ' selected' : ''}>${escapeHtml(person.name)}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Anfitrión · catálogo</span>
              <select id="host-field" name="hostName"${lockCatalogFields ? ' disabled' : ''}>
                <option value="">Selecciona anfitrión</option>
                ${hostOptions.map((person) => `<option value="${escapeHtml(person.name)}"${form.hostName === person.name ? ' selected' : ''}>${escapeHtml(person.name)}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="inicio-location-row">
            <label class="inicio-address-field">
              <span>Domicilio · catálogo</span>
              <input id="report-address" name="address" type="text" value="${escapeHtml(form.address || '')}"${lockCatalogFields ? ' disabled' : ''}>
            </label>
            <label class="inicio-date-field">
              <span>Fecha de reunión</span>
              <input name="reportDate" type="date" value="${escapeHtml(form.reportDate || '')}" required>
            </label>
          </div>
          <div class="member-summary">
            <span class="member-summary-label">Miembros asignados a la célula</span>
            <div id="report-member-pills" class="pill-row">
              ${form.memberAttendance.length
                ? form.memberAttendance.map((entry) => `<span class="pill pill-compact" title="${escapeHtml(entry.name)}">${escapeHtml(compactPersonName(entry.name))}</span>`).join('')
                : '<span class="member-summary-label">Sin miembros asignados.</span>'}
            </div>
          </div>
        </section>

        <div class="stage-save-bar full-width${stageClass('encabezado')}" data-stage="encabezado">
          <button type="button" id="save-next-encabezado" class="btn-save-next btn-with-icon" data-action="save-report-stage" data-next-stage="planificacion"${saveDisabledAttr}>
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Guardar y continuar →</span>
          </button>
        </div>
      </form>
      <div class="full-width${stageClass('planificacion alcance culto')}" data-stage="planificacion alcance culto">
        <div class="summary-grid summary-grid-compact" id="attendance-summary-cards">
          <article class="summary-card summary-card-mini" data-summary-stage="planificacion">
            <span class="summary-label">Planeación</span>
            <strong class="summary-value">${escapeHtml(weeklySummary.planningMembersPresent)}</strong>
          </article>
          <article class="summary-card summary-card-mini" data-summary-stage="alcance">
            <span class="summary-label">Alcance</span>
            <strong class="summary-value">${escapeHtml(weeklySummary.reachTotal)}</strong>
            <span class="summary-hint">${escapeHtml(reachSummaryHint)}</span>
          </article>
          <article class="summary-card summary-card-mini" data-summary-stage="culto">
            <span class="summary-label">Culto</span>
            <strong class="summary-value">${escapeHtml(weeklySummary.sundayTotal)}</strong>
            <span class="summary-hint">${escapeHtml(sundaySummaryHint)}</span>
          </article>
          <article class="summary-card summary-card-mini" data-summary-stage="alcance">
            <span class="summary-label">Amigos</span>
            <strong class="summary-value">${escapeHtml(namedVisitorsCount)}</strong>
          </article>
          <article class="summary-card summary-card-mini" data-summary-stage="alcance">
            <span class="summary-label">Niños</span>
            <strong class="summary-value">${escapeHtml(namedKidsCount)}</strong>
          </article>
        </div>
      </div>

      <section class="panel panel-soft full-width${stageClass('planificacion alcance culto')}" data-stage="planificacion alcance culto">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Semanal</p>
            <h2>Asistencia de miembros</h2>
          </div>
          <span id="attendance-progress-chip" class="count-chip">${escapeHtml(attendanceMarkedCount)} marcados</span>
        </div>
        <div class="helper-actions" aria-label="Atajos de miembros">
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="fill-planning-members" data-stage-action="planificacion" id="fill-planning-members" data-tooltip="Marca a TODOS los miembros como asistentes a la Planeación.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span>Todos en planeación</span>
          </button>
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="fill-reach-members" data-stage-action="alcance" id="fill-reach-members" data-tooltip="Marca a TODOS los miembros como asistentes al Alcance.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Todos a Alcance</span>
          </button>
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="fill-reach-privileges" data-stage-action="alcance" id="fill-reach-privileges" data-tooltip="Marca a TODOS los miembros con Alcance + Privilegios.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Todos a Alcance + Privilegios</span>
          </button>
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="fill-sunday-members" data-stage-action="culto" id="fill-sunday-members" data-tooltip="Marca a TODOS los miembros como asistentes al Culto, sin importar Alcance.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Todos al Culto</span>
          </button>
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="copy-reach-to-sunday" data-stage-action="culto" id="copy-reach-to-sunday" data-tooltip="Copia al Culto solo los miembros que asistieron al Alcance.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span>Alcance → Culto</span>
          </button>
          <button type="button" class="secondary helper-action-button btn-with-icon" data-action="clear-member-activities" id="clear-member-activities" data-tooltip="Limpia las marcas de la etapa activa para todos los miembros.">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
            <span>Limpiar actividades</span>
          </button>
        </div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Estado semanal</th>
                <th>Planeación</th>
                <th>${escapeHtml(reachStageLabel)}</th>
                <th>Privilegios</th>
                <th>${escapeHtml(sundayStageLabel)}</th>
                ${showMemberEventColumn
                  ? separateEventColumns.map((specialEvent, eventIndex) => `<th id="member-event-col-header-${escapeHtml(eventIndex)}">${escapeHtml(specialEvent.event || 'Evento')}</th>`).join('')
                  : ''}
                <th>Observación</th>
              </tr>
            </thead>
            <tbody id="attendance-table-body">
              ${form.memberAttendance.length ? form.memberAttendance.map((entry, index) => `
                <tr>
                  <td data-label="Miembro">
                    <strong>${escapeHtml(entry.name)}</strong><br>
                    <span class="member-admin-caption">${escapeHtml(formatRole(entry.role || 'member'))}</span>
                    ${showMemberEventColumn ? renderRcmMiniProgress(entry.rcmProgress) : ''}
                  </td>
                  <td data-label="Estado">
                    <select data-attendance-index="${escapeHtml(index)}" data-attendance-field="status">
                      <option value="pending"${String((stageStatusField ? entry?.[stageStatusField] : entry?.status) || 'pending').toLowerCase() === 'pending' ? ' selected' : ''}>Sin marcar</option>
                      <option value="present"${String((stageStatusField ? entry?.[stageStatusField] : entry?.status) || '').toLowerCase() === 'present' ? ' selected' : ''}>Presente</option>
                      <option value="absent"${String((stageStatusField ? entry?.[stageStatusField] : entry?.status) || '').toLowerCase() === 'absent' ? ' selected' : ''}>Faltó</option>
                      <option value="justified"${String((stageStatusField ? entry?.[stageStatusField] : entry?.status) || '').toLowerCase() === 'justified' ? ' selected' : ''}>Justificado</option>
                      <option value="service"${String((stageStatusField ? entry?.[stageStatusField] : entry?.status) || '').toLowerCase() === 'service' ? ' selected' : ''}>Sirviendo</option>
                    </select>
                  </td>
                  <td data-label="Planeación" class="checkbox-cell">
                    <input data-attendance-index="${escapeHtml(index)}" data-attendance-field="planningAttended" type="checkbox"${entry.planningAttended ? ' checked' : ''}>
                  </td>
                  <td data-label="${escapeHtml(reachStageLabel)}" class="checkbox-cell">
                    <input data-attendance-index="${escapeHtml(index)}" data-attendance-field="reachAttended" type="checkbox"${entry.reachAttended ? ' checked' : ''}>
                  </td>
                  <td data-label="Privilegios" class="checkbox-cell">
                    <input data-attendance-index="${escapeHtml(index)}" data-attendance-field="reachPrivileged" type="checkbox"${entry.reachPrivileged ? ' checked' : ''}${!entry.reachAttended ? ' disabled' : ''}>
                  </td>
                  <td data-label="${escapeHtml(sundayStageLabel)}" class="checkbox-cell">
                    <input data-attendance-index="${escapeHtml(index)}" data-attendance-field="sundayAttended" type="checkbox"${entry.sundayAttended ? ' checked' : ''}>
                  </td>
                  ${showMemberEventColumn
                    ? separateEventColumns.map((specialEvent) => {
                      const specialEventName = String(specialEvent?.event || 'Evento').trim() || 'Evento';
                      const specialEventKey = String(specialEvent?.rcmKey || '').trim();
                      const progressValue = specialEventKey ? entry.rcmProgress?.[specialEventKey] : null;
                      return `<td data-label="${escapeHtml(specialEventName)}" class="checkbox-cell event-col">
                        ${specialEventKey ? `<input data-attendance-index="${escapeHtml(index)}" data-attendance-field="rcmEventAttended" data-rcm-key="${escapeHtml(specialEventKey)}" data-person-id="${escapeHtml(String(entry.personId || ''))}" type="checkbox"${progressValue ? ' checked' : ''} title="${escapeHtml(progressValue ? `${specialEventName} · ${progressValue}` : `Sin registro de ${specialEventName}`)}">` : ''}
                      </td>`;
                    }).join('')
                    : ''}
                  <td data-label="Observación">
                    <input data-attendance-index="${escapeHtml(index)}" data-attendance-field="note" type="text" value="${escapeHtml(entry.note || '')}" placeholder="Observaciones...">
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="${escapeHtml(totalAttendanceCols)}" class="empty-state">Selecciona una célula para marcar asistencia.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
        <div class="member-summary">
          <span class="member-summary-label"${absentSummaryHtml ? '' : ' style="display:none"'}>Faltaron esta semana</span>
          <div id="absent-member-pills" class="pill-row">${absentSummaryHtml}</div>
        </div>
      </section>
      <div class="stage-save-bar full-width${stageClass('planificacion')}" data-stage="planificacion">
        <button type="button" class="btn-save-next btn-with-icon" data-action="save-report-stage" data-next-stage="alcance"${saveDisabledAttr}>
          <span>Guardar y continuar →</span>
        </button>
      </div>

      <section class="fn-shell__card fn-shell__card--feature panel panel-soft full-width${stageClass('alcance culto')}" data-stage="alcance culto">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Semanal</p>
            <h2>Visitas y amigos</h2>
          </div>
          <button
            id="visitor-quick-history-restore-button"
            type="button"
            class="secondary btn-with-icon"
            data-action="restore-hidden-visitor-history"
            ${hiddenVisitorHistoryCount > 0 ? '' : 'hidden'}
          >
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.34-5.66"/><path d="M20 4v7h-7"/></svg>
            <span class="visitor-quick-history-toolbar-label">${hiddenVisitorHistoryCount > 0 ? `Restaurar ocultos (${hiddenVisitorHistoryCount})` : 'Restaurar ocultos'}</span>
          </button>
        </div>
        <div id="visitor-quick-form" class="visitor-quick-form">
          <label>
            <span>Visita previa</span>
            <select id="visitor-quick-history" class="fn-select" data-visitor-field="historySelection">
              <option value="">${visibleVisitorHistory.length ? `Elegir del historial (${visibleVisitorHistory.length})` : 'Sin historial para esta célula'}</option>
              ${visibleVisitorHistory.map((entry) => `<option value="${escapeHtml(entry.name)}"${visitorQuickForm.historySelection === entry.name ? ' selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
            <div class="visitor-quick-history-actions" aria-label="Acciones de vista previa">
              <button
                id="visitor-quick-history-hide-button"
                type="button"
                class="secondary visitor-quick-history-action"
                data-action="hide-visitor-history-selection"
                ${visitorQuickForm.historySelection ? '' : 'hidden'}
              >
                Ocultar de vista previa
              </button>
            </div>
          </label>
          <label>
            <span>Nombre de la visita</span>
            <input id="visitor-quick-name" data-visitor-field="name" type="text" placeholder="Nombre completo" value="${escapeHtml(visitorQuickForm.name)}">
          </label>
          <label>
            <span>Tipo</span>
            <select id="visitor-quick-kind" class="fn-select" data-visitor-field="kind">
              <option value="amigo"${visitorQuickForm.kind === 'amigo' ? ' selected' : ''}>Amigo (no bautizado)</option>
              <option value="visita"${visitorQuickForm.kind === 'visita' ? ' selected' : ''}>Visita (restauración)</option>
            </select>
          </label>
          <label>
            <span>Invitó</span>
            <select id="visitor-quick-invited-by" class="fn-select" data-visitor-field="invitedBy">
              <option value="">— Quién invitó —</option>
              ${state.invitedByOptions.map((option) => `<option value="${escapeHtml(option.value)}"${visitorQuickForm.invitedBy === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
          <label id="visitor-quick-process-field"${visitorQuickForm.kind === 'visita' ? ' hidden' : ''}>
            <span>Proceso</span>
            <select id="visitor-quick-process-entry" class="fn-select" data-visitor-field="processEntry"${visitorQuickForm.kind === 'visita' || quickProcessLocked ? ' disabled' : ''}${quickProcessLocked && quickProcessMeta ? ` title="${escapeHtml(quickProcessMeta)}"` : ''}>
              ${(quickProcessLocked
                ? [{ value: quickHistoricalProcessEntry, label: getVisitorProcessStatusLabel(quickHistoricalProcessEntry) }]
                : visitorProcessOptions
              ).map((option) => `<option value="${escapeHtml(option.value)}"${(quickProcessLocked ? quickHistoricalProcessEntry : visitorQuickForm.processEntry) === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
            <small id="visitor-quick-process-summary" class="visitor-quick-process-summary">${visitorQuickForm.kind === 'visita'
              ? 'Restauración · fuera de proceso'
              : `Alcance: ${visitorQuickForm.reachAttended ? 'sí' : 'no'} · Proceso: ${visitorQuickForm.processEntry === 'late' ? 'tardío' : visitorQuickForm.processEntry === 'noted' ? 'sí' : 'no'}`}</small>
          </label>
          <div class="visitor-quick-toggles">
            ${showVisitorReach ? `<label class="quick-toggle-field">
              <input data-visitor-field="reachAttended" type="checkbox"${visitorQuickForm.reachAttended ? ' checked' : ''}>
              <span>${escapeHtml(reachStageLabel)}</span>
            </label>` : ''}
            ${showVisitorSunday ? `<label class="quick-toggle-field">
              <input data-visitor-field="sundayAttended" type="checkbox"${visitorQuickForm.sundayAttended ? ' checked' : ''}>
              <span>${escapeHtml(sundayStageLabel)}</span>
            </label>` : ''}
            <label class="quick-toggle-field">
              <input data-visitor-field="firstVisit" type="checkbox"${visitorQuickForm.firstVisit ? ' checked' : ''}>
              <span>Primera vez</span>
            </label>
            <label id="visitor-quick-converted-field" class="quick-toggle-field"${visitorQuickForm.kind === 'visita' || !showVisitorConversion ? ' hidden' : ''}>
              <input data-visitor-field="converted" type="checkbox"${visitorQuickForm.converted ? ' checked' : ''}>
              <span>Conversión</span>
            </label>
            ${showSeparateEventCapture ? separateEventColumns.map((specialEvent) => {
              const specialEventName = String(specialEvent?.event || 'Evento').trim() || 'Evento';
              const specialEventKey = String(specialEvent?.rcmKey || '').trim();
              return `<label class="quick-toggle-field">
                <input data-visitor-field="eventProgress" data-rcm-key="${escapeHtml(specialEventKey)}" type="checkbox"${visitorQuickForm.eventProgress?.[specialEventKey] ? ' checked' : ''}>
                <span>${escapeHtml(specialEventName)}</span>
              </label>`;
            }).join('') : ''}
          </div>
          <div class="visitor-quick-actions">
            <button type="button" class="btn-with-icon" data-action="add-visitor">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              <span>Agregar visita</span>
            </button>
            <button type="button" class="secondary btn-with-icon" data-action="reset-visitor-quick" title="Vacía los campos del formulario rápido (no afecta a la tabla de amigos)">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>
              <span>Vaciar formulario</span>
            </button>
          </div>
          <div class="helper-actions" aria-label="Atajos de amigos">
            <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="fill-sunday-visitors" data-stage-action="culto" id="mark-all-visitors-to-sunday" data-tooltip="Marca a TODOS los amigos/visitas como asistentes al Culto, sin importar si fueron al Alcance.">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Todos al Culto</span>
            </button>
            <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-action="copy-visitor-reach-to-sunday" data-stage-action="culto" id="copy-visitor-reach-to-sunday" data-tooltip="Copia al Culto solo los amigos/visitas que asistieron al Alcance.">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              <span>Alcance → Culto</span>
            </button>
          </div>
        </div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Invitó</th>
                ${showVisitorReach ? `<th class="col-alcance">${escapeHtml(reachStageLabel)}</th>` : ''}
                ${showVisitorSunday ? `<th class="col-culto">${escapeHtml(sundayStageLabel)}</th>` : ''}
                <th>Primera vez</th>
                <th>Proceso</th>
                ${showVisitorConversion ? '<th class="col-conversion">Conversión</th>' : ''}
                ${showSeparateEventCapture
                  ? separateEventColumns.map((specialEvent, eventIndex) => `<th id="visitor-event-col-header-${escapeHtml(eventIndex)}">${escapeHtml(specialEvent.event || 'Evento')}</th>`).join('')
                  : ''}
                ${showVisitorContacted ? '<th class="col-contactado">Contactado</th>' : ''}
                <th>Teléfono</th>
                <th>Observación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="visitor-table-body">
        ${form.visitors.length ? form.visitors.map((visitor, index) => {
          const visitorKind = visitor.kind === 'visita' ? 'visita' : 'amigo';
          const history = findVisitorHistoryEntry(visitorHistory, visitor.name);
          const historicalProcessEntry = visitorKind === 'amigo' && history?.processEntry ? history.processEntry : 'none';
          const processLocked = visitorKind === 'amigo' && historicalProcessEntry !== 'none';
          const effectiveProcessEntry = processLocked ? historicalProcessEntry : String(visitor.processEntry || 'none').trim() || 'none';
          const processStatusMeta = history?.processRegisteredWeek
            ? `Registrado en semana ${history.processRegisteredWeek}${history.processRegisteredDate ? ` · ${history.processRegisteredDate}` : ''}`
            : '';
          const convertedCell = visitorKind === 'visita'
            ? `<td data-label="Conversión" class="checkbox-cell col-conversion"><span class="member-admin-caption" title="Ya viene bautizado">N/A</span></td>`
            : `<td data-label="Conversión" class="checkbox-cell col-conversion"><input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="converted"${visitor.converted ? ' checked' : ''}></td>`;
          const promoteAction = visitorKind === 'visita'
            ? `<label class="visitor-promote-toggle"><input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="promoteToMember"${visitor.promoteToMember ? ' checked' : ''}> <span>Promover a miembro</span></label>`
            : '';
          const kindChip = `<span class="visitor-kind-chip is-${visitorKind}" title="${visitorKind === 'visita' ? 'Bautizado en restauración' : 'No bautizado'}">${visitorKind === 'visita' ? 'Visita' : 'Amigo'}</span>`;
          const visitorFlags = [];
          if (visitor.reachAttended) visitorFlags.push({ key: 'reach', label: 'Alc' });
          if (visitor.sundayAttended) visitorFlags.push({ key: 'sunday', label: 'Cul' });
          if (visitor.firstVisit) visitorFlags.push({ key: 'first', label: '1ª' });
          if (effectiveProcessEntry === 'noted') visitorFlags.push({ key: 'proc', label: 'Proc' });
          if (effectiveProcessEntry === 'late') visitorFlags.push({ key: 'late', label: 'Tard' });
          if (visitor.converted) visitorFlags.push({ key: 'conv', label: 'Conv' });
          if (visitor.contacted) visitorFlags.push({ key: 'cont', label: 'Cont' });
          const flagsHtml = visitorFlags.length
            ? visitorFlags.map((flag) => `<span class="vsum-flag" data-flag="${flag.key}">${flag.label}</span>`).join('')
            : '<span class="vsum-flag is-empty">sin marcas</span>';
          const displayName = String(visitor.name || '').trim() || `Visita ${index + 1}`;
          const invitedLabel = String(visitor.invitedBy || '').trim();
          const summaryCell = `
                  <td class="visitor-summary-cell" data-label="">
                    <button type="button" class="visitor-summary-toggle" data-action="toggle-visitor" data-visitor-index="${escapeHtml(index)}" aria-expanded="false">
                      <div class="vsum-main">
                        <span class="vsum-name">${escapeHtml(displayName)}</span>
                        <span class="vsum-meta">${visitorKind === 'visita' ? 'Visita' : 'Amigo'}${invitedLabel ? ` · invitó ${escapeHtml(invitedLabel)}` : ''}</span>
                      </div>
                      <div class="vsum-flags">${flagsHtml}</div>
                      <svg class="vsum-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </td>`;
          return `
                <tr class="is-collapsed">
                  ${summaryCell}
                  <td data-label="Nombre">
                    <div class="visitor-name-cell">
                      <select data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="kind" class="visitor-table-select" title="Tipo de visita">
                        <option value="amigo"${visitorKind === 'amigo' ? ' selected' : ''}>Amigo (no bautizado)</option>
                        <option value="visita"${visitorKind === 'visita' ? ' selected' : ''}>Visita (restauración)</option>
                      </select>
                      <input type="text" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="name" value="${escapeHtml(visitor.name)}" placeholder="Nombre">
                      ${kindChip}
                    </div>
                  </td>
                  <td data-label="Invitó">
                    <select class="visitor-table-select" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="invitedBy">
                      <option value="">— Quién invitó —</option>
                      ${state.invitedByOptions.map((option) => `<option value="${escapeHtml(option.value)}"${visitor.invitedBy === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                    </select>
                  </td>
                  ${showVisitorReach ? `<td data-label="${escapeHtml(reachStageLabel)}" class="checkbox-cell col-alcance">
                    <input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="reachAttended"${visitor.reachAttended ? ' checked' : ''}>
                  </td>` : ''}
                  ${showVisitorSunday ? `<td data-label="${escapeHtml(sundayStageLabel)}" class="checkbox-cell col-culto">
                    <input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="sundayAttended"${visitor.sundayAttended ? ' checked' : ''}>
                  </td>` : ''}
                  <td data-label="Primera vez" class="checkbox-cell">
                    <input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="firstVisit"${visitor.firstVisit ? ' checked' : ''}>
                  </td>
                  <td data-label="Proceso">
                    ${visitorKind === 'visita'
                      ? `<span class="member-admin-caption">Restauración</span>`
                      : processLocked
                      ? `<span class="member-admin-caption"${processStatusMeta ? ` title="${escapeHtml(processStatusMeta)}"` : ''}>${escapeHtml(getVisitorProcessStatusLabel(historicalProcessEntry))}</span>`
                      : `<select class="visitor-table-select" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="processEntry"${visitorKind === 'visita' ? ' disabled' : ''}>
                        ${(visitorKind === 'visita' ? visitorProcessOptionsByKind.visita : visitorProcessOptionsByKind.amigo).map((option) => `<option value="${escapeHtml(option.value)}"${visitor.processEntry === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                      </select>`}
                  </td>
                  ${showVisitorConversion ? convertedCell : ''}
                  ${showSeparateEventCapture ? separateEventColumns.map((specialEvent) => {
                    const specialEventName = String(specialEvent?.event || 'Evento').trim() || 'Evento';
                    const specialEventKey = String(specialEvent?.rcmKey || '').trim();
                    return `<td data-label="${escapeHtml(specialEventName)}" class="checkbox-cell event-col">
                      <input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="eventProgress:${escapeHtml(specialEventKey)}"${visitor.eventProgress?.[specialEventKey] ? ' checked' : ''}>
                    </td>`;
                  }).join('') : ''}
                  ${showVisitorContacted ? `<td data-label="Contactado" class="checkbox-cell col-contactado">
                    <input type="checkbox" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="contacted"${visitor.contacted ? ' checked' : ''}>
                  </td>` : ''}
                  <td data-label="Teléfono">
                    <input type="text" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="phone" value="${escapeHtml(visitor.phone || '')}" placeholder="Teléfono">
                  </td>
                  <td data-label="Observación">
                    <input type="text" data-visitor-index="${escapeHtml(index)}" data-visitor-update-field="note" value="${escapeHtml(visitor.note || '')}" placeholder="Observación">
                  </td>
                  <td data-label="Acciones">
                    <div class="visitor-actions-cell">
                      ${promoteAction}
                      <button type="button" class="danger" data-action="remove-visitor" data-visitor-index="${escapeHtml(index)}">Quitar</button>
                    </div>
                  </td>
                </tr>
          `;}).join('') : `
                <tr>
                  <td colspan="${visitorTableColspan}" class="empty-state">Todavía no hay visitas registradas para esta semana.</td>
                </tr>
          `}
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel panel-soft full-width${stageClass('alcance')}" data-stage="alcance">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Semanal</p>
            <h2>Niños</h2>
          </div>
        </div>
        <div id="kid-quick-form" class="visitor-quick-form">
          <label>
            <span>Nombre del niño</span>
            <input id="kid-quick-name" data-kid-quick-field="name" type="text" placeholder="Nombre completo" value="${escapeHtml(kidQuickForm.name || '')}">
          </label>
          <label>
            <span>Responsable</span>
            <input data-kid-quick-field="guardianName" type="text" placeholder="Mamá, papá o tutor" value="${escapeHtml(kidQuickForm.guardianName || '')}">
          </label>
          <div class="visitor-quick-toggles">
            ${showKidReach
              ? `<label id="kid-quick-reach-field" class="quick-toggle-field">
                <input id="kid-quick-reach" data-kid-quick-field="reachAttended" type="checkbox"${kidQuickForm.reachAttended ? ' checked' : ''}>
                <span>Alcance</span>
              </label>`
              : ''}
          </div>
          <div class="visitor-quick-actions">
            <button type="button" class="btn-with-icon" data-action="add-kid">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              <span>Agregar niño</span>
            </button>
            <button type="button" class="secondary btn-with-icon" data-action="reset-kid-quick" title="Vacía los campos del formulario rápido (no afecta a la tabla de niños)">
              <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>
              <span>Vaciar formulario</span>
            </button>
          </div>
        </div>
        <div class="helper-actions" aria-label="Atajos de niños">
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-stage-action="culto" data-action="fill-sunday-kids">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Todos al Culto</span>
          </button>
          <button type="button" class="secondary helper-action-button stage-action btn-with-icon" data-stage-action="culto" data-action="copy-kid-reach-to-sunday">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span>Alcance → Culto</span>
          </button>
          <button type="button" class="secondary helper-action-button btn-with-icon" data-action="clear-kids">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
            <span>Limpiar niños</span>
          </button>
        </div>
        <div class="member-summary">
          <span class="member-summary-label">Niños precargados de la célula</span>
          <div id="report-kid-pills" class="pill-row">${form.kids.filter((kid) => kid.source === 'catalog').map((kid) => `<span class="pill">${escapeHtml(kid.name || '')}</span>`).join('')}</div>
        </div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Niño</th>
                <th>Responsable</th>
                <th>Origen</th>
                ${showKidReach ? '<th>Alcance</th>' : ''}
                ${showKidSunday ? '<th>Culto</th>' : ''}
                <th>Observación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="kids-table-body">
              ${form.kids.length ? form.kids.map((kid, index) => `
                <tr>
                  <td data-label="Niño"><input type="text" data-kid-index="${escapeHtml(index)}" data-kid-field="name" value="${escapeHtml(kid.name || '')}" placeholder="Nombre"${kid.source === 'catalog' ? ' disabled' : ''}></td>
                  <td data-label="Responsable">
                    <input type="text" data-kid-index="${escapeHtml(index)}" data-kid-field="guardianName" value="${escapeHtml(kid.guardianName || '')}" placeholder="Responsable">
                  </td>
                  <td data-label="Origen">${escapeHtml(kid.source === 'catalog' ? 'Célula' : 'Visita')}</td>
                  ${showKidReach ? `<td data-label="Alcance" class="checkbox-cell">
                    <input type="checkbox" data-kid-index="${escapeHtml(index)}" data-kid-field="reachAttended"${kid.reachAttended ? ' checked' : ''}>
                  </td>` : ''}
                  ${showKidSunday ? `<td data-label="Culto" class="checkbox-cell">
                    <input type="checkbox" data-kid-index="${escapeHtml(index)}" data-kid-field="sundayAttended"${kid.sundayAttended ? ' checked' : ''}>
                  </td>` : ''}
                  <td data-label="Observación">
                    <input type="text" data-kid-index="${escapeHtml(index)}" data-kid-field="note" value="${escapeHtml(kid.note || '')}" placeholder="Observación">
                  </td>
                  <td data-label="Acciones">
                    ${kid.source === 'catalog'
                      ? '<span class="member-admin-caption">Precargado</span>'
                      : `<button type="button" class="secondary" data-action="remove-kid" data-kid-index="${escapeHtml(index)}">Quitar</button>`}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="${kidTableColspan}" class="empty-state">No hay niños cargados para esta célula.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel panel-soft full-width${stageClass('alcance')}" data-stage="alcance">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Extras de alcance</p>
            <h2>Ofrendas y supervisión</h2>
          </div>
        </div>

        <div class="metric-subgroup">
          <p class="metric-subgroup-title">Reunión de alcance</p>
          <div class="metric-fields">
            <label class="metric-field">
              <span>Ofrenda ($)</span>
              <input data-reach-meta-field="reachOffering" type="number" min="0" step="0.01" value="${escapeHtml(form.reachOffering || '0')}">
            </label>
          </div>
        </div>

        <div class="metric-subgroup">
          <p class="metric-subgroup-title">Participación externa</p>
          <div class="metric-fields">
            <div class="reach-supervision-box">
              <p class="reach-supervision-help">Registra aquí quién acompañó este alcance desde fuera de la célula: supervisión de sector, visita pastoral o hermanos de otra célula. Cada registro suma como hermano presente en esta célula esta semana.</p>
              <div class="reach-supervision-summary">${reachExternalSelected.length ? `${escapeHtml(`${reachExternalSelected.length} participante${reachExternalSelected.length === 1 ? '' : 's'} externo${reachExternalSelected.length === 1 ? '' : 's'}: `)}${reachExternalSelected.map((entry) => `${state.reachExternalKindLabel(entry.kind)} · ${entry.name}`).map(escapeHtml).join(', ')}` : 'Sin participación externa capturada.'}</div>
              <div class="reach-supervision-list">
                ${reachExternalRows.length ? reachExternalRows.map((entry) => {
                  const key = `${entry.kind}:${entry.personId || String(entry.name || '').toLowerCase()}`;
                  const meta = [state.reachExternalKindLabel(entry.kind)];
                  if (entry.relatedSector) meta.push(`Sector ${entry.relatedSector}`);
                  if (entry.homeCellNumber) meta.push(`Célula ${entry.homeCellNumber}`);
                  return `
                    <label class="reach-supervision-option">
                      <input
                        type="checkbox"
                        data-external-kind="${escapeHtml(entry.kind)}"
                        data-external-person-id="${escapeHtml(entry.personId || '')}"
                        data-external-name="${escapeHtml(entry.name)}"
                        data-external-sector="${escapeHtml(entry.relatedSector || '')}"
                        data-external-home-cell="${escapeHtml(entry.homeCellNumber || '')}"
                        ${selectedExternalKeys.has(key) ? ' checked' : ''}
                      >
                      <span class="reach-supervision-option-name">${escapeHtml(entry.name)}</span>
                      <span class="reach-supervision-option-meta">${escapeHtml(meta.join(' · '))}</span>
                    </label>
                  `;
                }).join('') : '<p class="member-admin-caption">No hay candidatos externos para esta célula.</p>'}
              </div>
              <div class="reach-external-add-row">
                <label>
                  <span>Hermano visitante</span>
                  <select data-external-member-visit-select>
                    <option value="">${escapeHtml(reachExternalMemberCandidates.length ? 'Selecciona un hermano' : 'No hay hermanos de otras células')}</option>
                    ${reachExternalMemberCandidates.map((entry) => `
                      <option value="${escapeHtml(entry.personId || '')}">${escapeHtml(`${entry.name} · Célula ${entry.homeCellNumber || '—'}`)}</option>
                    `).join('')}
                  </select>
                </label>
                <button type="button" class="secondary" data-action="add-external-member-visit">Agregar</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div class="stage-save-bar full-width${stageClass('alcance')}" data-stage="alcance">
        <button type="button" class="btn-save-next btn-with-icon" data-action="save-report-stage" data-next-stage="culto"${saveDisabledAttr}>
          <span>Guardar y continuar →</span>
        </button>
      </div>
      <section class="fn-shell__card panel panel-soft full-width${stageClass('culto')}" data-stage="culto">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Cierre cuatrimestral</p>
            <div class="baptism-title-row">
              <h2>Bautismos</h2>
              <div class="baptism-summary-pills">
                ${[1, 2, 3].map((quarter) => `
                  <span class="pill baptism-summary-pill${activeQuarter === quarter ? ' is-current' : ''}" title="${escapeHtml(activeQuarter === quarter ? `Cuatrimestre actual · Q${quarter}` : `Resumen Q${quarter}`)}">
                    <span class="baptism-summary-pill__label">Q${quarter}</span>
                    <strong class="baptism-summary-pill__value">${escapeHtml(baptismSummary[quarter])}</strong>
                  </span>
                `).join('')}
                <span class="pill baptism-summary-pill baptism-summary-pill--annual" title="Resumen anual de bautismos">
                  <span class="baptism-summary-pill__label">Anual</span>
                  <strong class="baptism-summary-pill__value">${escapeHtml(baptismSummary.total)}</strong>
                </span>
              </div>
            </div>
          </div>
          <button type="button" id="add-baptism-button" class="secondary btn-with-icon" data-action="add-baptism" title="${escapeHtml(baptismCaptureStatus.isAllowed ? '' : baptismRegistrationMessage)}">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
            <span>Registrar bautismo</span>
          </button>
        </div>
        <div class="member-summary">
          <span class="member-summary-label baptism-summary-caption">Bautismos del cierre del cuatrimestre</span>
        </div>
        <br>
        <div class="baptism-copy-block">
          ${baptismCaptureStatus.isAllowed
            ? ''
            : `<p class="member-admin-caption baptism-copy-note">${escapeHtml(baptismRegistrationMessage)}</p>
               <p class="member-admin-caption baptism-copy-note">Si marcas la opción de miembro, se agregará a la célula cuando guardes el reporte.</p>`}
        </div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Agregar como miembro al guardar</th>
                <th>Observación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="baptism-table-body">
              ${form.baptisms.length ? form.baptisms.map((entry, index) => `
                <tr>
                  <td data-label="Persona"><input type="text" class="fn-input" data-baptism-index="${escapeHtml(index)}" data-baptism-update-field="name" value="${escapeHtml(entry.name || '')}"></td>
                  <td data-label="Fecha"><input type="date" class="fn-input" data-baptism-index="${escapeHtml(index)}" data-baptism-update-field="baptismDate" value="${escapeHtml(entry.baptismDate || '')}"></td>
                  <td data-label="Origen">
                    <select class="fn-select" data-baptism-index="${escapeHtml(index)}" data-baptism-update-field="source">
                      <option value="report"${entry.source === 'report' ? ' selected' : ''}>Cierre</option>
                      <option value="fuera-cierre"${entry.source === 'fuera-cierre' ? ' selected' : ''}>Fuera de cierre</option>
                    </select>
                  </td>
                  <td data-label="Agregar como miembro" class="checkbox-cell"><input type="checkbox" data-baptism-index="${escapeHtml(index)}" data-baptism-update-field="promoteToMember"${entry.promoteToMember ? ' checked' : ''}></td>
                  <td data-label="Observación"><input type="text" class="fn-input" data-baptism-index="${escapeHtml(index)}" data-baptism-update-field="note" value="${escapeHtml(entry.note || '')}" placeholder="Observación"></td>
                  <td data-label="Acciones"><button type="button" class="baptism-action-button baptism-action-button--row" data-action="remove-baptism" data-baptism-index="${escapeHtml(index)}">Quitar</button></td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" class="empty-state">${escapeHtml(baptismCaptureStatus.isAllowed ? 'Todavia no hay bautismos registrados para este cierre.' : baptismRegistrationMessage)}</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
      <div class="stage-save-bar full-width${stageClass('culto')}" data-stage="culto">
        <button type="button" class="btn-save-next btn-with-icon" data-action="save-report-stage" data-next-stage="cierre"${saveDisabledAttr}>
          <span>Guardar y continuar →</span>
        </button>
      </div>
      <details class="metrics-section-collapse full-width${stageClass('cierre')}" data-stage="cierre">
        <summary class="metrics-section-summary">
          <span>Metricas del reporte</span>
          <span class="metrics-section-chevron">▾</span>
        </summary>
        <div class="metrics-grid metrics-grid--compact" id="metric-sections">${metricSectionsHtml}</div>
      </details>
      <section class="panel panel-soft full-width${stageClass('cierre')}" data-stage="cierre">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Cierre</p>
            <h2>Notas del reporte</h2>
          </div>
        </div>
        <label class="fn-field">
          <span>Observaciones</span>
          <textarea name="notes" data-report-field="notes" rows="5" class="fn-input" placeholder="Observaciones de la reunión, seguimiento o acuerdos.">${escapeHtml(form.notes || '')}</textarea>
        </label>
        <div class="fn-form-actions cierre-actions">
          <button type="button" class="btn-with-icon" data-action="open-preview-current-report">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Vista previa</span>
          </button>
        </div>
      </section>
      <div class="stage-save-bar full-width${stageClass('cierre')}" data-stage="cierre">
        <button type="button" class="btn-save-next btn-with-icon" data-action="save-report-stage" data-next-stage="cierre"${saveDisabledAttr}>
          <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>Finalizar reporte</span>
        </button>
      </div>
      ${renderReportHistory(state)}
      ${renderHistoryPreviewDialog(state)}
      ${renderPreviewVisitorsDialog(state)}
      ${renderConfirmDialog()}
    </section>
  `;
}