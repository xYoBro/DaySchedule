/* A vertical sequence of named phases, with contained tasks nested beneath
 * each phase. Spanning/gap assignments keep an explicit independent position. */
function renderDayBody_phases(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  if (!day) return '';
  const data = AlternateViews.model(day), phases = [];
  buildPhaseGroups(day.events || [], Store.getGroups())
    .sort((a, b) => a.sortEvent.startTime.localeCompare(b.sortEvent.startTime) || Number(!!b.event) - Number(!!a.event))
    .forEach(phase => {
      const previous = phases[phases.length - 1];
      if (!phase.event && previous && !previous.event && previous.label === phase.label) previous.tasks.push(...phase.tasks);
      else phases.push({ ...phase, tasks: phase.tasks.slice() });
    });
  return '<div class="av-phases"><h2 class="av-section-heading av-primary-heading">Phases' +
    (data.primaryLabel ? '<small>Main schedule: ' + esc(data.primaryLabel) + '</small>' : '') +
    (phases.some(phase => !phase.event) ? '<small class="av-phase-key">Dotted rail: independent tasks</small>' : '') + '</h2><ol class="av-phase-sequence" aria-label="Phase sequence">' +
    (phases.length ? phases.map(phase => '<li class="av-phase' + (phase.event ? '' : ' av-independent') + '"' + (!phase.event ? ' aria-label="' + esc(phase.label) + '"' : '') + '>' +
      (phase.event ? AlternateViews.record(phase.event, data, options) : '<h3 class="av-independent-label">' + esc(phase.label) + '</h3>') +
      (phase.tasks.length ? AlternateViews.flow(phase.tasks.map(task => task.event), data, options) : '') + '</li>').join('') : '<li class="av-empty">No events scheduled.</li>') + '</ol></div>';
}

function layoutDayBody_phases(sheet) {
  sheet.querySelectorAll('.av-phase .av-flow').forEach(flow => {
    AlternateViews.compactFlow(flow);
  });
}
