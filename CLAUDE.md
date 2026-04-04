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
├── index.html              ← app shell
├── CLAUDE.md
├── css/
│   └── style.css           ← all styles (screen + print)
├── js/
│   ├── constants.js        ← default groups, color palette, layout targets
│   ├── app-state.js        ← Store object + global state
│   ├── utils.js            ← generateId, esc, timeToMinutes, formatDuration
│   ├── ui-core.js          ← modal, toast, dropdown primitives
│   ├── schema.js           ← normalizeEvent, normalizeGroup, normalizeNote, normalizeDay
│   ├── data-helpers.js     ← eventsOverlap, classifyEvents, computeDuration
│   ├── persistence.js      ← FSAPI save, session storage, undo/redo
│   ├── render.js           ← renderDay(), band HTML generation, concurrent row
│   ├── print.js            ← print layout engine, adaptive scaling
│   ├── events.js           ← click handlers, keyboard shortcuts
│   ├── editing.js          ← inline event editor, add/delete, auto-sort
│   ├── groups.js           ← group management modal
│   ├── schedule-setup.js   ← schedule config, day tabs, notes, toolbar wiring
│   └── init.js             ← sample data and initialization (loads last)
├── data/
│   └── scheduledata.js     ← externalized state (SAVED_STATE)
├── tests/
│   ├── runner.html         ← open in browser to run all tests
│   ├── test-runner.js      ← minimal assertion library
│   ├── test-utils.js       ← utility function tests
│   ├── test-schema.js      ← schema normalization tests
│   ├── test-data-helpers.js ← overlap detection, classification tests
│   └── test-store.js       ← Store state management tests
└── docs/
    └── superpowers/
        ├── specs/           ← design specifications
        └── plans/           ← implementation plans
```

### Script Load Order
Scripts load via `<script>` tags in index.html. Order matters — dependencies must load first:
1. **Foundation:** constants.js → app-state.js (Store) → utils.js → ui-core.js
2. **Data layer:** schema.js → data-helpers.js → persistence.js
3. **Rendering:** render.js → print.js
4. **UI:** events.js → editing.js → groups.js → schedule-setup.js
5. **Data + Init:** data/scheduledata.js → init.js (must be last)

### State Management
All app state flows through the `Store` object in `app-state.js`. The Store holds the schedule's days, events, groups, notes, and UI state (active day, selected event, undo/redo stacks). Backward-compatible `window` property aliases allow existing code to read/write globals — these proxy to Store internals via `Object.defineProperty`.

### Data Persistence
Three-tier loading priority: `data/scheduledata.js` (external file via `SAVED_STATE`) → `sessionStorage` (crash recovery) → sample data. Save writes to `scheduledata.js` via File System Access API (Chrome/Edge) with download fallback.

### Print Layout System
The print system renders schedules as horizontal band layouts. Events are organized into three visual tiers based on duration and importance. Concurrent event detection identifies overlapping time ranges and stacks them into rows. Adaptive scaling adjusts band heights and font sizes to fit the available page area, ensuring the schedule prints cleanly without manual intervention.

## Known Issues
<!-- Track recurring bugs or browser quirks here so agents can reference them -->
- (none yet)
