# Project guidance

## Architecture and supported environments

DaySchedule uses HTML, CSS, and vanilla JavaScript, with no runtime framework or package dependency. Develop against `app/index.html`; Python 3.10+ packaging tools create the distributable files in `dist/`. Generated files must be rebuilt from source, never patched by hand.

Target current Chrome, Edge, Firefox, and Safari. Verify HTTP and `file://` startup independently. Native file access requires browser support and permission; embedded contexts can impose additional restrictions. Safari and Firefox use download-based workbook saving. The iframe build does not depend on CSS `@scope`.

The primary product is a local `.schedule` workbook containing multiple schedules. A browser with an old directory handle can still use legacy per-schedule JSON storage. The workbook is not an online collaboration service, and neither mode provides atomic coordination through a sync provider.

## Working rules

- Establish a passing baseline before edits. Use the relevant browser harnesses and build regressions, then verify the affected user flow.
- Make the smallest change that fixes the underlying cause. Keep formatting and unrelated refactors out of the patch.
- Use `const` by default and `let` for reassignment. Prefer clear functions and explicit data boundaries to additional global state.
- Handle failed promises and storage errors. Explain failures in the UI when the user's work or next action is affected.
- Use semantic elements, associated labels, and visible focus states. Dialogs must manage focus and return it to the control that opened them.
- Aim for 44 CSS pixel touch targets. Keep dense tables usable without removing labels or keyboard operation. Meet WCAG AA text contrast and honor reduced motion.
- Prefer CSS variables and existing classes. Keep layout-dependent inline styles and print overrides purposeful; do not mass-convert existing styling as part of a bug fix.
- Do not use timers as a speculative fix. Document a browser timing dependency when one is required.
- Investigate browser-specific behavior in that browser. An HTTP pass does not establish that Safari plus `file://` works.
- Hard-reload after editing or use a fresh server port. A cached script can make a correct fix appear broken.
- Test doubles for native dialogs do not verify the operating system's file picker, permissions, or print dialog. Report that boundary explicitly.

## Source map

| Path | Responsibility |
| --- | --- |
| `app/index.html` | App shell, source CSP, ordered script tags |
| `app/css/style.css` | Editor, legacy layouts, responsive and print styles |
| `app/css/bands.css` | Scoped approved Bands paper layout and print constraints |
| `app/js/constants.js` | Defaults and the source `APP_VERSION = 'dev'` marker |
| `app/js/app-state.js` | Store and compatibility aliases for state |
| `app/js/utils.js` | Time, escaping, IDs, and local error logging |
| `app/js/ui-core.js` | Dialog, toast, dropdown, and focus behavior |
| `app/js/schema.js` | Validation and normalization of persisted data |
| `app/js/data-helpers.js` | Time overlap, audience classification, layout data |
| `app/js/persistence.js` | Workbook envelopes, recovery, undo, save orchestration |
| `app/js/storage.js` | Legacy directory access, file operations, handle storage |
| `app/js/themes.js` | Schedule palettes and editor chrome theme |
| `app/js/skin-*.js` | Layout adapters/renderers |
| `app/js/band-layout.js` | Shared Bands model, renderer and physical fitter |
| `app/js/alternate-views.js`, `app/css/alternate-views.css` | Shared alternate record semantics, paper furniture and bounded fitting; each skin owns its arrangement, independently of Bands |
| `app/js/band-editor.js`, `personnel-input.js` | Additive event controls and explicit attendee parsing |
| `app/js/band-palettes.js` | Approved paper palette roles |
| `app/js/library.js` | Start screen, create/open, legacy library, Help |
| `app/js/versions.js` | Version management UI |
| `app/js/render.js` | Shared rendering and layout dispatch |
| `app/js/workbook-ui.js` | Workbook schedule management UI |
| `app/js/print.js` | Print preparation, measurement, and output options |
| `app/js/events.js`, `app/js/inspector.js` | Interaction, shortcuts, editing, settings |
| `app/js/init.js` | Boot recovery and legacy migration; loads last |
| `app/data/scheduledata.js` | Inert placeholder in distributed builds |
| `tools/` | Standalone/iframe builders and build/host regression checks |
| `support/tests/` | Unit, asynchronous integration, and UI browser harnesses |
| `support/docs/superpowers/` | Historical design and implementation documents |

Scripts are classic scripts with shared runtime bindings. Their order is part of the contract:

1. `constants` → `app-state` → `utils` → `ui-core`.
2. `schema` → `personnel-input` → `data-helpers` → `persistence` → `storage` → `band-palettes` → `themes`.
3. `band-layout` → `alternate-views` → the four `skin-*` files → `library` → `versions`.
4. `render` → `workbook-ui` → `print` → `events` → `inspector` → `band-editor`.
5. `data/scheduledata.js` → `init.js`.

Skin functions can call shared render functions because all scripts load before rendering starts. Preserve that ordering and use the module contract comments when changing a cross-file API.

## Data and save boundaries

All schedule changes flow through Store. Persisted input must pass through schema normalization before it reaches the DOM. Keep ID, date, time, color, logo, and theme validation in place; rendering must escape user text. A workbook may legitimately contain a schedule with no days. Invalid imported records need a visible explanation rather than silent corruption.

The active schedule is one envelope in a workbook. Recovery, schedule switching, named versions, and saves must preserve sibling schedules and the active envelope's identity. Do not serialize just the active Store as a replacement for the complete workbook. A new draft must detach the previous file target before it becomes editable.

Save operations must retain revision and workbook identity across asynchronous permission requests and writes. A completed write acknowledges the snapshot it wrote, not edits made while it was pending. Failed writes must not turn into a success indicator. A fallback download must say **Downloaded**, because it does not replace the source file.

File permissions are re-requested only through an explicit user action. Background autosave must not prompt. IndexedDB remembers handles when allowed; recovery storage and handle storage can each be unavailable. Keep editor startup functional in those cases and surface failures that affect recovery.

File-change checks reduce accidental overwrites but cannot make read-check-write atomic through a network drive or sync client. Keep one editor at a time as the documented workflow. Legacy directory locks remain advisory; do not casually resurrect the removed new-profile directory setup UI.

Required text fields can be temporarily blank while typing. Reverting or normalizing that state must not delete the edited event. Events cannot cross midnight. Preserve valid minute precision rather than silently snapping it to quarter hours.

## Data locality

The app must not send schedule data to a service. It can load its static assets from a host, but makes no application network requests after loading. Files chosen in a synced or shared folder are copied by that service according to the user's configuration; that is outside the app's local browser boundary.

Keep these controls intact:

1. The source CSP blocks connections with `connect-src 'none'`, forms with `form-action 'none'`, and external resource types through explicit source restrictions. The standalone builder retains those restrictions while allowing its inline scripts and styles. CSP is not a general promise that every possible browser navigation or hostile same-origin host is blocked.
2. No analytics, external fonts, CDNs, remote API calls, or fetched media in app features. Source assets are relative files; the standalone app includes them.
3. Operational `.schedule` and `app/data/*.json` files are gitignored. The builder accepts only an inert legacy data placeholder and replaces its contents with a fixed comment, so even placeholder comments cannot distribute private data.

The default embed contains the complete standalone document in iframe `srcdoc`. It retains the app's CSP and license, and gives the app its own DOM, CSS, event listeners, and lifecycle. It does not protect the app from same-origin host scripts. A cross-origin HTTPS iframe provides an origin boundary, but hosting CSP, authentication, storage policy, and native-picker restrictions still apply. Never claim a synthetic-host test certifies a SharePoint tenant.

Any feature needing application network access requires an explicit product decision and a revision to this policy.

## Build and verification

```bash
python3 tools/build-single-html.py
python3 tools/build-sharepoint-embed.py
python3 tools/test-builds.py
node tools/test-embed.cjs
node support/tests/test-browser.cjs
```

`build-sharepoint-embed.py --build-dist` first rebuilds the standalone app. Its default output is a self-contained iframe for an approved custom HTML host; `--app-url https://…` generates a URL iframe for a modern SharePoint Embed web part. Both write `dist/DaySchedule.sharepoint.html`. `--height` controls frame height.

Build stamps use the date plus a hash of the unstamped complete app, including its license and assets. Keep exactly one source `APP_VERSION = 'dev'` marker. Both distributed forms include the MIT notice. Build failures must occur before replacing the output when CSP, input data, license, or required source files are invalid.

`test-builds.py` uses temporary copies. `test-embed.cjs` does the same and requires Playwright plus Chromium, Firefox, and WebKit; set `DAYSCHEDULE_PLAYWRIGHT_MODULE` if its package is outside Node's normal search path. It checks host DOM/style isolation, theme propagation, frame lifecycle, frame CSP, fallback downloads, and file boot. A second loopback origin verifies Chromium's actual cross-origin picker denial and the resulting download without opening an OS dialog. The manual host is `tools/sharepoint-host-check.html`.

Open the following over HTTP in each target browser:

- `support/tests/runner.html` for synchronous unit tests.
- `support/tests/runner-integration.html` for asynchronous persistence tests with in-memory file handles.
- `support/tests/runner-ui.html` for the real app shell, renderers, and print preparation.

Keep asynchronous tests out of the synchronous runner. Use separate contexts or cleanup to prevent browser storage leaking between cases. After source changes, rebuild both tracked distributables once the combined checks pass. Also verify local-file startup and a representative dense print layout. Printing inside an iframe needs deployment-specific review; the documented user route is to open the app in its own tab.

`support/tests/test-browser.cjs` runs all three harnesses and the release user flows in Chromium, Firefox, and WebKit. It starts a local server, uses isolated browser contexts, and writes evidence to the ignored `output/playwright/release/` directory. It uses the same `DAYSCHEDULE_PLAYWRIGHT_MODULE` override as the iframe suite. It does not access the user's browser profile.

For bugs, collect the build stamp, reproduction steps, and relevant local error-log entries. Review potentially sensitive details before sharing them. Historical specs and old review notes describe earlier states; current source, these instructions, README, and current status take precedence.
