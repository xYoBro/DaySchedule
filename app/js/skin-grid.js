/* Time × groups matrix. Full shared events span the group columns. Records
 * occur only at their start; full intervals replace duplicated continuations. */
function renderDayBody_grid(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  if (!day) return '';
  const data = AlternateViews.model(day), groups = AlternateViews.lanes(data);
  const slots = [...new Set(data.events.map(event => event.startTime))];
  const columns = Math.max(1, groups.length);
  const rows = slots.flatMap(slot => {
    const mains = data.mains.filter(event => event.startTime === slot).map(event => ({ slot, main: event }));
    return mains.concat(data.concurrent.some(event => event.startTime === slot) ? [{ slot }] : []);
  });
  const coveredUntil = new Map();
  const markup = rows.map((row, index) => {
    if (row.main) return '<tr class="av-matrix-main"><th scope="row">' + esc(row.slot) + '</th><td colspan="' + columns + '">' + AlternateViews.record(row.main, data, options) + '</td></tr>';
    return '<tr class="av-matrix-assignments" data-start="' + esc(row.slot) + '"><th scope="row">' + esc(row.slot) + '</th>' + groups.map(group => {
      if ((coveredUntil.get(group.id) || 0) > index) return '';
      const events = group.events.filter(event => event.startTime === row.slot);
      let next = index + 1;
      // Join later blank cells only while every event in this cell continues.
      // Never cross a shared banner or obscure a new assignment in this group.
      if (events.length) while (next < rows.length && !rows[next].main &&
        events.every(event => event.endTime > rows[next].slot) &&
        !group.events.some(event => event.startTime === rows[next].slot)) next++;
      coveredUntil.set(group.id, next);
      return '<td data-lane-group="' + esc(group.id) + '" rowspan="' + (next - index) + '">' +
        AlternateViews.flow(events, data, { ...options, groupLabel: group.name }, 'av-cell-events') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="av-grid"><table class="av-matrix"><caption>Time × groups' +
    (data.primaryLabel ? '<small>Main schedule: ' + esc(data.primaryLabel) + '</small>' : '') + '</caption>' +
    '<colgroup><col class="av-clock-column">' + Array.from({ length: columns }, () => '<col class="av-lane-column">').join('') + '</colgroup>' +
    '<thead><tr><th scope="col">Starts</th>' + (groups.length ? groups.map(group => '<th scope="col" data-lane-group="' + esc(group.id) + '" style="--av-group-color:' + esc(group.color) + '">' + esc(group.name) + '</th>').join('') : '<th scope="col">Main schedule</th>') + '</tr></thead><tbody>' +
    (slots.length ? markup : '<tr><td colspan="' + (columns + 1) + '"><p class="av-empty">No events scheduled.</p></td></tr>') + '</tbody></table></div>';
}

function layoutDayBody_grid(sheet) {
  const table = sheet.querySelector('.av-matrix'), columns = Array.from(table.querySelectorAll('.av-lane-column'));
  // Keep each group in a fixed column, but let a detail-heavy audience use
  // more width. Never turn the matrix into a flowing list to satisfy Fit.
  columns.forEach(column => column.style.removeProperty('width'));
  const arrange = () => {
    table.querySelectorAll('.av-cell-events').forEach(flow => {
      if (flow.getBoundingClientRect().width * .75 > 300) AlternateViews.compactFlow(flow);
      else AlternateViews.arrange(flow, 1);
    });
  };
  if (columns.length === 2) {
    let best = Infinity, width = 50;
    const available = table.getBoundingClientRect().width - 35 / .75;
    for (const candidate of [50, 60, 40, 70, 30, 80, 20, 65, 75]) {
      columns[0].style.width = available * candidate / 100 + 'px'; columns[1].style.width = available * (100 - candidate) / 100 + 'px';
      arrange();
      const height = table.getBoundingClientRect().height;
      if (height < best) { best = height; width = candidate; }
    }
    columns[0].style.width = available * width / 100 + 'px'; columns[1].style.width = available * (100 - width) / 100 + 'px';
  }
  arrange();
}
