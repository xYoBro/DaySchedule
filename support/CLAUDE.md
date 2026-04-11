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
│   │   ├── storage.js          ← FSAPI directory access, IndexedDB handle, auto-save, versions
│   │   ├── library.js          ← schedule library home screen, CRUD, context menu
│   │   ├── versions.js         ← version panel UI
│   │   ├── render.js           ← renderDay(), band HTML generation, concurrent row
│   │   ├── print.js            ← print layout engine, adaptive scaling
│   │   ├── events.js           ← click handlers, keyboard shortcuts
│   │   ├── inspector.js        ← inspector panel, settings modal, toolbar wiring
│   │   └── init.js             ← boot flow, migration, sample data (loads last)
│   └── data/
│       └── scheduledata.js     ← externalized state (SAVED_STATE)
└── support/                    ← docs, tests, distribution copies
    ├── CLAUDE.md
    ├── LICENSE
    ├── RSD Schedule/           ← distribution copy
    ├── tests/
    │   ├── runner.html         ← open in browser to run all tests
    │   ├── test-runner.js      ← minimal assertion library
    │   ├── test-utils.js       ← utility function tests
    │   ├── test-schema.js      ← schema normalization tests
    │   ├── test-data-helpers.js ← overlap detection, classification tests
    │   ├── test-store.js       ← Store state management tests
    │   └── test-storage.js     ← storage layer tests
    └── docs/
        └── superpowers/
            ├── specs/           ← design specifications
            └── plans/           ← implementation plans
```

### Script Load Order
Scripts load via `<script>` tags in index.html. Order matters — dependencies must load first:
1. **Foundation:** constants.js → app-state.js (Store) → utils.js → ui-core.js
2. **Data layer:** schema.js → data-helpers.js → persistence.js → storage.js
3. **UI layer:** library.js → versions.js
4. **Rendering:** render.js → print.js
5. **Interaction:** events.js → inspector.js
6. **Data + Init:** data/scheduledata.js → init.js (must be last)

### State Management
All app state flows through the `Store` object in `app-state.js`. The Store holds the schedule's days, events, groups, notes, and UI state (active day, selected event, undo/redo stacks). Backward-compatible `window` property aliases allow existing code to read/write globals — these proxy to Store internals via `Object.defineProperty`.

### Data Persistence
Schedule library with file-per-schedule JSON storage in `data/`. Uses File System Access API
`showDirectoryPicker()` to get read/write access to the `data/` folder. Directory handle is
persisted in IndexedDB across browser sessions. Auto-save (2-second debounce) writes after
every edit. Ctrl+S forces immediate save. sessionStorage runs underneath as crash recovery.

Fallback: browsers without FSAPI (Safari, Firefox) run in legacy mode with download-based
export. Named versions are embedded in each schedule's JSON file.

Three-tier loading priority on boot: IndexedDB directory handle → `data/scheduledata.js`
(legacy migration) → `sessionStorage` (crash recovery) → sample data.

### Print Layout System
The print system renders schedules as horizontal band layouts. Events are organized into three visual tiers based on duration and importance. Concurrent event detection identifies overlapping time ranges and stacks them into rows. Adaptive scaling adjusts band heights and font sizes to fit the available page area, ensuring the schedule prints cleanly without manual intervention.

## Known Issues
<!-- Track recurring bugs or browser quirks here so agents can reference them -->
- (none yet)
