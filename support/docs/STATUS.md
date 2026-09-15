# DaySchedule status

**Last updated:** 2026-09-14

This describes the current source. The April design notes under `superpowers/` and the older code review are historical; they do not describe the current workbook workflow.

## Product

DaySchedule builds and prints day schedules without an account or application server. Its primary file is a `.schedule` workbook containing multiple schedules. All four layouts—Bands, Grid, Cards, and Phases—use that data. The app makes no application network requests after its static files load. A user's synced or shared folder can still copy saved files through its own service.

## Current behavior

- **Workbooks:** create, open, search, switch, duplicate, archive, and restore schedules. At least one schedule stays active. Optional duplicate settings shift every day by a date offset and clear contacts/POCs, notes, or specific people after a preview.
- **Saving and recovery:** supported standalone Chromium browsers autosave to an attached file; fallback saving downloads a separate copy with a distinct status. Recovery includes the complete workbook, archived schedules, versions, active identity, and revision state. File-change review offers Cancel or Keep Both; background saves pause for review rather than overwrite a detected change.
- **Versions:** save, restore with a current-state backup, rename, and delete snapshots. Appearance and active-day state travel with versions. The panel shows workbook size and save status.
- **Editing:** exact-minute time entry, a selected-row Quick Edit panel, explicit main/concurrent placement, independent attendance and emphasis, multiline roster previews, expandable flight activities, reminders, logos, custom palettes, and separate editor light/dark mode. Dialogs, settings tabs, day accordions, focus states, and touch targets support keyboard and narrow-screen use.
- **Rendering:** the approved Bands prototype is integrated into the existing editor shell. Main bands stay prominent; full concurrent entries appear once in chronological columns. Circled references use full interval overlap. Notes, event selection, keyboard access and empty-note editing remain available. Optional logo, title/subtitle, manual emphasis, free-text attendee formatting and nested flight activities use existing Customize/inspector surfaces.
- **Printing:** Bands shares one renderer/fitter between screen and print, using fixed Letter portrait pages, half-inch margins, a 72 pt optional logo and at least 90 pt for Notes & Reminders. Bounded typography replaces whole-page shrinking. Overflow remains visible for editing and blocks incomplete app printing. Grid/Cards/Phases retain their previous print policies. Assignment text matches are advisory and separate from intentional main-schedule exceptions.
- **Distribution:** standalone HTML includes the MIT notice and a date/content-hash build stamp. The builder refuses operational legacy data. Embedding uses an iframe document with its own app CSP and lifecycle. The default `srcdoc` artifact is for an approved custom HTML host; `--app-url` creates an HTTPS iframe for the modern SharePoint Embed route.

## Verification

The authoring pass adds direct section choices and clearer input controls while preserving the approved Bands paper layout. Chromium/WebKit passed 666 harness checks, the complete new-author journey, 96 mixed legacy/explicit day renders and 192 randomized UI sequences. Twelve Letter PDF pages and nine packaging checks passed. Saved workbooks now use format 3 to protect explicit placement. See the [Bands authoring guide](BANDS-AUTHORING.md) for controls, compatibility and evidence.

The preceding Bands stress pass used build `2026-09-14+fcf78defd098`: 400 random day renders, 192 real-control UI sequences, 644 harness checks across Chromium/WebKit, twelve PDF pages and nine packaging checks passed. It corrected a premature third column and a blank first print page. Firefox automation could not start. See [Bands and editor stress test](BANDS-STRESS-TEST.md) for reproducible seeds, evidence and limits.

The repository provides three browser harnesses: synchronous unit tests, asynchronous storage integration tests, and real app-shell/render/print tests. `tools/test-builds.py` verifies packaging guards and output identity in temporary copies. `tools/test-embed.cjs` checks Chromium, Firefox, and WebKit host isolation, dark mode, remounting, CSP, fallback downloads, actual Chromium cross-origin picker denial, and `file://` startup, also in temporary copies. `support/tests/test-browser.cjs` runs the harnesses and release user flows through its own local server and isolated browser contexts; evidence goes to the ignored `output/playwright/release/` directory. See [README](../../README.md) for commands, the [reliability release notes](RELIABILITY-RELEASE.md) for final counts, and [tasks/todo.md](../../tasks/todo.md) for the current verification record.

Native OS file-picker and print dialogs, actual Safari and Edge releases, tenant CSP/authentication rules, and a live SharePoint rollout require deployment checks. Browser-engine automation and file-handle mocks do not establish those results.

The latest Bands integration verification and limits are recorded in [Bands release notes](BANDS-PRINT-RELEASE.md). Earlier three-engine/48-PDF results refer to the superseded attached-event Bands layout and do not certify this integration. Current work adds optional event/theme fields with workbook format 2 and version-1 import support. No runtime dependencies or application network access were added.

Next design phase: review Grid, Cards and Phases against the same real scheduling cases after the integrated Bands experience is settled. Their layout redesign is not part of this change.

## Operating limits

Use one editor at a time. A file fingerprint check is not an atomic write lock across sync services, and legacy directory locks remain advisory. The recovery store keeps the latest local workbook snapshot and can be cleared, blocked, or full; save important work to a file.

Archiving retains the schedule in the workbook. Versions and archived schedules remain readable by anyone with the file. Audience and overview print options filter presentation; they do not guarantee that notes or named exceptions are safe to disclose. Review a handout before sharing.

An iframe separates app UI from host UI. A same-origin host can still read or modify the app, and a stricter host policy can block it. Cross-origin file pickers can be restricted; open the standalone app in its own tab for native autosave and printing.

There are no accounts, real-time collaboration, recurring events, time zones, reminders, or events spanning midnight. Existing directory-mode profiles remain supported; new setups use workbooks. Recovered legacy drafts open as separate workbooks to protect the shared originals.
