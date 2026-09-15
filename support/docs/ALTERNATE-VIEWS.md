# Alternate views: restore the original purposes

Status: local revision on `codex/refine-alternate-views`, based on `c0e25f7`.
Not merged. Bands remains unchanged. The representative dense examples now
fit one Letter sheet per day in every alternate view; see the capacity table.

## What the original views were

The April 11 design specification and original implementation commits describe
three different tasks, not three styles of the Bands composition:

| View | Original purpose | Restored structure |
| --- | --- | --- |
| Grid | Compare groups at the same time. | Time × group matrix; main events span group columns. |
| Cards | Read a group's complete agenda. | Shared timeline above dedicated group panels. |
| Phases | Follow an exercise's named phases. | One vertical sequence of phase headers and nested tasks. |

Sources: [original specification](superpowers/specs/2026-04-11-themes-design.md),
`c0cf60e` (Grid), `efe0854` (Cards), `5b071fb` (Phases), and the mature renderers
in `3adfd88`. The previous revision's chronological ledger and main/assignment
columns passed content and fit checks but lost the original organizing axes.
Those checks did not establish design fidelity.

Supporting research: Nielsen Norman Group describes cards as containers for
related information ([Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/)).
Its [comparison-table guidance](https://www.nngroup.com/articles/comparison-tables/)
supports consistent row and column headings and alignment. Applying those
principles here means grouping an agenda by audience in Cards, and preserving
time alignment across audiences in Grid. This is a design inference, not a
usability study of DaySchedule. Original product intent governs the restoration.

## Rendering and data

Each skin owns its structure and arrangement in `skin-cards.js`, `skin-grid.js`
and `skin-phases.js`. `alternate-views.js` shares complete event records, explicit
name parsing, paper furniture, strict overlap references and bounded fitting.
The fitter no longer replaces a matrix or phase sequence with a generic list.

Grid prints each event once at its start, with its full interval. A cell joins
subsequent empty rows only while all its events are still running, without
crossing a shared banner or hiding a new assignment. Row heights accommodate
text and are not proportional to minutes. Cards preserves each group's complete
agenda, with two internal columns when a large panel needs them. Main timeline
cards retain their metadata; wide flight blocks and a final lone card can span
the shared timeline. Grid measures group widths and chooses one or two columns
inside a busy cell without moving records to a different group or start time. Phases keeps complete tasks within a single parent only
when the existing containment rule allows it. Adjacent independent clusters may
share a label, but never acquire an invented parent. Phase timing still uses the
existing event model; no untimed-phase or trigger fields have been added. In
the tightest format, a single dotted-rail key replaces repeated independent-task
headings. Contained tasks remain nested; the phase sequence never flows across
columns.

All names and details remain, including literal free text, duplicate attendee
entries and changing flight locations/POCs. No surname inference, automatic
roster highlighting or automatic attendance reclassification is introduced.
Group headings replace redundant audience labels within those same panels or
columns. References use full time overlap, excluding touching endpoints.

The existing editor controls, themes, optional one-inch logo, free title/subtitle,
manual emphasis and Notes & Reminders space remain. The pictured Open/Edit/Save
pills were static spans, not broken action handlers; they now look like plain
instructions. Actual Open/Create/Save actions are unchanged. A second defect
found during live review is fixed: alternate paper now refits after the library
reveals the editor, preventing false initial overflow warnings.

## Paper limits and current capacity

Fit remains Letter portrait with half-inch margins and 1¼ inches reserved for
notes by default. The existing larger reminder-area choices remain. Fitting
reduces whitespace before text, never zooms the whole page and never drops fields.
Floors: details 9 pt; ordinary small/literal attendee lists 10.5 pt, reducing to
9.5 pt in the final compact treatment; large parsed rosters 9.5 pt; concurrent
titles 10 pt; main titles 11.5 pt; badges/footer 8 pt. Compact lists still use the
largest type that fits. Short assignments use punctuated inline fields; large
rosters and literal multiline entries remain complete blocks. Times occupy the
first line even when a title wraps. No roster is split between event records.

| Example | Cards | Grid | Phases |
| --- | --- | --- | --- |
| Four-group exercise, both days | Fits | Fits | Fits |
| Empty, light, main-only, concurrent-only | Fits | Fits | Fits |
| Normal 15-surname Saturday / Sunday | Fits / Fits | Fits / Fits | Fits / Fits |
| 40 surnames + flights, both days | Fits | Fits | Fits |
| Long 15-concurrent-event stress example, both days | Fits | Fits | Fits |

The fixed examples are enforced in Chromium and WebKit, including long titles,
locations, missing optional fields, full-time overlaps and assignments in gaps.
One-page capacity is finite: larger notes reservations, many groups or arbitrary
amounts of text may still exceed the bounds. Bands retains its approved fitter.

Fit blocks oversized app print jobs; native printing issues a not-ready notice
instead of partial content. Explicit Readable output retains all information
across additional sheets. It remains available for oversized data and does not satisfy the
one-day-per-sheet requirement; the representative review examples use Fit. The comparison
uses actual PDF page counts, not a misleading Saturday/Sunday selector on a
multi-page output.

## Verification and review

- 680 browser harness checks and real-app journeys passed across both engines.
  New red-to-green regressions cover the false-button styling, group membership,
  matrix alignment/continuation cells, vertical phases and library-reveal fitting.
- 306 day renders passed independent content, name, group/row placement,
  interval-reference, type-floor, repeat-fitting stability, reminder reservation
  and data-preservation checks in Chromium 147
  and WebKit 26.4. Includes 16 two-day seeds per view and engine, fixed examples,
  six narrow-screen event/reminder editing journeys and Mono rendering.
- 30 actual PDF files / 57 Letter pages passed physical text bounds and minimum
  glyph-size checks. Print review caught and corrected floating references
  displacing flight logistics; clearance and alignment now have explicit
  regressions. Field-specific floors are
  checked in the DOM; representative actual PDF pages are visually reviewed.
- Heavy 48-event tests passed explicit Fit blocking and complete Readable output
  on Letter/A4. The approved eight-page Bands PDF suite passed; frozen Bands
  source hashes match. Both distribution builds pass nine packaging checks.
- Chromium/WebKit embed, file boot, CSP, remount and save checks passed. The
  working-app review's Load, view switching and edit-preservation paths passed.
  All 42 displayed PDF images and comparison selectors passed local-file checks.
- Firefox could not launch in this runtime. Native file/print dialogs, physical
  printers, live SharePoint and comprehension by real readers remain unverified.

Run the regular browser harness with `node support/tests/test-browser.cjs`.
For the matrix, run `node support/tests/test-alternate-views.cjs`; set
`DAYSCHEDULE_BROWSERS`, `DAYSCHEDULE_VIEW_SKINS` or `DAYSCHEDULE_VIEW_SEEDS` for
focused replay, `DAYSCHEDULE_VIEW_RANDOM_ONLY=1` to replay seeds separately,
and `DAYSCHEDULE_PLAYWRIGHT_MODULE` if Playwright is installed outside the
default module path.

`python3 support/tests/build-alternate-review.py` requires pdfplumber, pypdf and
Poppler. It builds ignored `output/alternate-views/review.html` and
`Views-comparison.pdf` from real PDF output. The portable comparison is read-only.
`support/tests/alternate-integration.html` is a separate developer page using the
actual app; serve it on an isolated loopback origin. It loads synthetic data only
when Load example is chosen. Production app bundles contain neither developer
fixture data nor the fixture loader. No heartbeat was created.
