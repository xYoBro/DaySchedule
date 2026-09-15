# Cards, Grid and Phases

Implemented on `codex/refine-alternate-views`, based on main `3adfd88`.
The approved Bands renderer, fitter, palettes and stylesheet are unchanged.

## Reading paths

| View | Purpose | Dense days |
| --- | --- | --- |
| Cards | Read a complete main event or assigned commitment. | Measures main/assignment columns against a wide main section with two assignment columns. |
| Grid | Find an event by start time, with its full time interval. | Continues down the left column, then down the right. Each event appears once. |
| Phases | See activities in the context of a main block. | Keeps phases intact; measures continuous columns against full-width complex phases. |

Grid is now a chronological table rather than audience lanes with repeated
continuation cells. Phases retains the existing containment rule: only an
assignment wholly inside one eligible main block nests beneath that block.
Spanning assignments and assignments in gaps remain independent records.
References appear beside every main event with a strict time overlap; touching
endpoints do not overlap. References and record numbers share one model.

The main schedule has larger titles and stronger section treatment. Names are
prominent without making every concurrent title bold. Only the saved emphasis
setting highlights an event; roster length never chooses emphasis. Flights
remain inside their parent event, with internal activity times. Changing venues
and POCs stay beside the activity they describe.

These choices apply the earlier research principles of grouping, consistent
reading order, restrained hierarchy and preserving context. They are design
judgments, not evidence that this specific layout has passed novice-user testing.

## Existing controls

No new workbook fields or editor workflow are introduced. Placement, attendance,
free-text/name-list formatting, emphasis and flight activities use the same
controls as Bands. The familiar Customize dialog now exposes its existing
one-inch logo toggle and reminder-space choice in all layouts. The title is
free text, with an optional subtitle. These settings are still stored under
`theme.bands` for workbook compatibility and are shared when switching views.

Event selection, keyboard activation, numbered-reference navigation, reminder
editing and header customization work from all three paper previews. Renderers
read normalized data; fitting changes DOM arrangement, never event data.

## Paper contract

Default **Fit each day on one page** is US Letter portrait with half-inch margins.
The logo is an optional one-inch square. Notes & Reminders reserves 1¼ inches by
default, with existing 1½-inch and 2-inch choices. Fitting tries whole-record
arrangements and reduces spacing before type. It never zooms the whole sheet.

Minimums are 9 pt for details, 10.5 pt for short/literal attendee lists, 9.5 pt
for parsed rosters of eight or more entries, 10 pt for concurrent titles and
11.5 pt for main titles. Badges and the footer use 8 pt. Main type and spacing
grow on lighter days, within caps. Every entered name remains available;
literal text is not split or converted to surnames.

When Fit cannot meet these limits, the editor shows all content with an overflow
notice. App printing blocks that job. Native printing produces an explicit
not-ready notice rather than a clipped schedule. **Readable pages** remains an
explicit alternative that can span sheets at comfortable type. It does not
satisfy the one-day-per-sheet contract and is never silently selected.

## Verification — 2026-09-15

- Chromium 147 and WebKit 26.4: 676 harness checks, real-app journeys and two
  complete new-author journeys passed. Event/ref/notes editing and logo/reminder
  settings have alternate-view coverage.
- 294 day renders: 90 fixed examples, 192 generated cases (16 two-day seeds ×
  three views × two engines), and 12 Mono renders. Checks preserve every event,
  field, attendee entry, flight detail and reminder, verify numbering/overlaps,
  enforce type floors and detect mutation of persisted event data.
- All three views fit both normal 15-surname days and both 40-surname days,
  including timed flights, on one Letter page each. Main-only, light, empty and
  concurrent-only fixtures also fit. The deliberately longer 15-concurrent-event
  fixture overflows in Cards and Phases; Grid fits its Sunday only. Generated
  overflow is an expected outcome, not a promise that arbitrary input fits.
- Six narrow-screen event/reminder editing journeys passed at 390 px, with no
  document-width overflow. Keyboard interactions are covered in the harness.
- Actual Chromium PDFs: 27 files / 58 Letter pages. Extracted text checks retain
  fields and names; a separate physical audit checks half-inch text bounds and
  the 8 pt auxiliary floor. Representative normal, dense, light and grayscale
  pages were visually reviewed. Field-specific floors are checked in the DOM.
- Heavy 48-event print fixture: six Fit jobs blocked as expected; six explicit
  Readable PDFs preserve all descriptions in Letter/A4 output.
- Bands: all four frozen source files match their baseline SHA-256 hashes;
  eight before/after print pages are pixel-identical. Its PDF/overflow suite passed.
- Nine packaging checks and Chromium/WebKit embed, CSP, remount, download,
  local-file boot and cross-origin save checks passed. Both distributions rebuilt.

Firefox could not launch in this runtime. These checks do not certify actual
Safari/Edge applications, native print dialogs, physical printers or a live
SharePoint installation. Real readers should still review comprehension on paper.

## Reproduce and review

Set `DAYSCHEDULE_PLAYWRIGHT_MODULE` if Playwright is outside the usual module
path and `DAYSCHEDULE_BROWSERS=chromium,webkit` to select tested engines.

```sh
node support/tests/test-alternate-views.cjs
python3 support/tests/build-alternate-review.py
node support/tests/test-browser.cjs
node support/tests/test-authoring-ui.cjs
node support/tests/test-print-pdf.cjs
node support/tests/test-bands-pdf.cjs
python3 tools/test-builds.py
node tools/test-embed.cjs
```

`DAYSCHEDULE_VIEW_SEEDS` controls the random sample count (default 16).
The review builder requires pdfplumber, pypdf and Poppler's pdftoppm.
Evidence is ignored under `output/playwright/alternate-views` and
`output/alternate-views`. The latter contains a standalone `review.html` with
30 switchable print images, a 12-page `Views-comparison.pdf` and the physical
audit JSON. It uses synthetic fixtures, makes no network requests and never
opens the app or changes its saved schedule. No heartbeat was created.
