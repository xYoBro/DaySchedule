/* Bands uses the approved page renderer. Shared dispatch still exposes a body
 * renderer for callers that compose their own shell; the app and print pipeline
 * use BandLayout.page() so header, notes and fitting stay identical.
 */
function renderDayBody_band(dayId, dayOverride, options) {
  const day = dayOverride || Store.getDay(dayId);
  return day ? BandLayout.body(day, options) : '';
}
