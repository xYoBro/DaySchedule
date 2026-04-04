const TestRunner = (() => {
  const suites = [];
  let currentSuite = null;

  function describe(name, fn) {
    currentSuite = { name, tests: [], pass: 0, fail: 0 };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  }

  function it(name, fn) {
    if (!currentSuite) throw new Error('it() must be inside describe()');
    try {
      fn();
      currentSuite.tests.push({ name, passed: true });
      currentSuite.pass++;
    } catch (e) {
      currentSuite.tests.push({ name, passed: false, error: e.message });
      currentSuite.fail++;
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  assert.equal = (a, b, msg) => {
    if (a !== b) throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to equal ' + JSON.stringify(b));
  };

  assert.deepEqual = (a, b, msg) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to deep-equal ' + JSON.stringify(b));
  };

  assert.throws = (fn, msg) => {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(msg || 'Expected function to throw');
  };

  function run() {
    const el = document.getElementById('results');
    const sum = document.getElementById('summary');
    let totalPass = 0, totalFail = 0;
    let html = '';
    for (const s of suites) {
      totalPass += s.pass;
      totalFail += s.fail;
      html += '<div class="suite"><h3>' + s.name + ' (' + s.pass + '/' + (s.pass + s.fail) + ')</h3>';
      for (const t of s.tests) {
        html += '<div class="result ' + (t.passed ? 'pass' : 'fail') + '">'
          + (t.passed ? '\u2713' : '\u2717') + ' ' + t.name
          + (t.error ? ' \u2014 ' + t.error : '') + '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
    sum.innerHTML = '<span class="' + (totalFail ? 'fail' : 'pass') + '">'
      + totalPass + ' passed, ' + totalFail + ' failed</span>';
  }

  window.describe = describe;
  window.it = it;
  window.assert = assert;
  return { run };
})();
