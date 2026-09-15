describe('Themes — palette definitions', () => {
  it('keeps ordinary and muted text readable on both preset surfaces', () => {
    Object.entries(PALETTES).forEach(([name, colors]) => {
      ['text', 'textSecondary', 'textMuted'].forEach(key => {
        ['bg', 'surface'].forEach(surface => {
          assert(getColorContrast(colors[key], colors[surface]) >= 4.5, name + ' ' + key + ' on ' + surface);
        });
      });
    });
  });
  it('PALETTES contains all 5 presets', () => {
    assert(PALETTES.classic, 'classic');
    assert(PALETTES.airforce, 'airforce');
    assert(PALETTES.ocp, 'ocp');
    assert(PALETTES.darkops, 'darkops');
    assert(PALETTES.mono, 'mono');
  });

  it('each palette has required color keys', () => {
    const keys = ['bg', 'text', 'textSecondary', 'textMuted', 'accent', 'accentSecondary', 'accentTertiary', 'border', 'surface'];
    Object.keys(PALETTES).forEach(name => {
      keys.forEach(key => {
        assert(PALETTES[name][key] !== undefined, name + ' missing ' + key);
      });
    });
  });
});

describe('Themes — getScheduleTheme', () => {
  it('returns defaults when no theme set', () => {
    const theme = getScheduleTheme(undefined);
    assert.equal(theme.skin, 'bands');
    assert.equal(theme.palette, 'classic');
    assert.equal(theme.customColors, null);
  });

  it('returns provided values', () => {
    const theme = getScheduleTheme({ skin: 'grid', palette: 'ocp', customColors: { accent: '#ff0000' } });
    assert.equal(theme.skin, 'grid');
    assert.equal(theme.palette, 'ocp');
    assert.equal(theme.customColors.accent, '#ff0000');
  });

  it('fills missing fields with defaults', () => {
    const theme = getScheduleTheme({ skin: 'cards' });
    assert.equal(theme.skin, 'cards');
    assert.equal(theme.palette, 'classic');
    assert.equal(theme.customColors, null);
  });
});

describe('Themes — SKIN_NAMES and PALETTE_NAMES', () => {
  it('SKIN_NAMES has all 4 skins', () => {
    assert.equal(SKIN_NAMES.length, 4);
    assert(SKIN_NAMES.includes('bands'));
    assert(SKIN_NAMES.includes('grid'));
    assert(SKIN_NAMES.includes('cards'));
    assert(SKIN_NAMES.includes('phases'));
  });

  it('PALETTE_NAMES preserves existing presets and adds paper varieties', () => {
    assert.equal(PALETTE_NAMES.length, 11);
    ['forest', 'teal', 'slate', 'plum', 'burgundy', 'copper'].forEach(name => assert(PALETTE_NAMES.includes(name)));
  });
});

describe('Themes — getScheduleTheme whitelisting', () => {
  it('falls back to bands for unknown or injected skin values', () => {
    assert.equal(getScheduleTheme({ skin: 'x"><img src=x onerror=alert(1)>' }).skin, 'bands');
    assert.equal(getScheduleTheme({ skin: 'constructor' }).skin, 'bands');
  });
  it('falls back to classic for unknown palettes but allows custom', () => {
    assert.equal(getScheduleTheme({ palette: 'neon' }).palette, 'classic');
    assert.equal(getScheduleTheme({ palette: 'custom' }).palette, 'custom');
  });
  it('drops non-hex custom colors and keeps valid ones', () => {
    const theme = getScheduleTheme({ customColors: { accent: 'url(evil)', bg: '#ffffff' } });
    assert.equal(theme.customColors.accent, undefined);
    assert.equal(theme.customColors.bg, '#ffffff');
  });
});
