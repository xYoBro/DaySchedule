---
name: print-test
description: Run print layout verification tests for the Schedule Builder. Generates PDFs via Playwright, checks page counts, takes screenshots, and validates DOM structure.
disable-model-invocation: true
---

# Print Test — Schedule Builder

Run print layout tests to verify every schedule day prints on exactly one page.

## Prerequisites
- Playwright MCP tools must be available
- Python 3 must be installed (for PDF page counting)

## Steps

### 1. Start HTTP server

Start a local server in the project directory:

```bash
cd /Users/adknott/Desktop/Schedule
python3 -m http.server 8787 &
SERVER_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/index.html
```

If the server fails to start (port in use), try port 8788, then 8789.

### 2. Ensure screenshot directory exists

```bash
mkdir -p tests/print-screenshots
```

Also add to .gitignore if not already present:

```bash
grep -q 'tests/print-screenshots' .gitignore || echo 'tests/print-screenshots/' >> .gitignore
```

### 3. Read test case definitions

Read the test cases from `tests/print-test-data.js`. This file defines `PRINT_TEST_CASES` — an array of `{ name, expectedPages, setupFn }` objects.

### 4. Dispatch the generic print test agent

Use the Agent tool to invoke `print-test` (the global agent at `~/.claude/agents/print-test.md`) with:

- **url**: `http://localhost:8787/index.html`
- **screenshotDir**: `tests/print-screenshots/`
- **testCases**: The `PRINT_TEST_CASES` array from step 3

The multi-day test case is special: its `expectedPages` is 3 (one per day). For that case, the setupFn loads multi-day data. The agent should use `printAllDays()` flow for that case (the setupFn handles this by calling the right render function).

Wait for the agent to complete and capture its results.

### 5. Run structural checks

For each non-multi-day test case, navigate to the URL, run the setupFn again, then verify DOM structure using `browser_evaluate`:

```javascript
() => {
  const checks = {};
  // Header
  const hdr = document.querySelector('.hdr');
  checks.headerPresent = !!hdr;
  checks.titleNotEmpty = hdr ? hdr.querySelector('.hdr-title')?.textContent.trim().length > 0 : false;

  // Events
  checks.bandCount = document.querySelectorAll('.band[data-event-id]').length;

  // Notes
  const notes = document.querySelector('.notes');
  checks.notesPresent = !!notes;
  checks.noteCount = notes ? notes.querySelectorAll('.notes-list li').length : 0;

  // Concurrent
  const conc = document.querySelector('.conc-section');
  checks.concurrentPresent = !!conc;
  checks.concurrentCount = conc ? conc.querySelectorAll('.conc-item').length : 0;

  // Footer
  const footer = document.querySelector('.footer');
  checks.footerPresent = !!footer;
  checks.footerNotEmpty = footer ? footer.textContent.trim().length > 0 : false;

  // No negative durations
  const durs = Array.from(document.querySelectorAll('.t-dur'));
  checks.noNegativeDurations = durs.every(d => !d.textContent.includes('-'));

  return checks;
}
```

Compare results against expected values per test case:

| Case | Expected bands | Expected notes | Concurrent expected |
|------|---------------|----------------|-------------------|
| sample | 15 | 7 | yes (4 items) |
| heavy-events | 22 | 3 | no |
| heavy-notes | 8 | 12 | no |
| many-concurrent | 6 | 1 | yes (8 items) |
| minimal | 1 | 0 | no |

### 6. Report results

Output a combined report:

```
Schedule Builder Print Test Results
════════════════════════════════════

Print Layout (PDF page count)
─────────────────────────────
✓ sample              1/1 pages
✓ heavy-events        1/1 pages
✓ heavy-notes         1/1 pages
✓ many-concurrent     1/1 pages
✓ minimal             1/1 pages
✓ multi-day           3/3 pages

Structural Checks
─────────────────
✓ sample           header ✓  bands:15 ✓  notes:7 ✓  concurrent:4 ✓  footer ✓  durations ✓
✓ heavy-events     header ✓  bands:22 ✓  notes:3 ✓  concurrent:0 ✓  footer ✓  durations ✓
✓ heavy-notes      header ✓  bands:8 ✓   notes:12 ✓ concurrent:0 ✓  footer ✓  durations ✓
✓ many-concurrent  header ✓  bands:6 ✓   notes:1 ✓  concurrent:8 ✓  footer ✓  durations ✓
✓ minimal          header ✓  bands:1 ✓   notes:0 ✓  concurrent:0 ✓  footer ✓  durations ✓

Screenshots: tests/print-screenshots/

All tests passed.
```

### 7. Clean up

Kill the HTTP server:

```bash
kill $SERVER_PID 2>/dev/null
# Or if PID was lost:
lsof -ti:8787 | xargs kill 2>/dev/null
```

Close the Playwright browser.
