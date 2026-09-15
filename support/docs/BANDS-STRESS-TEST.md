# Bands and editor stress test — 2026-09-14

Build under test: `2026-09-14+fcf78defd098`, based on merged commit `2388861` with the two corrections below. All workbooks and names in these tests are synthetic. Operational files and the user's browser profile are not used.

## Findings and corrections

1. **Premature third column.** Chromium 147 and WebKit placed the approved 40-name Sunday in three columns. The original fitter tried only equal widths or a moderately wider right column. Measured two-column layouts showed that a wider roster column would fit at the existing font floors. The fitter now also tries 36:64 and the corresponding wider-left allocations before introducing a third column. The complete roster stays together. No typography or margins were reduced.
2. **Blank first printed sheet.** An actual Chromium PDF had a blank page before its scheduled day. The empty editor wrapper started in the default page context before the first named Bands page. Giving the printing document that same named page context removes the extra page. This rule applies only to printing Bands.

Two automation issues were also corrected: the older real-app script expected the retired `readable` Bands print option, and geometric PDF text extraction interleaved a wrapped title with adjacent-column text. The script now expects the approved `fit` option and reads PDF content-stream order; actual pagination, content and physical checks remain enforced.

## Coverage

- 100 reproducible seeds, two days each, rendered in isolated Chromium 147.0.7727.15 and WebKit 26.4 contexts. The same seeds run in both engines.
- Eight input categories: empty, main-only, staggered concurrent events, a 40-entry roster, 15–25 concurrent events, long text, deliberate overload, and exact interval boundaries/gaps. The overload category includes 51 events and a 200-entry roster. These are adversarial samples, not estimates of how often real schedules contain each pattern.
- Unsorted source events, equal start times, full and endpoint-only overlaps, gaps, 15/40/200-entry rosters, duplicate surnames, full names, Unicode, explicit separator modes, literal markup, long uninterrupted tokens, flight activities with shared/differing times, optional fields, themes, optional logo and all three notes reservations.
- Independent numeric overlap and generated-attendee oracles check the app's rendered output. Each event must appear once; the concurrent order and both ends of every reference must agree. Fields, notes and attendee entries must survive workbook round trips. Repeated fitting must be stable.
- Fitting pages must honor Letter geometry, half-inch margins, notes clearance and type floors. Text ranges are checked inside event boundaries. Over-capacity pages must retain complete editable content and show a warning. App print blocking is checked against the measured day results.
- Each browser's real-control UI run creates 32 events and performs 64 seeded edit/delete sequences, including repeated Undo/Redo, day switches, name formatting, logo/notes settings, editing at 390 px, and an actual download/reopen round trip. The application's 800 ms undo grouping is respected between transactions; additions exercise bursts of input.
- The existing unit, persistence and UI harnesses plus normal application workflows run separately. Actual PDF pages are checked for page count, fields, names, font sizes and margins, with representative dense pages visually inspected.

## Results

All completed checks passed after the corrections above.

| Check | Result |
| --- | --- |
| Randomized layouts | 400 day renders: 200 distinct generated days in each of two engines; zero failures |
| Event and roster fidelity | 6,536 event instances and 25,056 structured attendee entries checked across both engines; literal attendee fields checked separately |
| Capacity outcomes | In each engine, 73 days fit and 127 deliberate stress inputs produced complete editable overflow with a warning; outcomes agreed between engines |
| Workbook round trips | 100 generated workbooks per engine; no content changes |
| UI stress | 96 add/edit/delete sequences per engine, including 32 newly created events, Undo/Redo, mobile edits and download/reopen; no uncaught page errors |
| Existing harnesses | 134 unit + 68 persistence + 120 UI checks per engine, plus normal application workflows; 644 harness checks total |
| Actual PDF output | Eight approved pages plus four randomly selected fitting days: correct Letter page counts, complete fields/names and font floors; the four random pages also passed independent PDF ink-margin checks |
| Build checks | Nine packaging regressions, syntax checks and diff whitespace checks passed; both distributions rebuilt |

The approved forty-name Sunday, the fifteen-concurrent-event Saturday and all four selected random PDF pages were visually inspected. The random set includes a monochrome specimen. The combined 12-page proof is `output/pdf/bands-stress-proof.pdf`. The high overflow fraction reflects intentionally excessive input categories and does not estimate the failure rate of real schedules.

## Reproduce

Use the repository's existing Playwright installation and browser binaries. Set `DAYSCHEDULE_PLAYWRIGHT_MODULE` if Playwright is installed outside Node's search path. PDF checks require Poppler, Python and `pdfplumber`.

```sh
DAYSCHEDULE_BROWSERS=chromium,webkit node support/tests/test-bands-random.cjs
python3 support/tests/verify-bands-random.py output/playwright/monte-carlo
node support/tests/test-bands-pdf.cjs
DAYSCHEDULE_BROWSERS=chromium,webkit node support/tests/test-browser.cjs
python3 tools/test-builds.py
```

Use `--layout-only` or `--ui-only` to run either part separately. `DAYSCHEDULE_SEEDS` defaults to 100, and `DAYSCHEDULE_START_SEED` defaults to 1. For example, replay seed 17 with `DAYSCHEDULE_START_SEED=17 DAYSCHEDULE_SEEDS=1` and `--layout-only`. Failures save the complete generated specimen, seed, error and screenshot. `--pdf-only` regenerates the PDF selections in an existing result directory using current source.

Evidence from this session:

- `output/playwright/monte-carlo-layout/results.json`: final randomized layout and workbook checks.
- `output/playwright/monte-carlo-ui-final/results.json`: final UI actions and download/reopen checks.
- `output/playwright/monte-carlo-proof/`: final-source random PDFs and physical verification.
- `output/playwright/bands-release/`: eight approved PDF pages and the overflow guard.
- `output/playwright/release/browser-results.json`: normal harnesses and application journeys.

## Limits

Randomized testing samples inputs; it does not prove that every possible schedule fits or that every UI sequence is safe. Deliberate overflow is an expected result, not a failure. The suite does not force arbitrary amounts of text onto one sheet.

The installed Firefox automation browser failed during startup with sandbox/framebuffer errors, before app tests ran. Firefox coverage remains blocked. These checks do not certify current branded Safari/Edge, native OS file pickers, physical printers or a live SharePoint deployment.
