/* ── themes.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   PALETTES             — Object<string, PaletteColors>  11 preset palettes
 *   PALETTE_NAMES        — Array<string>                  ["classic", "airforce", ...]
 *   SKIN_NAMES           — Array<string>                  ["bands", "grid", "cards", "phases"]
 *   SKIN_LABELS          — Object<string, {name, desc}>   Display names for skins
 *   PALETTE_LABELS       — Object<string, string>         Display names for palettes
 *   getScheduleTheme(t)  → {skin, palette, customColors}  Fills defaults for missing fields
 *   applyPalette(palette, customColors) — sets CSS vars on :root for schedule colors
 *   applyEditorTheme(theme) — sets data-editor-theme on body, saves to localStorage
 *   getEditorTheme()     → string ("light"|"dark")
 *
 * REQUIRES: nothing
 *
 * CONSUMED BY:
 *   render.js, inspector.js, init.js, library.js
 * ──────────────────────────────────────────────────────────────────────────── */

const PALETTES = {
  classic: {
    bg: '#ffffff',
    text: '#1d1d1f',
    textSecondary: '#48484a',
    textMuted: '#6e6e73',
    accent: '#2558a8',
    accentSecondary: '#b06a10',
    accentTertiary: '#4a5568',
    border: '#f0f0f2',
    surface: '#f8f8fa',
  },
  airforce: {
    bg: '#f5f7fa',
    text: '#00308F',
    textSecondary: '#2c3e5a',
    textMuted: '#576777',
    accent: '#00308F',
    accentSecondary: '#B8860B',
    accentTertiary: '#708090',
    border: '#d8dde5',
    surface: '#eef1f6',
  },
  ocp: {
    bg: '#f5f2ec',
    text: '#3d3929',
    textSecondary: '#5a5040',
    textMuted: '#6d6249',
    accent: '#5a6f52',
    accentSecondary: '#8b7d5e',
    accentTertiary: '#6b6353',
    border: '#ddd8ce',
    surface: '#ece8df',
  },
  darkops: {
    bg: '#1a1a2e',
    text: '#e0e0f0',
    textSecondary: '#b0b0cc',
    textMuted: '#9999b6',
    accent: '#5b8def',
    accentSecondary: '#e8a849',
    accentTertiary: '#6b6b8a',
    border: '#333355',
    surface: '#252545',
  },
  mono: {
    bg: '#ffffff',
    text: '#333333',
    textSecondary: '#555555',
    textMuted: '#666666',
    accent: '#333333',
    accentSecondary: '#777777',
    accentTertiary: '#aaaaaa',
    border: '#dddddd',
    surface: '#f5f5f5',
  },
};

// Keep deployed palettes and add the approved paper color families.
const PALETTE_NAMES = ['classic', 'airforce', 'ocp', 'darkops', 'mono', 'forest', 'teal', 'slate', 'plum', 'burgundy', 'copper'];

const PALETTE_LABELS = {
  classic: 'Classic',
  airforce: 'Air Force',
  ocp: 'OCP',
  darkops: 'Dark Ops',
  mono: 'Mono',
};

for (const key of ['forest', 'teal', 'slate', 'plum', 'burgundy', 'copper']) {
  const paper = BAND_PAPER_THEMES[key];
  PALETTES[key] = { bg: '#ffffff', text: '#20262c', textSecondary: '#39424b', textMuted: '#525962',
    accent: paper.colors[0], accentSecondary: paper.colors[8], accentTertiary: paper.colors[1], border: paper.colors[5], surface: paper.colors[2] };
  PALETTE_LABELS[key] = paper.label;
}

const SKIN_NAMES = ['bands', 'grid', 'cards', 'phases'];

const SKIN_LABELS = {
  bands: { name: 'Bands', desc: 'Main track + concurrent' },
  grid: { name: 'Grid', desc: 'Time \u00d7 groups' },
  cards: { name: 'Cards', desc: 'Group detail' },
  phases: { name: 'Phases', desc: 'Field exercises' },
};

// File-supplied theme values are untrusted (they bypass event/group
// normalization), and skin lands in HTML class strings while colors land in
// CSS custom properties — whitelist everything here, the one funnel every
// consumer reads through.
const THEME_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function sanitizeCustomColors(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const colors = {};
  let any = false;
  Object.keys(PALETTES.classic).forEach(key => {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : '';
    if (THEME_COLOR_RE.test(value)) {
      colors[key] = value;
      any = true;
    }
  });
  return any ? colors : null;
}

function getScheduleTheme(t) {
  const palette = t && t.palette;
  return {
    skin: (t && SKIN_NAMES.indexOf(t.skin) !== -1) ? t.skin : 'bands',
    palette: (palette === 'custom' || PALETTE_NAMES.indexOf(palette) !== -1) ? palette : 'classic',
    customColors: sanitizeCustomColors(t && t.customColors),
  };
}

function applyPalette(paletteName, customColors) {
  const base = PALETTES[paletteName] || PALETTES.classic;
  const colors = customColors ? Object.assign({}, base, customColors) : base;
  const root = document.documentElement;
  root.style.setProperty('--sch-bg', colors.bg);
  root.style.setProperty('--sch-text', colors.text);
  root.style.setProperty('--sch-text-secondary', colors.textSecondary);
  root.style.setProperty('--sch-text-muted', colors.textMuted);
  root.style.setProperty('--sch-accent', colors.accent);
  root.style.setProperty('--sch-accent-secondary', colors.accentSecondary);
  root.style.setProperty('--sch-accent-tertiary', colors.accentTertiary);
  root.style.setProperty('--sch-border', colors.border);
  root.style.setProperty('--sch-surface', colors.surface);
}

const EDITOR_THEME_KEY = 'dayschedule_editor_theme';

function getEditorTheme() {
  try { return localStorage.getItem(EDITOR_THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch (e) { return document.body.getAttribute('data-editor-theme') === 'dark' ? 'dark' : 'light'; }
}

function applyEditorTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-editor-theme', t);
  try { localStorage.setItem(EDITOR_THEME_KEY, t); }
  catch (e) { console.warn('Editor theme will last for this page only:', e); }
}
