# Themes & Layout Skins — Design Spec

**Date:** 2026-04-11
**Problem:** The current band layout handles ~80% of drill weekend schedules well, but breaks down when 4+ groups do different training simultaneously with dense per-event metadata (location, equipment, roles). Additionally, the app has no visual customization — one look for every schedule, every user.
**Solution:** A theme system with two independent axes: layout skins (how information is structured) and color palettes (how it looks). Per-schedule, mix-and-match. Plus a global editor chrome theme for personal preference.

---

## 1. Layout Skins

Four skins, each optimized for a different schedule complexity. All share the same underlying data model (days, events, groups, notes). The user picks a skin per-schedule in Settings → Appearance.

### Bands (Default)
The current layout. Horizontal bands with a time column on the left, content in the middle, concurrent event slot on the right. Shared events get full-width main bands. Limited-scope groups appear as concurrent indicators or in the "Also Happening" row.

**Best for:** Schedules with a clear main track and a few concurrent events. The 80% case — typical RSD with formation, training blocks, lunch, EOD.

**Renders:** header, main bands (sorted by time), section breaks around breaks, concurrent indicators inline, "Also Happening" row, notes, footer.

### Grid
Time rows × group columns matrix. Each cell shows what a specific group is doing during that time block. Shared events (formation, lunch, EOD) span all columns as full-width banner rows with high contrast — visually interrupting the column flow to signal "everyone stops here."

**Best for:** 4+ groups doing different training simultaneously. The user finds their group by scanning one column. Enables cross-group time comparison.

**Renders:** header, column headers (one per group, color-coded), time rows with per-group cells, banner rows for shared events, notes, footer.

**Cell content:** Title (primary line), location + equipment (secondary line, smaller text). If metadata exceeds cell space, abbreviations with a legend in the footer.

### Cards
Shared events rendered as a compact timeline banner across the top of the page. Below it, each group gets a dedicated card/panel containing their chronological event list with full metadata — title, time, location, equipment, requirements, roles.

**Best for:** Groups operating independently with lots of per-event metadata. No abbreviations needed. Sacrifices cross-group time alignment for full detail display.

**Renders:** header, shared event timeline banner, group cards (arranged in a 2-column grid for 4 groups, 3-column for 6), each card lists events chronologically with full fields, notes, footer.

**Card layout:** Group name + color header, then event blocks with: time (bold), title, location, equipment, roles as labeled fields.

### Phases
Named phase blocks as the primary organizing axis instead of clock times. Phases (SP, LD, OBJ Rally, OBJ, ENDEX, etc.) contain tasks, conditions, and actions. Optional time estimates per phase but not required.

**Best for:** Field exercises, convoy operations, OPORD-structured events, mission rehearsals. Anything where "Phase 2: Movement to Contact" is more meaningful than "0900-1030."

**Renders:** header, phase blocks (each with phase name, optional time window, conditions/triggers), nested task list under each phase (with assignments, equipment, actions), transition markers between phases, notes, footer.

**Phase block content:** Phase name (prominent), time window if applicable, conditions ("On order" / "NLT 0900" / "On completion of Phase 1"), task list with group assignments.

---

## 2. Color Palettes

Five curated presets plus custom. Any palette works with any skin. Palettes control: page background, text colors, accent colors, band/cell fills, header styling, border colors, group color overrides.

### Classic (Default)
White background, dark text (#1d1d1f). Blue primary accent (#2558a8), orange secondary (#b06a10), gray tertiary (#4a5568). Current app colors — no change from today.

### Air Force
Light blue-gray background (#f5f7fa). AF blue primary (#00308F), gold secondary (#B8860B), slate gray tertiary (#708090). Formal, institutional feel.

### OCP
Warm off-white background (#f5f2ec). Olive primary (#5a6f52), tan secondary (#8b7d5e), brown tertiary (#6b6353). Subdued, field-appropriate.

### Dark Ops
Dark background (#1a1a2e). Bright blue primary (#5b8def), amber secondary (#e8a849), muted purple tertiary (#6b6b8a). High contrast, easy on eyes in low-light.

### Mono
White background. Black primary (#333333), medium gray secondary (#777777), light gray tertiary (#aaaaaa). Maximum print compatibility — no color ink required.

### Custom
User picks individual colors for: accent (primary), background, text, secondary text. Saved in the schedule JSON. Overrides the selected preset while keeping the same structure.

---

## 3. Editor Chrome Themes

Separate from schedule palettes. Controls the toolbar, library view, inspector panel, and modals.

- **Light** — current look. White toolbar, light gray page background (#c8c8cc), dark text.
- **Dark** — dark toolbar, dark page background, light text. All UI elements inverted.

Stored in `localStorage` key `dayschedule_editor_theme`. Values: `"light"` (default) or `"dark"`.

Toggle accessible from:
- Library header (next to the "?" help button)
- Editor toolbar overflow menu

The editor chrome theme does NOT affect the printed schedule. Print always uses the schedule's palette.

---

## 4. Settings UI

### Per-Schedule: Appearance Tab

New third tab in the Settings modal (General | Audience Groups | **Appearance**).

**Layout row:** 4 visual thumbnail cards arranged horizontally. Each card shows a miniature wireframe of the layout structure + the skin name and one-line description. Selected skin has a highlighted border. Clicking a skin re-renders the preview immediately.

**Colors row:** Below the layout row, separated by a divider. 5 preset swatches + a "+" for custom. Each swatch is a small square showing the palette's 3 accent colors on its background color. Selected palette has a highlighted border. Clicking a swatch re-renders with the new colors immediately.

**Customize colors:** A text link below the color swatches. Clicking it expands an inline panel with color picker swatches for: accent, background, text, secondary text. Changes apply live. Custom colors override the selected preset.

### Global: Editor Theme Toggle

A small toggle (Light/Dark) accessible from:
- Library header bar
- Toolbar overflow menu

Changing it applies instantly to all editor chrome. Does not trigger a schedule re-render.

---

## 5. Data Model

### Per-Schedule (in schedule JSON file)

```json
{
  "name": "May Drill",
  "theme": {
    "skin": "bands",
    "palette": "classic",
    "customColors": null
  },
  "current": { ... },
  "versions": [ ... ]
}
```

- `skin`: `"bands"` | `"grid"` | `"cards"` | `"phases"`
- `palette`: `"classic"` | `"airforce"` | `"ocp"` | `"darkops"` | `"mono"` | `"custom"`
- `customColors`: `null` (use preset) or `{ accent: "#hex", background: "#hex", text: "#hex", secondary: "#hex" }`

Schedules without a `theme` field default to `{ skin: "bands", palette: "classic", customColors: null }`.

### Global (localStorage)

```
dayschedule_editor_theme = "light" | "dark"
```

---

## 6. File Architecture

### New Files

- `js/themes.js` — palette definitions (color maps), CSS variable application, editor chrome toggle, custom color management
- `js/skin-band.js` — band layout renderer (extracted from current render.js)
- `js/skin-grid.js` — grid layout renderer
- `js/skin-cards.js` — cards layout renderer
- `js/skin-phases.js` — phase layout renderer

### Modified Files

- `js/render.js` — refactored from a 230-line renderer to a ~30-line dispatcher:
  - Reads the active schedule's `theme.skin` setting
  - Delegates to the matching `skin-*.js` renderer
  - Each skin's `renderDay()` returns HTML; render.js injects it into `#scheduleContainer`
  - `renderHeader()` and `renderFooter()` remain in render.js (shared across skins)
- `js/inspector.js` — add Appearance tab to settings modal with skin picker + color picker UI
- `js/storage.js` — read/write `theme` field in schedule JSON
- `js/print.js` — adapt print scaling per skin (each skin may have different overflow characteristics)
- `css/style.css` — CSS custom properties for all theme-able values; skin-specific CSS sections; editor dark theme overrides
- `index.html` — new script tags for themes.js and skin-*.js

### Script Load Order (updated)

```
1. Foundation: constants.js → app-state.js → utils.js → ui-core.js
2. Data layer: schema.js → data-helpers.js → persistence.js → storage.js
3. Theme layer: themes.js
4. Skin renderers: skin-band.js → skin-grid.js → skin-cards.js → skin-phases.js
5. UI layer: library.js → versions.js
6. Core rendering: render.js → print.js
7. Interaction: events.js → inspector.js
8. Data + Init: data/scheduledata.js → init.js
```

### Skin Module Contract

Every skin file must export:

```javascript
function renderDay_<skin>(dayId) → string (HTML)
```

Where `<skin>` is `band`, `grid`, `cards`, or `phases`. Each function:
- Receives a dayId
- Reads from Store (days, events, groups, notes)
- Returns complete HTML for the schedule body (everything between header and footer)
- Does NOT render header or footer (render.js handles those — they're shared)
- Uses CSS custom properties from themes.js for all colors (never hardcoded hex values)

---

## 7. CSS Architecture

### Custom Properties

All theme-able colors become CSS custom properties on `:root`:

```css
:root {
  /* Schedule palette (set by themes.js) */
  --sch-bg: #ffffff;
  --sch-text: #1d1d1f;
  --sch-text-secondary: #48484a;
  --sch-text-muted: #86868b;
  --sch-accent: #2558a8;
  --sch-accent-secondary: #b06a10;
  --sch-accent-tertiary: #4a5568;
  --sch-border: #f0f0f2;
  --sch-surface: #f8f8fa;

  /* Editor chrome (set by editor theme toggle) */
  --chrome-bg: #c8c8cc;
  --chrome-toolbar: #ffffff;
  --chrome-text: #1d1d1f;
  --chrome-border: #e5e5ea;
  --chrome-surface: #f5f5f7;
}
```

All existing hardcoded hex values in style.css are replaced with these variables. The `themes.js` module sets them on `:root` when a palette or editor theme is applied.

### Dark Editor Theme

Applied via `[data-editor-theme="dark"]` on `<body>`:

```css
[data-editor-theme="dark"] {
  --chrome-bg: #1a1a2e;
  --chrome-toolbar: #252545;
  --chrome-text: #e0e0f0;
  --chrome-border: #333355;
  --chrome-surface: #1e1e38;
}
```

### Skin-Specific CSS

Each skin gets its own CSS section in style.css, scoped by a class on `.page`:

- `.page.skin-band` — existing band styles (refactored to use CSS vars)
- `.page.skin-grid` — grid-specific layout (CSS Grid for the matrix)
- `.page.skin-cards` — card layout (flexbox/grid for card arrangement)
- `.page.skin-phases` — phase block layout

---

## 8. Migration

Existing schedules have no `theme` field. On load:
- If `theme` is missing, default to `{ skin: "bands", palette: "classic", customColors: null }`
- Existing schedules render identically to today — zero regression
- The `theme` field is only written when the user changes a setting

---

## 9. Constraints

- One printed page per day for all skins
- All skins handle: shared events, group-specific events, notes, header, footer
- All palettes work with all skins (no skin-specific color restrictions)
- Print output uses the schedule's palette, not the editor chrome theme
- Existing band layout with Classic palette must render identically to today (no regressions)
- Print scaling system adapts per skin — each skin may define its own compression stages
