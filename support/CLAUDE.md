# Project CLAUDE.md

## Tech Stack
- HTML5, CSS3, vanilla JavaScript (no frameworks)
- No build step — files served directly to the browser
- Target browsers: Safari, Chrome, Firefox (latest versions)
- Must work with file:// URLs as well as http://

## Code Standards

### HTML
- Semantic elements over divs (`<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`)
- All images require meaningful `alt` text
- Forms require associated `<label>` elements
- No inline styles — all styling in CSS files
- No inline event handlers — all JS in script files or modules

### CSS
- Use CSS custom properties (variables) for colors, spacing, typography
- Spacing system based on 8px increments: `--space-1: 8px`, `--space-2: 16px`, etc.
- Mobile-first responsive design — start with smallest screen, use `min-width` media queries
- No `!important` unless overriding third-party styles
- Prefer `rem` for font sizes, `px` for borders and shadows, `%` or `vw/vh` for layout
- Class naming: BEM-ish (`.block__element--modifier`) or simple descriptive classes — be consistent

### JavaScript
- No `var` — use `const` by default, `let` when reassignment is needed
- No `any` workarounds — this isn't TypeScript but write as if types matter
- All DOM queries cached in variables at the top of scope
- Event delegation over individual listeners when possible
- Always handle errors — no empty catches, no unhandled promise rejections
- No `setTimeout` or `requestAnimationFrame` as bug fixes unless the timing dependency is verified and documented

## Debugging Standards
- When fixing browser-specific bugs, verify the assumption in the actual browser before applying a fix
- If a fix involves Safari + file:// URLs, test both conditions independently
- Prefer simple direct solutions over clever abstractions
- A fix should make the code simpler. If it adds complexity, the problem is not yet understood
- After two failed fix attempts on the same bug, stop and use the cupertino agent to investigate
- `python3 -m http.server` sends no cache headers, so browsers heuristically cache app
  JS/CSS for a long time — after editing, hard-reload (Cmd+Shift+R) or serve on a fresh
  port, or you will debug stale code. (The single-file dist build sidesteps this.)
- Native dialogs (file pickers, print, beforeunload) freeze headless/automated browsers.
  runner-ui.html has a guard that no-ops them with a console warning; the app's
  beforeunload guard is skipped under `navigator.webdriver` for the same reason.

## UI/UX Standards
- Minimum touch target: 44x44px
- All interactive elements need visible focus states (keyboard accessibility)
- Color contrast: WCAG AA minimum (4.5:1 for body text, 3:1 for large text)
- Loading states for any async operation
- Error states must explain what happened AND what the user can do about it
- Animations under 300ms, ease-out for entrances, ease-in for exits
- No decorative animation — motion must communicate something

## Project Structure
```
/
├── app/                        ← the live application
│   ├── index.html              ← app shell
│   ├── css/
│   │   └── style.css           ← all styles (screen + print)
│   ├── js/
│   │   ├── constants.js        ← default groups, color palette, layout targets
│   │   ├── app-state.js        ← Store object + global state
│   │   ├── utils.js            ← generateId, esc, timeToMinutes, formatDuration
│   │   ├── ui-core.js          ← modal, toast, dropdown primitives
│   │   ├── schema.js           ← normalizeEvent, normalizeGroup, normalizeNote, normalizeDay
│   │   ├── data-helpers.js     ← eventsOverlap, classifyEvents, computeDuration
│   │   ├── persistence.js      ← session storage, undo/redo
│   │   ├── storage.js          ← FSAPI directory access, IndexedDB handles (dir + workbook file), auto-save, versions
│   │   ├── themes.js           ← palette definitions, CSS var application, editor chrome toggle
│   │   ├── skin-band.js        ← band skin: horizontal time bands + concurrent
│   │   ├── skin-grid.js        ← grid skin: time × groups matrix
│   │   ├── skin-cards.js       ← cards skin: group detail panels
│   │   ├── skin-phases.js      ← phases skin: phase-based field exercises
│   │   ├── library.js          ← start screen (Continue card, open/create), library CRUD, context menu, help modal
│   │   ├── versions.js         ← version panel UI
│   │   ├── render.js           ← renderDay() dispatcher, shared renderers, dagger footnote state
│   │   ├── workbook-ui.js      ← workbook switcher UI (multi-schedule navigation; persistence.js owns data)
│   │   ├── print.js            ← print layout engine, adaptive scaling
│   │   ├── events.js           ← click handlers, keyboard shortcuts
│   │   ├── inspector.js        ← inspector panel, settings modal, toolbar wiring
│   │   └── init.js             ← boot flow, migration, sample data (loads last)
│   └── data/
│       └── scheduledata.js     ← externalized state (SAVED_STATE)
└── support/                    ← docs and tests
    ├── CLAUDE.md
    ├── LICENSE
    ├── tests/
    │   ├── runner.html         ← open in browser to run all tests
    │   ├── test-runner.js      ← minimal assertion library
    │   ├── test-utils.js       ← utility function tests
    │   ├── test-schema.js      ← schema normalization tests
    │   ├── test-data-helpers.js ← overlap detection, classification tests
    │   ├── test-store.js       ← Store state management tests
    │   ├── test-storage.js     ← storage layer tests
    │   ├── test-themes.js     ← theme system tests
    │   ├── runner-integration.html ← async integration test runner
    │   ├── test-runner-async.js    ← async-aware test framework
    │   └── test-integration.js     ← integration tests (save/load/version/theme)
    └── docs/
        └── superpowers/
            ├── specs/           ← design specifications
            └── plans/           ← implementation plans
```

### Script Load Order
Scripts load via `<script>` tags in index.html. Order matters — dependencies must load first:
1. **Foundation:** constants.js → app-state.js (Store) → utils.js → ui-core.js
2. **Data layer:** schema.js → data-helpers.js → persistence.js → storage.js
3. **Theme layer:** themes.js
4. **Skin renderers:** skin-band.js → skin-grid.js → skin-cards.js → skin-phases.js
5. **UI layer:** library.js → versions.js
6. **Core rendering:** render.js → workbook-ui.js → print.js
7. **Interaction:** events.js → inspector.js
8. **Data + Init:** data/scheduledata.js → init.js (must be last)

Note: skin files and render.js have a mutual runtime dependency (skins call render's dagger footnote functions; render dispatches to skin renderDayBody functions). All load before any rendering occurs.

### State Management
All app state flows through the `Store` object in `app-state.js`. The Store holds the schedule's days, events, groups, notes, and UI state (active day, selected event, undo/redo stacks). Backward-compatible `window` property aliases allow existing code to read/write globals — these proxy to Store internals via `Object.defineProperty`.

### Data Persistence
Primary mode is the **workbook flow**: one `.schedule` JSON file the user picks via
`showSaveFilePicker()`/`showOpenFilePicker()`. Once a file handle is attached, auto-save
(2-second debounce) writes every edit back to it. The handle (+ name/savedAt) is persisted
in IndexedDB (`DayScheduleDB`, key `workbookFile`) so the start screen can offer the
**Continue card**: session draft (priority — newest state, and the only route back into an
unsaved draft) → remembered file handle ("Welcome back · Reopen") → hidden. Permission is
re-requested lazily; silent auto-saves never pop a permission prompt. "Start fresh" must
call `clearScheduleWorkbookTarget()` — a stale handle would silently overwrite the
previously opened file.

Safety nets: sessionStorage crash recovery underneath every edit; a `beforeunload` warning
when `isDirty()`; a one-time first-save note (localStorage `dayschedule_first_save_noted`)
telling users their workbook is a local file. Legacy directory mode (shared `data/` folder
via `showDirectoryPicker()`) still exists behind `hasDirectoryAccess()`.

Fallback: browsers without FSAPI (Safari, Firefox) run in legacy mode with download-based
export (each save downloads a fresh copy; the fallback banner says so plainly). Named
versions are embedded in each schedule's JSON file.

Loading priority on boot: IndexedDB directory handle → `data/scheduledata.js`
(legacy migration) → `sessionStorage` (crash recovery) → **start screen, empty**.
Sample data is never auto-loaded into an editable schedule (users mistook it for their
own work and saved it into real workbook files); `loadSampleData()` exists for tests only.

`APP_VERSION` in constants.js is `'dev'` in source; the build script stamps the build
date into dist (fail-loud guard, like the CSP rewrite). The Help modal displays it —
first question for any bug report, since stale distributed copies are the most common
cause of "the buttons don't work" reports.

### Data Locality (hard requirement)
The app must remain **zero-egress**: schedule data may be sensitive, and nothing ever
leaves the user's machine. Deployment model is one-way — GitHub Pages serves the static
files, the browser downloads them, and all data stays local (FSAPI files on disk,
IndexedDB, sessionStorage).

Enforced three ways — keep all of them intact:
1. **CSP meta tag** in `app/index.html`: `connect-src 'none'` makes the browser refuse
   all outbound requests (fetch/XHR/WebSocket/beacon), `img-src` allows only local/data:/
   blob: sources, `form-action 'none'` blocks form posts. The build script rewrites
   script-src/style-src to `'unsafe-inline'` for the bundled dist file and **fails the
   build** if the CSP tag is missing.
2. **No external resources**: no CDNs, no web fonts, no analytics, no network APIs
   anywhere in app code. All `<script>`/`<link>` references are relative paths.
3. **Git hygiene**: `*.schedule` and `app/data/*.json` are gitignored — the repo is
   public and is the Pages site, so committed data is published data. The build script
   independently refuses to bundle operational data into the app shell.

Adding any feature that needs the network requires explicitly revisiting this section.
Verification: use the app with networking disabled (airplane mode) — everything must
work identically; DevTools Network tab shows nothing after initial page load.

### Print Layout System
The print system renders schedules as horizontal band layouts. Events are organized into three visual tiers based on duration and importance. Concurrent event detection identifies overlapping time ranges and stacks them into rows. Adaptive scaling adjusts band heights and font sizes to fit the available page area, ensuring the schedule prints cleanly without manual intervention.

Dense-day behavior diverges by medium: **print** uses the three compression stages then a
zoom fallback to fit the paper; **screen** uses the compression stages then stretches the
page to the content height (`min-height = contentH`) — never zoom. Bands positions events
absolutely, so the page cannot grow on its own; microscopic-but-fits is worse than a tall,
readable page. The bands density warning (with working skin-switch buttons) steers users
to Grid/Cards/Phases for dense days.

## Known Issues
<!-- Track recurring bugs or browser quirks here so agents can reference them -->
- (none yet)
