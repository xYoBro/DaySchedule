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
