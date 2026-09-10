# DaySchedule status

**Last updated:** 2026-09-09

This describes the current source. The April design notes under `superpowers/` and the older code review are historical; they do not describe the current workbook workflow.

## Product

DaySchedule builds and prints day schedules without an account or application server. Its primary file is a `.schedule` workbook containing multiple schedules. All four layouts—Bands, Grid, Cards, and Phases—use that data. The app makes no application network requests after its static files load. A user's synced or shared folder can still copy saved files through its own service.

## Current behavior

- **Workbooks:** create, open, search, switch, duplicate, archive, and restore schedules. At least one schedule stays active. Optional duplicate settings shift every day by a date offset and clear contacts/POCs, notes, or specific people after a preview.
- **Saving and recovery:** supported standalone Chromium browsers autosave to an attached file; fallback saving downloads a separate copy with a distinct status. Recovery includes the complete workbook, archived schedules, versions, active identity, and revision state. File-change review offers Cancel or Keep Both; background saves pause for review rather than overwrite a detected change.
- **Versions:** save, restore with a current-state backup, rename, and delete snapshots. Appearance and active-day state travel with versions. The panel shows workbook size and save status.
- **Editing:** exact-minute time entry, a selected-row Quick Edit panel, audience and main-track controls, notes, logos, custom palettes, and separate editor light/dark mode. Dialogs, settings tabs, day accordions, focus states, and touch targets support keyboard and narrow-screen use.
- **Rendering:** long unbroken text wraps; schedule headers and shared details resize with content; Phases assigns tasks by time overlap; renderers preserve the input event arrays.
- **Printing:** review selected days, audience, full details or overview, and readable pages or one-page fitting. Readable mode allows continuation pages; fit mode warns about small text. Advisory checks flag dates, ranges, and overlaps involving a shared audience, location, or named people.
- **Distribution:** standalone HTML includes the MIT notice and a date/content-hash build stamp. The builder refuses operational legacy data. Embedding uses an iframe document with its own app CSP and lifecycle. The default `srcdoc` artifact is for an approved custom HTML host; `--app-url` creates an HTTPS iframe for the modern SharePoint Embed route.

## Verification

The repository provides three browser harnesses: synchronous unit tests, asynchronous storage integration tests, and real app-shell/render/print tests. `tools/test-builds.py` verifies packaging guards and output identity in temporary copies. `tools/test-embed.cjs` checks Chromium, Firefox, and WebKit host isolation, dark mode, remounting, CSP, fallback downloads, actual Chromium cross-origin picker denial, and `file://` startup, also in temporary copies. `support/tests/test-browser.cjs` runs the harnesses and release user flows through its own local server and isolated browser contexts; evidence goes to the ignored `output/playwright/release/` directory. See [README](../../README.md) for commands, the [reliability release notes](RELIABILITY-RELEASE.md) for final counts, and [tasks/todo.md](../../tasks/todo.md) for the current verification record.

Native OS file-picker and print dialogs, actual Safari and Edge releases, tenant CSP/authentication rules, and a live SharePoint rollout require deployment checks. Browser-engine automation and file-handle mocks do not establish those results.

## Operating limits

Use one editor at a time. A file fingerprint check is not an atomic write lock across sync services, and legacy directory locks remain advisory. The recovery store keeps the latest local workbook snapshot and can be cleared, blocked, or full; save important work to a file.

Archiving retains the schedule in the workbook. Versions and archived schedules remain readable by anyone with the file. Audience and overview print options filter presentation; they do not guarantee that notes or named exceptions are safe to disclose. Review a handout before sharing.

An iframe separates app UI from host UI. A same-origin host can still read or modify the app, and a stricter host policy can block it. Cross-origin file pickers can be restricted; open the standalone app in its own tab for native autosave and printing.

There are no accounts, real-time collaboration, recurring events, time zones, reminders, or events spanning midnight. Existing directory-mode profiles remain supported; new setups use workbooks. Recovered legacy drafts open as separate workbooks to protect the shared originals.
