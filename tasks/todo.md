# Reliability release

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
