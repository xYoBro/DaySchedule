# September 2026 reliability release

The 25 findings from the full repository review are addressed, along with the six focused workflow additions. The implementation is complete and the automated release checks pass. The rebuilt local distributions are ready for validation in the intended deployment environment; native file dialogs, physical printing, and a live SharePoint tenant still require that environment.

Build: `2026-09-09+7fd7f2e9a0fc`. Branch: `codex/reliability-release`. Baseline: `32c7831c58910dcf98ea9856a8367dffb2c8bd25`.

The application remains an offline, dependency-free HTML/CSS/JavaScript app. No accounts, backend, application network requests, or hosted collaboration service were added. Playwright and Poppler are optional development tools used by the new verification scripts.

## Review findings and resulting behavior

| Finding | Change and reason |
|---|---|
| F01 — recovered drafts looked saved | Recovery restores the live and committed revision state. Unsaved work stays dirty and recoverable until its revision is saved. |
| F02 — incomplete recovery | Recovery now contains the complete workbook: active and sibling schedules, archived schedules, versions, appearance, active identity, and revision/baseline information. |
| F03 — old save replaced newer memory | A save acknowledges the snapshot and document identity it actually wrote. Later edits and sibling schedules survive its completion. |
| F04 — Back discarded edits during saving | Leaving waits for pending checkpoints and saves, then rechecks current work. A failed save retains recovery and does not silently leave. |
| F05 — stale continuation overwrote a handoff | Reopening and saving compare against the observed file baseline. A detected external change pauses writing for Cancel or Keep Both; Keep Both retains the disk workbook and local schedules. |
| F06 — obsolete Redo survived a new edit | New mutations invalidate the Redo branch even inside the typing debounce window. |
| F07 — versions omitted appearance | Named snapshots include layout, palette/custom colors, and active-day state. Restoring first retains a deliberate current-state backup. |
| F08 — legacy save missed an edit | Legacy writes also track the revision they wrote and retain later edits as dirty. Failed checkpoints survive later version operations and saves. |
| F09 — screen breakpoints changed print layout | Responsive layout rules are limited to screen media. Print staging and emitted pages use consistent geometry. Dense final PDFs are now tested. |
| F10 — layouts dropped authored fields | All four layouts retain event descriptions and break metadata. Full print output preserves those fields; Overview explicitly omits event notes. |
| F11 — unassigned Main Track was ignored | One effective-track classifier honors an explicit main-track override even without an audience. Removing an audience no longer silently clears that choice. |
| F12 — Phases attached unrelated tasks | Tasks nest only when fully contained in exactly one applicable phase. Other tasks appear independently by time, avoiding false phase assignments. |
| F13 — focus/blur changed exact times | Editors normalize formatting while preserving exact minutes. Merely visiting `1405` or `1437` does not round it. Blank or invalid times are rejected. |
| F14 — adding a day left the old day selected | The new day becomes active immediately, so the next event is added there. |
| F15 — sanitized IDs collided | Import allocates unique entity IDs and maps original references before sanitization. It also handles reserved object keys and validates dates/ranges. Ambiguous workbook schedule IDs are rejected before loading. |
| F16 — empty Continue did nothing | Continue is hidden without recoverable work and can restore an intentionally empty draft. |
| F17 — mobile start actions overlapped | Start cards stack within the viewport. Editor controls also wrap at phone/tablet widths, with a separate scrollable document preview. |
| F18 — keyboard and dialog gaps | Shared dialogs contain focus, restore the opener, isolate the background, and handle stacked Escape correctly. Headers, notes, day accordions, settings tabs, form labels, focus indicators, and touch targets were improved. |
| F19 — low text contrast | Preset secondary/muted text meets the tested 4.5:1 target on its paper/panel colors. Audience badges choose contrasting actual ink. Custom colors expose low-contrast and transparency guidance. |
| F20 — legacy context actions did not dispatch | Legacy Duplicate and Delete now route through the correct context actions. |
| F21 — embed affected its host | The embed contains a complete iframe document with its own styles, scripts, CSP, and lifecycle. Host selectors, DOM, and keyboard handlers remain separate. |
| F22 — remount left an inert widget | Reinserting the iframe starts a fresh app instance; there is no shared host-global boot guard. |
| F23 — misleading deployment guidance | README and support documentation distinguish modern SharePoint's approved HTTPS iframe route from a custom HTML host using `srcdoc`. Browser, storage, printing, sync-folder, and host-trust limits are explicit. |
| F24 — embed dark theme was incomplete | The iframe uses the same intact application document and theme selectors as standalone. |
| F25 — packaging accepted operational save data | The builder accepts only an exact inert placeholder grammar, including equivalent file-path forms. Nonempty/unrecognized executable data fails the build, and placeholder comments are omitted. |

The builders also retain the MIT notice, generate a date plus content hash, and implement the advertised `--build-dist` option. Current documentation replaces obsolete workflow guidance; historical design documents remain historical.

## Workflow additions

- **Archive and restore:** remove a schedule from the active workbook list without destroying it. At least one active schedule remains. Archived content is retained in the file.
- **Print review:** choose days, audience, Full details or Overview, and Readable pages or Fit each day. The review reports event counts, estimated pages, omitted notes, and small-text warnings.
- **Recovery and file-change review:** retain complete drafts, distinguish saved revisions from recovery, and preserve both local and changed-file content when needed.
- **Duplicate onto new dates:** preview an explicit date offset and optionally clear contacts/event POCs, notes, or specific people before creating the copy.
- **Version management:** rename/delete snapshots, restore with a backup, and inspect workbook size and save status.
- **Audience handouts and schedule checks:** include shared obligations and breaks, with advisory checks for duplicate dates, out-of-range events, missing audiences, and overlaps involving a shared audience, location, or named people. Review named exceptions and day notes before sharing.

Custom palette controls are now usable. Quick Edit can cancel a pending cell edit with Escape before closing; Break/Main badges refresh immediately. New events can end at `2400`. These changes complete existing controls rather than introducing another editing system.

## Additional bugs found during implementation

Independent review and delayed-operation regressions found more cases than the initial audit:

- A globally newer durable backup could replace a different tab's draft, including a divergent draft with the same workbook ID. Valid tab-local recovery now wins, and cleanup deletes only its exact durable backup.
- A delayed Reopen could replace newly created work. Open operations now verify their generation/document identity before applying results.
- A failed version save could lose its checkpoint on Back or on the next legacy version action. The checkpoint is protected in live state/recovery before awaiting a write, and later actions carry it forward after validating the disk baseline.
- Revoked permission on an attached file followed by a cross-origin picker denial could reuse the old handle. Download fallback now detaches the write attempt and reports Downloaded accurately.
- Unsupported schema versions, malformed inactive schedules/archives, ambiguous schedule IDs, and object-valued metadata could reach later UI failures. Import validates every envelope before changing the open workbook and safely normalizes supported scalar fields. Repair notices survive success messages.
- Controls left open when editability changed could still mutate data. Event-boundary guards now enforce the current state, and asynchronous logo loading checks the target schedule again.
- Stacked Versions/Help dialogs could close the wrong layer, while delayed panel rerenders could steal restored focus. They now share the modal lifecycle and check whether the panel remains open.
- Final PDF inspection found an orphaned Bands time-group heading. Readable output keeps that group together when it fits, and the PDF regression rejects a stranded heading. Empty logo placeholders are hidden on printed pages.

## Verification record

| Check | Result |
|---|---|
| Chromium 147.0.7727.15 | 126 unit + 68 integration + 91 UI tests passed. |
| Firefox 148.0.2 | The same 285 tests passed. |
| WebKit 26.4 | The same 285 tests passed. |
| Real application flows, all three engines | Mobile start/editor, keyboard dialogs, exact times, cell cancellation, new-day targeting, custom colors, print review, actual download/reopen, dated duplication, archive/restore, and version rename/delete passed without uncaught page errors. |
| Packaging | Nine Python regressions passed, including unsafe data rejection, path aliases, license/CSP, build identity, and embed options. |
| Generated app and host checks, all three engines | Host DOM/style/shortcut isolation, dark theme, blocked application connections, remount, fallback download, and standalone `file://` startup passed. Chromium's actual cross-origin picker denial was observed as `SecurityError`, followed by a valid download. |
| Emitted PDFs | All 16 combinations of four layouts, two modes, and Letter/A4 retained all 48 synthetic description-tail markers. Fit output used one page. Readable Grid/Cards/Bands/Phases used 4/2/4/3 pages, respectively, in this dense fixture. |
| Syntax and whitespace | 40 JavaScript and three Python files parsed; `git diff --check` passed. |

The suites grew from 225 to 285 tests per engine: 60 new regressions, executed across three engines for 855 passing test executions. Targeted failures were reproduced before their fixes, including the late legacy checkpoint case. Emitted pages and phone/dialog screenshots were also inspected visually.

Readable mode measured at least 9 pt in the app's Letter print geometry. A different paper size, browser scale, or printer setting can alter physical text size. Fit mode deliberately permits very small text for dense schedules and warns about it; use Readable pages or an audience handout for those cases.

Repeat the checks using the commands in [README](../../README.md). Browser screenshots, PDF output, and JSON results are local, ignored artifacts under `output/playwright/release/`. Tests use synthetic schedules and isolated browser contexts, not a user's browser profile or production file.

## Release boundaries

The standalone and iframe distributions were rebuilt from the final source. No deployment, remote push, or merge was performed.

Before rolling out to a specific environment, exercise its actual native open/save and permission dialogs, a save failure, print preview/printer, and any SharePoint/Teams/OneDrive workflow it will use. Automated browser engines and file-handle mocks do not establish those results. WebKit automation is not the Safari application, and the checks do not certify every device, zoom setting, or assistive technology. The close-warning path is bypassed under automation and still needs a manual check.

Use one editor at a time. A file-baseline check cannot make a read/compare/write operation atomic across sync services. Browser recovery retains the latest local backup and may be blocked, full, or cleared; it does not replace saving an important workbook to a file. Versions and archived schedules remain readable by anyone holding that file. Audience filtering is a presentation choice, not a confidentiality boundary.

Accounts, cloud sync, recurrence, reminders, calendar integration, unrestricted time shifting, and real-time collaboration remain outside this release. They were deferred in the review and are not needed to resolve its findings.
