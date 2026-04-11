/* ── test-runner-async.js ── Async-aware test runner for integration tests ──
 *
 * Extends the same describe/it/assert API as test-runner.js but supports
 * async test functions. Tests are collected during describe() calls, then
 * executed sequentially by runAsync().
 * ──────────────────────────────────────────────────────────────────────────── */

const AsyncTestRunner = (() => {
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
    currentSuite.tests.push({ name, fn, passed: null, error: null });
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

  async function runAsync() {
    for (const suite of suites) {
      for (const test of suite.tests) {
        try {
          const result = test.fn();
          // Await if the test returns a promise
          if (result && typeof result.then === 'function') {
            await result;
          }
          test.passed = true;
          suite.pass++;
        } catch (e) {
          test.passed = false;
          test.error = e.message;
          suite.fail++;
        }
      }
    }
    render();
  }

  function render() {
    const el = document.getElementById('results');
    const sum = document.getElementById('summary');
    let totalPass = 0, totalFail = 0;
    let html = '';
    for (const s of suites) {
      totalPass += s.pass;
      totalFail += s.fail;
      html += '<div class="suite"><h3>' + s.name + ' (' + s.pass + '/' + (s.pass + s.fail) + ')</h3>';
      for (const t of s.tests) {
        if (t.passed === null) continue; // not yet run
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

  // Expose same globals as test-runner.js
  window.describe = describe;
  window.it = it;
  window.assert = assert;
  return { runAsync };
})();
