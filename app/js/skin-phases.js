/* Phases view entry point. Shared record and paper policy: alternate-views.js. */
function renderDayBody_phases(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  return day ? AlternateViews.phases(day, options) : '';
}
