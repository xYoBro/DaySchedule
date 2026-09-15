/* Group agendas beneath a shared timeline. Group membership is the organizing
 * axis; fitting may change panel widths, never move events between groups. */
function renderDayBody_cards(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  if (!day) return '';
  const data = AlternateViews.model(day), groups = AlternateViews.lanes(data);
  return '<div class="av-cards"><section class="av-shared"><h2 class="av-section-heading av-primary-heading">Main schedule' +
    (data.primaryLabel ? '<small>' + esc(data.primaryLabel) + '</small>' : '') + '</h2><div class="av-shared-timeline">' +
    (data.mains.length ? data.mains.map(event => AlternateViews.record(event, data, options)).join('') : '<p class="av-empty">No main events scheduled.</p>') + '</div></section>' +
    (groups.length ? '<div class="av-group-panels">' + groups.map(group => '<section class="av-group-panel" data-lane-group="' + esc(group.id) + '">' +
      '<h2 class="av-group-heading" style="--av-group-color:' + esc(group.color) + '">' + esc(group.name) + '</h2>' +
      AlternateViews.flow(group.events, data, { ...options, groupLabel: group.name }) + '</section>').join('') + '</div>' : '') + '</div>';
}

function layoutDayBody_cards(sheet) {
  const timeline = sheet.querySelector('.av-shared-timeline');
  const mains = Array.from(timeline.querySelectorAll('.av-main'));
  let height = Infinity, sharedColumns = 1;
  for (const count of [Math.min(3, Math.max(1, mains.length)), Math.min(2, Math.max(1, mains.length))]) {
    timeline.style.setProperty('--av-shared-columns', count);
    let position = 0;
    mains.forEach((event, index) => {
      const wide = !!event.querySelector('.av-flights') || (index === mains.length - 1 && position === 0);
      event.classList.toggle('av-shared-wide', wide);
      event.style.gridColumn = wide ? '1 / -1' : '';
      position = wide ? 0 : (position + 1) % count;
    });
    const measured = timeline.getBoundingClientRect().height;
    if (measured < height) { height = measured; sharedColumns = count; }
  }
  timeline.style.setProperty('--av-shared-columns', sharedColumns);
  let position = 0;
  mains.forEach((event, index) => {
    const wide = !!event.querySelector('.av-flights') || (index === mains.length - 1 && position === 0);
    event.classList.toggle('av-shared-wide', wide); event.style.gridColumn = wide ? '1 / -1' : '';
    position = wide ? 0 : (position + 1) % sharedColumns;
  });
  const panels = sheet.querySelector('.av-group-panels');
  if (!panels) return;
  const groups = Array.from(panels.querySelectorAll('.av-group-panel'));
  const heavy = groups.filter(group => group.querySelectorAll('.av-event').length > 4);
  panels.dataset.columns = groups.length === 1 ? '1' : '2';
  groups.forEach(group => group.classList.toggle('av-group-wide', groups.length === 1 || heavy.includes(group)));
  groups.forEach(group => AlternateViews.arrange(group.querySelector('.av-flow'), group.classList.contains('av-group-wide') && group.querySelectorAll('.av-event').length > 3 ? 2 : 1));
  panels.style.removeProperty('grid-template-columns');
  if (groups.length === 2 && !heavy.length) {
    let best = Infinity, width = 50;
    for (const candidate of [50, 60, 40, 70, 30]) {
      panels.style.gridTemplateColumns = candidate + 'fr ' + (100 - candidate) + 'fr';
      const height = panels.getBoundingClientRect().height;
      if (height < best) { best = height; width = candidate; }
    }
    panels.style.gridTemplateColumns = width + 'fr ' + (100 - width) + 'fr';
  }
}
