/* Cards view entry point. Shared record and paper policy: alternate-views.js. */
function renderDayBody_cards(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  return day ? AlternateViews.cards(day, options) : '';
}
