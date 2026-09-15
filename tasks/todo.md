# Reliability release

## Integrate the approved banded prototype — 2026-09-14

- [x] Preserve the current app shell; port the approved paper renderer/fitter
  into app modules with scoped CSS and a shared screen/print path.
- [x] Add compatible persisted settings for optional logo, subtitle, emphasis,
  attendee splitting and nested flight activities; expose them in existing
  Customize and event inspector controls. Preserve literal input and Store flow.
- [x] Replace Bands whole-page scaling with bounded type/spacing fitting and
  explicit overflow handling. Preserve other layouts and print lifecycle.
- [x] Verify old/new workbook round trips, editing, selection, Undo/Redo,
  no-concurrent/15/40/stress/flight cases and actual PDFs; rebuild distributions.
- [x] Update product docs and provide a main-app review build. Record a
  subsequent review of Grid, Cards and Phases after Bands is settled.

Baseline: nine build regressions pass. Existing app source changes are retained;
pre-integration source is banked under output/integration-baseline. Risks:
schema round trips, old workbooks, print lifecycle, scoped styles and page fit.

Completed: shared app renderer/fitter, scoped paper styles and additive controls are integrated. Existing workbook format 1 imports; new saves use format 2 so the old app refuses to discard new fields. 134 unit, 68 integration and 120 UI checks pass, along with nine build checks. Eight color/eight grayscale PDF pages pass field retention and physical checks. Both distributions rebuilt. Current proof: output/pdf/integrated-bands. Cross-engine/native/SharePoint release checks remain as documented in BANDS-PRINT-RELEASE.md. Other-mode design review is the next phase after Bands review.

## Evaluate the external dense-layout critique — 2026-09-14

- [x] Use full interval overlap for badges while retaining one complete record
  per event and the user's confirmed attendance rule.
- [x] Use the same field order for small/large concurrent entries; keep manual
  emphasis and distinguish long-roster capacity from highlighting.
- [x] Add possible concurrent-assignment text clashes to the author review,
  without inferring identity or flagging intended main-schedule exceptions.
- [x] Exercise gap/spanning/boundary cases, missing fields, long text and a
  fifteen-concurrent-event specimen, including actual printed output.

Scope: isolated prototype. Baseline layout and 15 input tests pass.

Completed: full overlap references, consistent concurrent field order and
advisory literal-entry clashes. Eight color and eight grayscale PDF pages pass
field retention, ink margins, fixed regions and name-size checks; all eight
color pages and dense grayscale visually inspected. Normal 15/40-name cases
retain two columns. The synthetic 15-event Saturday uses true sequential third
column overflow; Sunday remains two. Print inspection required 4 pt clearance
and a smaller tight roster-heading gap. Current proof: output/pdf/critique-review-proof.
Detailed decisions: output/prototypes/day-first-adaptive/CRITIQUE-REVIEW.md.

## Align main-event details — 2026-09-14

- [x] Anchor location and POC consistently without displacing them for badges.
- [x] Clarify the two Sunday training titles in the isolated sample adapter.
- [x] Check 15/40-name, logo-on, flights and light/main-only layouts; retain
  two columns and type floors. Baseline contract and input checks pass.

Completed: location and POC start at identical horizontal coordinates within
each page. 15/40-name busy specimens keep two columns; light and main-only cases
fit, including a logo-off comparison. Four color and four grayscale PDF pages
pass field retention, font floors and physical margins. PDF inspection required
2 pt print clearance; the dense Sunday uses .85 text scale with 11.5 pt main
titles, 10.5 pt small-event names, 9.5 pt roster names and 9 pt details. Current
proof: output/pdf/aligned-details-proof.

## Optional banded-page logo — 2026-09-14

- [x] Add a Show logo control, conditional header markup, URL persistence and
  logo-aware fit reporting. Reclaim the logo's column and unused header height.
- [x] Verify on/off/restoration/reload on complete 40-name days, with timed
  Sunday flights, identical event text and fixed notes. Existing checks pass.


## Main-band boundaries and simpler references — 2026-09-14

- [x] Remove the confusing gap-reference strip; keep times in complete event
  entries and retain valid links from main bands.
- [x] Add quiet main-event separators without changing event height; inspect
  dense and light examples in color and grayscale.
- [x] Refresh the four-page print proof and check content, margins and fit.

Scope: adaptive prototype only. Baseline layout and 15 input checks pass.
Completed: 15/40-name pages fit in two columns; gap-event badges have no false
links, and all actual links resolve. Four color and four grayscale PDF checks
pass, with all color pages and dense grayscale visually reviewed. Current proof:
output/pdf/band-boundaries-proof. Thin rules leave fixed regions and type floors
intact. Light and main-only samples also pass browser checks.

## Restore continuous concurrent-event reading — 2026-09-14

- [x] Replace independently balanced horizontal sections with continuous,
  chronological columns. Exhaust two-column spacing/type options before a third.
- [x] Keep every event together. The user's correction makes 40 surnames the
  capacity specimen; remove the roster-continuation experiment and reduce
  large-roster names independently when needed.
- [x] Verify typical 15-name, 40-name, flight, light and main-only specimens;
  inspect the actual reading path as well as physical fit. Replace the rejected
  proof link only with a verified current specimen.

Scope: isolated banded prototype. Baseline contract and 15 parser cases pass.
Research supports predictable structure; it does not validate three columns as
the optimum. Existing three-column packet is banked, not an accepted design.

Completed: all requested surname specimens fit at most two continuous columns.
The 40-surname timed-flight Sunday uses 9.5 pt roster names and 10.5 pt names in
smaller events. Normal 15-name pages retain 12 pt names. Four color and four
grayscale PDF pages pass content, physical margin, logo, notes and font checks;
all four color pages and the dense grayscale page were visually inspected.
Current evidence: output/pdf/continuous-proof. The previous full-name report
below is historical: its column composition was rejected by the user.

## Full-name capacity and verified PDF packet — 2026-09-14

- [x] Reproduce and close the 40-full-name + timed-flight case without changing
  the page, 36 pt margins, 72 pt logo, 90 pt notes or critical type floors.
- [x] Generate a Letter PDF packet from verified page markup; inspect page count,
  names, details, dimensions, text sizes, color and grayscale output.
- [x] Recheck light/main-only/15/40 and author highlights, update evidence and
  replace the archived comparison link with the current packet.

Scope remains the isolated banded prototype. Baseline: both existing contract
and 15 input tests pass. Full-name timed-flight overflow reproduces at 28.08 pt.
Export will use a local document-rendering job, with browser UI checks via CUA.

Completed: tight spacing plus removal of unused hanging indents from flowing
rosters closes the 28.08 pt overflow without lowering any font floor. The final
timed-flight full-name page uses 10.56 pt names and >=9 pt details. Twelve color
and twelve grayscale PDF pages pass field/name retention, Letter size, text
margins, notes-region and type checks. Rendered pages were visually inspected.
PDF inspection prompted 1 pt footer padding and .5 pt day-heading inset. Author
highlight switching preserves 699.797 px body height at .88 text scale; oversized
40-entry text stays intact and disables printing. Current artifacts and the
reader protocol are in output/pdf/banded-proof. Physical reader testing and
production integration remain separate follow-ups.

## Current paper prototype refinement

- [x] Review only the banded design and its rendering/print code; record
  remaining reading-order, type-size and physical-margin issues.
- [x] Add an explicit main-events-only sample, omit empty concurrent content,
  and verify both days plus flight details without changing crowded samples.
  Nine/five main records retain every field, no concurrent section or badges,
  fixed logo/notes and one-page preview fit. Shared/timed flight samples fit.
  Complete 40-person samples match their pre-change content and geometry.
  Review finding: the current 20 pt margins do not meet the earlier half-inch
  request. Margin correction, critical-type minimums and dense event ordering
  remain follow-ups; the present fit evidence uses the existing 20 pt margins.

- [x] Remove the conference-specific title preset and all prefilled header
  text. Page title and optional subtitle start blank and show author input.
  Browser verification: an old conference URL now opens blank; an entered
  title appears on both days; clearing it removes it and preserves page fit.

- [x] Add nine coordinated paper palettes with a visible swatch picker and
  reloadable selection; preserve the original Forest appearance.
- [x] Check theme switching, text contrast, anchors and full content/geometry
  on light and dense pages; keep production themes and the banked PDF intact.
  Nine light and nine two-day/40-person comparisons retain exact content and
  computed row dimensions. All pages fit at their prior text scales. The new
  palettes' checked text contrast is at least 5.1:1; a small Forest duration
  correction brings its checked minimum to 4.9:1. Reload and timed flights pass.

- [x] Add optional day-anchor controls for main bands; offer first/lunch/last
  selection and individual overrides using existing event emphasis.
- [x] Verify anchor styling, toggles, complete records and unchanged Letter
  geometry on light, normal and forty-person days; document the design choice.
  Browser checks cover both full days at 15/40 names, the light day, and timed
  flights with 40 names. All records stay complete and fit remains unchanged.
  Individual choices, clearing, the shortcut and URL reload are verified.

- [x] Compare a single chronological concurrent list against the current
  two-column light day; retain complete entries and deliberate highlighting.
- [x] Demonstrate a conference title in the existing header, check light/dense
  behavior, and record the remaining design recommendations separately.
  Live-browser checks preserve all three light-day records across both flows;
  15/40-name and three-event/40-name cases keep columns. Both light days fit,
  including a longer wrapping title. Crowded timed-flight labels can reach
  about 7.4 pt: readability and dense reading order remain design follow-ups.

- [x] Nest flight assignments below the Training content so flight names no
  longer occupy the main time column. Keep the shared time beside the entire
  block; check shared/timed activities and complete 15/40-person days.
  Both flight patterns fit at both roster sizes with full fields and fixed
  logo/notes regions. Eight non-flight sample metrics remain identical.

- [x] Prototype permissive attendee text with explicit split modes, live entry
  review and whole-page preview; preserve raw text and every complete entry.
- [x] Adapt custom roster columns to measured entry widths/count, retain manual
  highlighting and check ambiguous names, long lists, POCs and page limits.
  Prototype-only: 15 parser cases and 19 browser cases pass; the ten banked
  samples keep identical print-media metrics. Forty full names use two columns;
  forty surnames use three. Oversized input stays intact and stops schedule
  printing. New screenshots inspected; the saved comparison PDF is unchanged.

- [x] Make surnames the primary cue within concurrent entries by reducing
  competing title/time emphasis and keeping each person visually grouped.
- [x] Check all ten printed specimens for full names, hierarchy and Letter fit;
  inspect the dense Sunday example and update the live prototype.
  Added surname-only input samples while preserving all POC fields and the
  longer-name comparison; checked wider-column fallback for long surnames.

- [x] Replace compressed reference ranges with identical circled badges at both
  ends, label affected main rows, and preserve true gap start times.
- [x] Verify direct links, complete content and unchanged text sizes across all
  eight Letter specimens; inspect the final PDF and live prototype.

- [x] Simplify organization/date header; separate activity, location/POC and
  instructions within main bands while preserving every supplied field.
- [x] Consolidate start-reference ranges and move gap starts into one compact
  reference line, without implying an overlap with the preceding main event.
- [x] Prototype shared-window and independently timed flight training inside
  the main track; use synthetic flight assignments and validate both patterns.
- [x] Recheck complete light/15/40 examples and flight examples on Letter;
  render and visually inspect the updated comparison PDF and browser.

- [x] Strengthen the main schedule's visual hierarchy without making names less
  legible; preserve selected event highlighting within the concurrent section.
- [x] Let available space expand main rows on lighter days, and add a clearly
  identified three-event synthetic sample alongside the complete 15/40 cases.
- [x] Verify all sample fields, names, start references and one Letter side/day;
  export and visually inspect the six-page comparison.

- [x] Reduce the logo to 72 pt square on the left; add an editable organization
  or event title above the day/date without truncation.
- [x] Make event highlighting an explicit choice for any event, independent of
  the space allocated for long attendee lists; keep CTF selected initially.
- [x] Verify alternate highlights, title wrapping, full content and Letter fit;
  regenerate and visually inspect the 15/40-person comparison PDF.

- [x] Update only `output/prototypes/day-first-adaptive`: 108 pt square logo,
  remove header attendance instructions, and label Concurrent events.
- [x] Add small numbered start-time references, including explicit gap starts;
  preserve one full record per event and unchanged synthetic fixture data.
- [x] Measure 15/40-person Letter pages, audit full content and references, render
  the updated comparison PDF, and inspect all pages. Keep the 90 pt notes area.

Risks: the larger logo consumes vertical space; disclose any text-size change.
Start-time markers must use start-inclusive/end-exclusive intervals and must not
attach gap starts to the preceding main event. No production renderer changes.

User approved implementation of the September 2026 review and continued bug/UI review.
Baseline: commit 32c7831; both distribution builds pass; 111 unit, 48 integration,
and 66 UI tests pass in each of Chromium, Firefox, and WebKit. Isolated browser
profiles are required. Keep the application offline and saved formats compatible.

- [x] F01–F08: complete workbook recovery, committed revisions, safe asynchronous
  saves/navigation, handoff review, Undo/Redo, complete versions, legacy write safety.
  Files: persistence.js, storage.js, library.js, versions.js, init.js and integration tests.
- [x] Workbook management: recoverable schedule removal, duplicate onto new dates,
  version rename/delete/size/status. Files: workbook-ui.js, persistence/storage/version UI.
- [x] F09–F12: print media isolation, all-field fidelity, effective main track,
  temporal phase grouping. Files: print.js, render.js, skin files, data-helpers.js, CSS.
- [x] Output features: print review/presets, selected days/audiences, readable
  multipage output, advisory schedule checks. Add print/render regression coverage.
- [x] F13–F19: preserve exact times, select new days, normalize unique IDs/dates,
  usable start screen, accessible modals/controls, readable palette contrast.
  Files: inspector.js, schema.js, ui-core.js, events.js, themes.js, utils.js, index.html, CSS.
- [x] Additional UI polish: custom palette controls, Escape cancels current cell,
  correct live badges, meaningful labels and touch targets; inspect adjacent defects.
- [x] F20–F25: legacy context dispatch; isolate embedded document and remount,
  correct deployment guidance, fail-closed data guard, license/hash/build flags.
  Files: library.js, tools/, README.md, support/CLAUDE.md, support/docs/STATUS.md.
- [x] Add targeted regressions, run syntax/build/all browser suites, inspect real
  application flows and emitted PDFs, review combined diff and fix new findings.
- [x] Rebuild both release artifacts and document verified results and remaining
  environment-specific checks. Do not publish or merge as part of local implementation.

Risks: recovery migration and destructive actions must preserve the latest full
workbook; delayed operations must be tied to document identity; print pagination
must preserve fields and audience obligations; embedded file permissions depend
on the host/browser and require accurate limits. Avoid broad reformatting or dependencies.

## Completed verification

- 126 unit + 68 integration + 91 UI tests pass in each of Chromium 147.0.7727.15, Firefox 148.0.2, and WebKit 26.4 (285 per engine; 855 executions).
- Real application flows pass in all three engines: mobile layout, keyboard dialogs, exact times, download/reopen, duplication, archive/restore, version lifecycle, custom colors, and print review.
- Nine Python build regressions and all three engines’ iframe/file-startup regressions pass.
- All 16 Letter/A4, layout, and print-mode PDF cases preserve 48 complete description markers. Dense Readable outputs span 4/2/4/3 pages for Grid/Cards/Bands/Phases.
- 40 JavaScript and three Python files parse; whitespace checks pass. Targeted independent reviews completed, including delayed-write/reopen, cross-tab recovery, and failed legacy checkpoint regressions.
- Both distributions rebuilt: 2026-09-09+7fd7f2e9a0fc. Final report: support/docs/RELIABILITY-RELEASE.md.
- Native file dialogs/permissions, close warnings outside automation, physical printers, actual Safari/Edge releases, and a live SharePoint/sync deployment remain environment checks. No publish or merge performed.

Suggested commit message: `fix: harden workbook recovery, editing, printing and embedding`

## Dense Bands print reliability

User authorized a polished, complete implementation preserving the Main Track /
concurrent-event relationship and every existing feature. Keep the editor, four
skins, full/overview fields, audience filtering, logo/theme, saving and explicit
Fit option intact. Improve the default readable Bands print output and native
print lifecycle; no runtime dependencies or saved-format changes.

Baseline: 5fc7765; both builds, nine build regressions, 126 unit + 68 integration
+ 91 UI tests and real application flows pass in Chromium, Firefox and WebKit.

- [x] Add a pure interval-aware Bands print section model with regression tests.
  Files: data-helpers.js, test-data-helpers.js. Preserve existing classification.
- [x] Render complete connected main/concurrent lanes for readable printing;
  paginate at readable size with repeated main context and honest overlap labels.
  Files: skin-band.js, render.js, style.css. Preserve editor and Fit behavior.
- [x] Unify native/application print preparation, current-state freshness,
  review measurements and cleanup. Files: print.js, test-print.js.
- [x] Exercise actual PDFs for aligned/staggered 19-event days, crowded days,
  all/selected audiences, full/overview, Letter/A4, native printing and Fit.
  Add targeted render/interaction regressions without removing legacy features.
- [x] Run full browser, build, embed and PDF regressions; visually inspect actual
  output; independent review; update documentation; rebuild both distributions.

Risks: partial overlaps must not imply containment; main overrides must not
change audience obligations; one long event must remain printable; page geometry
must agree in staging and print media; native beforeprint is synchronous; fonts,
logos and browser paper settings must not silently shrink or lose content.

Completed: 134 unit + 68 integration + 105 UI tests and real application flows
pass in each of Chromium 147.0.7727.15, Firefox 148.0.2 and WebKit 26.4 (921
harness executions). All 32 new Bands and 16 existing all-layout PDF cases pass;
nine build regressions and the three-engine embed/file-boot suite pass. Final
syntax/whitespace checks pass. Independent reviews resolved pagination progress,
Unicode, footer reservation, native printing and a test-only Firefox focus race.
The human-readable 19-event example prints in two pages; longer stress fixtures
need more pages. Both distributions rebuilt as 2026-09-10+6ecf9c0c5334. Details:
support/docs/BANDS-PRINT-RELEASE.md. No commit, push, merge or deployment performed.

## Connect the visible Bands preview

User correction: the screen still showed the old layout. The readable renderer
was only used by printing. Use the same connected main/concurrent structure in
the editor, with continuous scrolling and complete details. Keep physical page
breaks print-only and the explicit Fit presentation intact.

Baseline: 134 unit + 68 integration + 105 UI tests and real workflows pass in
Chromium, Firefox and WebKit before this correction.

- [x] Add a failing screen regression for attached complete events, editing,
  continuation selection, keyboard activation, blank notes and layout switching.
- [x] Connect screen rendering, selection and keyboard behavior; retain all
  existing editing controls, notes, themes and print options.
- [x] Verify the visible dense preview and all browsers, rebuild both files,
  check print/build/embed regressions and update release documentation.

Completed: the old screen layout was reproduced before correction. Both screen
and readable print now share complete attached entries; explicit Fit retains
the compact presentation. Independent review also reproduced a flex sizing bug
where dense content exceeded the page background; natural page sizing and an
actual-app geometry regression now cover desktop and narrow screens.

Final verification: 134 unit + 68 integration + 109 UI tests pass in Chromium,
Firefox and WebKit (933 harness executions), along with real application flows
and dense 19-event page bounds, text size, keyboard and editing checks. The
rebuilt local HTML passes separate screen, selection, blank-note and scroll-to-
footer checks. All 48 PDF cases, nine build checks and three-engine embed/file
startup checks pass. 42 JavaScript and three Python files parse; whitespace
checks pass. Both distributions: 2026-09-10+b7ba17fb1ba1. Screen evidence:
output/playwright/bands-screen/preview.png and preview-bottom.png.

The current user tab was not reloaded: browser control rejects local-file URLs.
The rebuilt file is verified in an isolated browser; the user must save and
reload their existing tab. No commit, push, merge or deployment performed.

## Restore the original Bands design; fix concurrency only

User rejected the redesign: restore the original appearance and eliminate
screen/Fit/readable renderer differences. Baseline: both builds and 134 unit +
68 integration + 109 UI tests plus real workflows pass in all three engines.
The mismatch reproduces on source, built HTTP and built file output: Fit uses
the original renderer; screen/readable use a different design.

- [x] Reuse original Bands rows, time gutter, typography, audience badges,
  header/logo, notes and footer. Change only concurrent placement: familiar
  right-side entries for small groups, attached wrapping rows for crowded groups.
- [x] Use one renderer for all modes; retain explicit Fit scaling, readable
  pagination, full event details and original Main Track relationships.
- [x] Add original-appearance and mode-parity regressions, inspect screen and
  actual PDFs side by side, run browser/build/embed/PDF checks, rebuild and document.

Risks: preserving the style requires checking geometry and type hierarchy, not
merely event counts. Pagination must split crowded groups with main context,
preserve every field, and keep classic gutters/badges on continuation sheets.

Completed: original renderBand rows and screen type/header/logo/notes restored;
only concurrent placement adapts. Screen, readable and Fit share the same
renderer. Native/app print cleanup and all existing editing controls remain.
Oversized nested rows split their fields without flattening the original design;
their first fragment keeps its audience badge with the heading.

Final build: 2026-09-10+19c165fed9a2. All 134 unit + 68 integration + 111 UI tests
pass in Chromium, Firefox and WebKit (939 harness executions), plus real app and
dense screen workflows. All 32 Bands and 16 all-layout PDF cases pass, including
appearance parity, complete canonical entries, readable 9 pt minimum and physical
no-shrink checks. Nine build checks, three-engine embed/file startup, 42 JavaScript
and three Python syntax checks, and whitespace checks pass. The human 19-event
example prints in three readable pages; Fit remains one page with small text.
Screens and actual PDFs are in output/playwright/bands-classic/. All 20 dense
Letter PDF pages were visually reviewed. No commit, push, merge or deployment.
# Banded prototype print hardening — 2026-09-14

Scope: the accepted `output/prototypes/day-first-adaptive` prototype only.
Preserve all existing production working-tree changes.

- [x] Correct physical padding to 36 pt; enforce explicit critical-text floors
  while preserving the 72 pt logo and 90 pt reminder panel.
- [x] Share chronological ordering between rendering and numbered references;
  consolidate fit policy and remove superseded style declarations.
- [x] Verify main-only, light, 15/40 attendees, both flight patterns, long inputs,
  failure behavior and complete records. Fourteen browser specimens pass.
- [ ] Refresh actual PDF/printer evidence: in-app export is unsupported and its
  print action exposes no save-to-PDF path. Older PDF clearly labeled archived.

Baseline: prototype JavaScript parses; 15 personnel parser cases pass. In the
live browser, main-only/40-person samples fit, but padding is 20 pt, Sunday's
roster moves from reference 7 to the end, and timed-flight text falls to 7.395 pt.
Risks: corrected margins reduce available space; enforce truthful capacity
reporting instead of hiding fields or scaling the whole page.
