/* ── themes.js ── Contract ────────────────────────────────────────────────
 *
 * EXPORTS:
 *   PALETTES             — Object<string, PaletteColors>  5 preset palettes
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
    textMuted: '#86868b',
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
    textMuted: '#708090',
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
    textMuted: '#8b7d5e',
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
    textMuted: '#6b6b8a',
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
    textMuted: '#888888',
    accent: '#333333',
    accentSecondary: '#777777',
    accentTertiary: '#aaaaaa',
    border: '#dddddd',
    surface: '#f5f5f5',
  },
};

const PALETTE_NAMES = ['classic', 'airforce', 'ocp', 'darkops', 'mono'];

const PALETTE_LABELS = {
  classic: 'Classic',
  airforce: 'Air Force',
  ocp: 'OCP',
  darkops: 'Dark Ops',
  mono: 'Mono',
};

const SKIN_NAMES = ['bands', 'grid', 'cards', 'phases'];

const SKIN_LABELS = {
  bands: { name: 'Bands', desc: 'Main track + concurrent' },
  grid: { name: 'Grid', desc: 'Time \u00d7 groups' },
  cards: { name: 'Cards', desc: 'Group detail' },
  phases: { name: 'Phases', desc: 'Field exercises' },
};

function getScheduleTheme(t) {
  return {
    skin: (t && t.skin) || 'bands',
    palette: (t && t.palette) || 'classic',
    customColors: (t && t.customColors) || null,
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
  return localStorage.getItem(EDITOR_THEME_KEY) || 'light';
}

function applyEditorTheme(theme) {
  const t = theme || 'light';
  document.body.setAttribute('data-editor-theme', t);
  localStorage.setItem(EDITOR_THEME_KEY, t);
}
