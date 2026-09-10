describe('utils — timeToMinutes', () => {
  it('converts 0700 to 420', () => { assert.equal(timeToMinutes('0700'), 420); });
  it('converts 1630 to 990', () => { assert.equal(timeToMinutes('1630'), 990); });
  it('converts 0000 to 0', () => { assert.equal(timeToMinutes('0000'), 0); });
  it('converts 2359 to 1439', () => { assert.equal(timeToMinutes('2359'), 1439); });
});

describe('utils — minutesToTime', () => {
  it('converts 420 to 0700', () => { assert.equal(minutesToTime(420), '0700'); });
  it('converts 990 to 1630', () => { assert.equal(minutesToTime(990), '1630'); });
  it('converts 0 to 0000', () => { assert.equal(minutesToTime(0), '0000'); });
});

describe('utils — formatDuration', () => {
  it('formats 30 min', () => { assert.equal(formatDuration(30), '30 min'); });
  it('formats 60 min as 1 hr', () => { assert.equal(formatDuration(60), '1 hr'); });
  it('formats 90 min as 1.5 hrs', () => { assert.equal(formatDuration(90), '1.5 hrs'); });
  it('formats 120 min as 2 hrs', () => { assert.equal(formatDuration(120), '2 hrs'); });
});

describe('utils — generateId', () => {
  it('returns a string starting with the prefix', () => {
    const id = generateId('evt');
    assert(id.startsWith('evt'), 'should start with prefix');
  });
  it('returns unique values', () => {
    const a = generateId('x'), b = generateId('x');
    assert(a !== b, 'should be unique');
  });
});

describe('utils — esc', () => {
  it('escapes HTML entities', () => {
    assert.equal(esc('<b>"hi"&</b>'), '&lt;b&gt;&quot;hi&quot;&amp;&lt;/b&gt;');
  });
  it('handles empty string', () => { assert.equal(esc(''), ''); });
  it('handles null/undefined', () => { assert.equal(esc(null), ''); });
});

describe('utils — getContrastingTextColor', () => {
  it('uses ink that meets AA on middle gray, including short and alpha hex', () => {
    ['#808080', '#888', '#808080ff'].forEach(bg => {
      assert(getColorContrast(getContrastingTextColor(bg), bg) >= 4.5, bg + ' must have readable ink');
    });
  });
  it('composites transparent text over its actual background before contrast', () => {
    assert.equal(getColorContrast('#0000', '#000000'), 1);
    assert.equal(getColorContrast('#fff0', '#ffffff'), 1);
  });
  it('returns dark text for light backgrounds', () => {
    assert.equal(getContrastingTextColor('#fff3a0'), '#1d1d1f');
  });

  it('returns white text for dark backgrounds', () => {
    assert.equal(getContrastingTextColor('#1f3a5f'), '#ffffff');
  });

  it('supports shorthand hex colors', () => {
    assert.equal(getContrastingTextColor('#ff0'), '#1d1d1f');
  });
});

describe('utils — esc attribute contexts', () => {
  it('escapes single quotes', () => {
    assert.equal(esc("O'Neil"), 'O&#39;Neil');
  });
});

describe('utils — formatDuration guards', () => {
  it('returns empty string for NaN', () => {
    assert.equal(formatDuration(NaN), '');
  });
  it('returns empty string for negative durations', () => {
    assert.equal(formatDuration(-15), '');
  });
});

describe('utils — local error log', () => {
  it('records errors newest-first and survives a round trip', () => {
    localStorage.removeItem('dayschedule_error_log');
    logAppError('error', 'first failure', 'a.js:1');
    logAppError('error', 'second failure', 'b.js:2');
    const log = getAppErrorLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].message, 'second failure');
    assert.equal(log[1].source, 'a.js:1');
    localStorage.removeItem('dayschedule_error_log');
  });
  it('returns an empty array when nothing is recorded', () => {
    localStorage.removeItem('dayschedule_error_log');
    assert.deepEqual(getAppErrorLog(), []);
  });
});

describe('utils — formatDuration precision', () => {
  it('formats 75 min as 1.25 hrs, not 1.3', () => { assert.equal(formatDuration(75), '1.25 hrs'); });
  it('formats 100 min as 1.67 hrs', () => { assert.equal(formatDuration(100), '1.67 hrs'); });
  it('still formats 90 min as 1.5 hrs', () => { assert.equal(formatDuration(90), '1.5 hrs'); });
});
