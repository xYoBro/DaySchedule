/* Grid view entry point. Shared record and paper policy: alternate-views.js. */
function renderDayBody_grid(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  return day ? AlternateViews.grid(day, options) : '';
}
