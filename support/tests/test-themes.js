describe('Themes — palette definitions', () => {
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

  it('PALETTE_NAMES has all 5 presets', () => {
    assert.equal(PALETTE_NAMES.length, 5);
  });
});
